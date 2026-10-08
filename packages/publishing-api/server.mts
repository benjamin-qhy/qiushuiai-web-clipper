import type { State, Computer, Credential, Pairing, Executor, Account } from './model.mts'
import { resolveTarget } from './targets.mts'
import { taskRoute } from './tasks.mts'
import { ApiError, fail, hash, text, fields, canonical } from './protocol.mts'
import { assetRoute, receiveAsset, type Asset } from './assets.mts'
import { createReadStream } from 'node:fs'
import { unlinkSync, renameSync } from 'node:fs'
import { capabilities } from './capabilities.mts'
import { createServer, type IncomingMessage } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

interface Options { directory: string; adminKey: string; port?: number; host?: string; now?: () => number; maxAssetBytes?: number }
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) fail(413, 'BODY_TOO_LARGE', '请求超过 64 KiB')
    chunks.push(chunk)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch { return fail(400, 'INVALID_JSON', '请求必须为 JSON 对象') }
}
function makeKey(state: State, role: Credential['role'], name: string, executorId?: string) {
  const key = randomBytes(32).toString('base64url')
  const credential = { id: randomUUID(), hash: hash(key), role, name, executorId, revoked: false }
  state.keys.push(credential)
  return { keyId: credential.id, key }
}

function seal(value: unknown, secret: Buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}
function unseal(value: string, secret: Buffer): { status: number; result: { keyId?: string } } {
  const bytes = Buffer.from(value, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
}

export async function startServer({ directory, adminKey, port = 43129, host = '127.0.0.1', now = Date.now, maxAssetBytes = 512 * 1024 * 1024 }: Options) {
  if (!Number.isSafeInteger(maxAssetBytes) || maxAssetBytes <= 0) throw new Error('素材上传上限必须为正整数')
  if (adminKey.length < 32) throw new Error('HAIQIAI_ADMIN_KEY 至少需要 32 字符')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const secretPath = join(directory, 'receipt.key')
  try { writeFileSync(secretPath, randomBytes(32), { flag: 'wx', mode: 0o600 }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const secret = readFileSync(secretPath)
  const databasePath = join(directory, 'publishing.sqlite')
  const db = new DatabaseSync(databasePath)
  chmodSync(databasePath, 0o600)
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
  db.exec('CREATE TABLE IF NOT EXISTS receipts (scope TEXT PRIMARY KEY, digest TEXT NOT NULL, response TEXT NOT NULL)')
  db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify({ instanceId: randomUUID(), computers: [], executors: [], keys: [], pairings: [], accounts: [] }))
  const server = createServer(async (req, res) => {
    const requestId = randomUUID()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    let transaction = false
    let upload: Awaited<ReturnType<typeof receiveAsset>> | undefined
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const path = url.pathname
      if (req.method === 'PUT' && /^\/v1\/assets\/[^/]+\/content$/.test(path)) {
        const before: State = JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get()!.value as string)
        const bearer = req.headers.authorization?.replace(/^Bearer /, '') || ''
        if (hash(bearer) !== hash(adminKey) && !before.keys.some(key => key.role === 'skill' && !key.revoked && key.hash === hash(bearer))) fail(403, 'FORBIDDEN', '仅 Skill 或管理身份可以上传素材')
        if (typeof req.headers['idempotency-key'] !== 'string' || !req.headers['idempotency-key'] || req.headers['idempotency-key'].length > 200) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', '上传需要 Idempotency-Key')
        const asset = before.assets?.find(asset => asset.id === path.split('/')[3])
        if (!asset) fail(404, 'ASSET_NOT_FOUND', '素材不存在')
        upload = await receiveAsset(req, directory, asset, maxAssetBytes)
      }
      const body = req.method === 'GET' || upload ? {} : await readBody(req)
      db.exec('BEGIN IMMEDIATE'); transaction = true
      const state: State = JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get()!.value as string)
      state.assets ||= []; state.tasks ||= []; state.attempts ||= []
      const bearer = req.headers.authorization?.replace(/^Bearer /, '') || ''
      const isAdmin = timingSafeEqual(Buffer.from(hash(bearer)), Buffer.from(hash(adminKey)))
      const credential = state.keys.find(key => !key.revoked && key.hash === hash(bearer))
      if (path !== '/v1/executors/pair' && !isAdmin && !credential) fail(401, 'INVALID_KEY', '密钥无效或已撤销')
      const mutation = req.method !== 'GET'
      const idempotencyKey = req.headers['idempotency-key']
      if (mutation && (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 200)) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', '变更请求需要 Idempotency-Key')
      const identity = path === '/v1/executors/pair' ? `pair:${hash(text(body, 'pairingCode'))}` : isAdmin ? 'admin' : credential!.id
      const scope = JSON.stringify([identity, req.method, path, idempotencyKey])
      const digest = hash(canonical(upload ? { sha256: upload.sha256, sizeBytes: upload.sizeBytes } : body))
      const receipt = mutation ? db.prepare('SELECT digest, response FROM receipts WHERE scope=?').get(scope) : undefined
      if (receipt) {
        if (receipt.digest !== digest) fail(409, 'IDEMPOTENCY_CONFLICT', '相同幂等键对应不同请求内容')
        const saved = unseal(receipt.response as string, secret)
        if (path === '/v1/executors/pair' && state.keys.some(key => key.id === saved.result.keyId && key.revoked)) fail(401, 'INVALID_KEY', '该安装凭据已撤销，请重新配对')
        db.exec('COMMIT'); transaction = false
        res.writeHead(saved.status); res.end(JSON.stringify(saved.result)); return
      }
      const getExecutor = (id: string) => {
        const executor = state.executors.find(executor => executor.id === id)
        if (!executor) fail(404, 'EXECUTOR_NOT_FOUND', '安装实例不存在')
        if (!isAdmin && credential?.role !== 'skill' && credential?.executorId !== id) fail(403, 'FORBIDDEN', '不能访问其他安装实例')
        return executor
      }
      const online = (executor: Executor) => !executor.revoked && executor.lastHeartbeat !== null && now() - Date.parse(executor.lastHeartbeat) < 90_000
      const admin = () => { if (!isAdmin) fail(403, 'FORBIDDEN', '需要管理身份') }
      let result: unknown
      let status = 200
      const assets = assetRoute({ method: req.method, path, body, assets: state.assets, manager: isAdmin || credential?.role === 'skill', maxAssetBytes, canRead: id => state.tasks.some(task => task.targets.some(target => target.executorId === credential?.executorId && target.assetIds.includes(id))) })
      const taskResult = taskRoute({ method: req.method, url, body, state, credential, isAdmin, now: now() })
      if (taskResult) { result = taskResult.result; status = taskResult.status }
      else if (assets) {
        result = assets.result; status = assets.status
        if (upload) {
          const asset = state.assets.find(asset => asset.id === path.split('/')[3])!
          if (!asset.ready) { renameSync(upload.path, join(directory, 'assets', asset.id)); asset.ready = true }
          result = { assetId: asset.id, ready: true }
        }
        if (assets.download) {
          db.exec('COMMIT'); transaction = false
          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('Content-Length', assets.download.sizeBytes)
          const stream = createReadStream(join(directory, 'assets', assets.download.id))
          stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); return
        }
      } else if (req.method === 'POST' && path === '/v1/computers') {
        admin(); fields(body, ['name'])
        const computer: Computer = { id: randomUUID(), name: text(body, 'name'), version: 0, defaultProfiles: {} }
        state.computers.push(computer); result = computer; status = 201
      } else if (req.method === 'POST' && path === '/v1/keys') {
        admin(); fields(body, ['name']); result = makeKey(state, 'skill', text(body, 'name')); status = 201
      } else if (req.method === 'POST' && /^\/v1\/keys\/[^/]+\/revoke$/.test(path)) {
        admin(); fields(body, [])
        const key = state.keys.find(key => key.id === path.split('/')[3])
        if (!key) fail(404, 'KEY_NOT_FOUND', '密钥不存在')
        key.revoked = true
        const executor = state.executors.find(executor => executor.id === key.executorId)
        if (executor) executor.revoked = true
        result = { revoked: true }
      } else if (req.method === 'GET' && path === '/v1/keys') {
        admin(); result = { keys: state.keys.map(({ hash: _hash, ...key }) => key) }
      } else if (req.method === 'POST' && path === '/v1/pairing-codes') {
        admin(); fields(body, ['computerId', 'browserId', 'browserName', 'profileId', 'profileName'])
        const computerId = text(body, 'computerId')
        if (!state.computers.some(computer => computer.id === computerId)) fail(404, 'COMPUTER_NOT_FOUND', '电脑不存在')
        const browserId = body.browserId === undefined ? randomUUID() : text(body, 'browserId')
        const existingBrowser = [...state.executors, ...state.pairings].find(item => item.computerId === computerId && item.browserId === browserId)
        if (body.browserId && !existingBrowser) fail(422, 'BROWSER_NOT_FOUND', '此电脑未登记该浏览器')
        const profileId = body.profileId === undefined ? randomUUID() : text(body, 'profileId')
        const existingProfile = [...state.executors, ...state.pairings].find(item => item.computerId === computerId && item.browserId === browserId && item.profileId === profileId)
        if (body.profileId && !existingProfile) fail(422, 'PROFILE_NOT_FOUND', '此浏览器未登记该用户配置')
        if (state.executors.some(item => !item.revoked && item.computerId === computerId && item.browserId === browserId && item.profileId === profileId)) fail(409, 'PROFILE_ALREADY_PAIRED', '该配置已有安装，请先撤销旧安装')
        const code = randomBytes(24).toString('base64url')
        const pairing: Pairing = { hash: hash(code), computerId, browserId, browserName: existingBrowser?.browserName || text(body, 'browserName'), profileId, profileName: existingProfile?.profileName || text(body, 'profileName'), expiresAt: new Date(now() + 600_000).toISOString(), used: false }
        state.pairings.push(pairing); result = { code, expiresAt: pairing.expiresAt }; status = 201
      } else if (req.method === 'POST' && path === '/v1/executors/pair') {
        fields(body, ['pairingCode', 'installationId', 'extensionVersion'])
        const pairing = state.pairings.find(pair => pair.hash === hash(text(body, 'pairingCode')))
        if (!pairing || pairing.used || Date.parse(pairing.expiresAt) <= now()) fail(401, 'INVALID_PAIRING_CODE', '配对码无效、已使用或已过期')
        if (state.executors.some(item => !item.revoked && (item.installationId === body.installationId || (item.computerId === pairing.computerId && item.browserId === pairing.browserId && item.profileId === pairing.profileId)))) fail(409, 'ALREADY_PAIRED', '安装或用户配置已配对，请先撤销旧安装')
        const executor: Executor = { id: randomUUID(), computerId: pairing.computerId, browserId: pairing.browserId, browserName: pairing.browserName, profileId: pairing.profileId, profileName: pairing.profileName, installationId: text(body, 'installationId'), extensionVersion: text(body, 'extensionVersion'), lastHeartbeat: null, revoked: false }
        pairing.used = true; state.executors.push(executor)
        result = { instanceId: state.instanceId, executorId: executor.id, ...makeKey(state, 'executor', executor.profileName, executor.id), executor }; status = 201
      } else if (req.method === 'PATCH' && /^\/v1\/computers\/[^/]+\/defaults$/.test(path)) {
        admin(); fields(body, ['version', 'defaultBrowserId', 'defaultProfiles'])
        const computer = state.computers.find(computer => computer.id === path.split('/')[3])
        if (!computer) fail(404, 'COMPUTER_NOT_FOUND', '电脑不存在')
        if (body.version !== computer.version) fail(409, 'VERSION_CONFLICT', '默认配置已变化，请刷新后重试')
        const browserId = text(body, 'defaultBrowserId')
        const profiles = body.defaultProfiles
        if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) fail(400, 'INVALID_FIELD', 'defaultProfiles 必须是浏览器到配置的映射')
        for (const [browser, profile] of Object.entries(profiles)) {
          if (!state.executors.some(executor => !executor.revoked && executor.computerId === computer.id && executor.browserId === browser && executor.profileId === profile)) fail(422, 'DEFAULT_TARGET_NOT_FOUND', '默认组合没有可用安装实例')
        }
        if (!Object.hasOwn(profiles, browserId)) fail(422, 'DEFAULT_NOT_SET', '默认浏览器需要默认用户配置')
        computer.defaultBrowserId = browserId; computer.defaultProfiles = profiles as Record<string, string>; computer.version++
        result = computer
      } else if (req.method === 'POST' && path === '/v1/accounts') {
        admin(); fields(body, ['executorId', 'platform', 'platformAccountId', 'displayName'])
        const executorId = text(body, 'executorId'); const executor = getExecutor(executorId)
        if (executor.revoked) fail(422, 'EXECUTOR_REVOKED', '安装已撤销')
        const platform = text(body, 'platform')
        if (!capabilities.some(item => item.platform === platform)) fail(422, 'UNSUPPORTED_PLATFORM', '平台不在首版范围内')
        const platformAccountId = text(body, 'platformAccountId')
        if (state.accounts.some(account => account.executorId === executorId && account.platform === platform && account.platformAccountId === platformAccountId)) fail(409, 'ACCOUNT_EXISTS', '账号已登记')
        const account: Account = { id: randomUUID(), executorId, platform, platformAccountId, displayName: text(body, 'displayName'), observedAt: null, bindingState: 'unobserved' }
        state.accounts.push(account); result = account; status = 201
      } else if (req.method === 'GET' && ['/v1/accounts', '/v1/capabilities'].includes(path)) {
        const executorId = url.searchParams.get('executorId')
        if (executorId) getExecutor(executorId)
        const selectedId = executorId || (credential?.role === 'executor' ? credential.executorId : undefined)
        result = path === '/v1/accounts' ? { accounts: state.accounts.filter(account => !selectedId || account.executorId === selectedId) } : { capabilities }
      } else if (req.method === 'POST' && /^\/v1\/executors\/[^/]+\/heartbeat$/.test(path)) {
        fields(body, ['extensionVersion', 'accountObservations'])
        const executor = getExecutor(path.split('/')[3])
        if (credential?.role !== 'executor' || credential.executorId !== executor.id) fail(403, 'FORBIDDEN', '心跳必须使用该安装的专属凭据')
        if (!Array.isArray(body.accountObservations)) fail(400, 'INVALID_FIELD', 'accountObservations 必须是数组')
        for (const observation of body.accountObservations) {
          if (!observation || typeof observation !== 'object' || Array.isArray(observation)) fail(400, 'INVALID_FIELD', '账号观测格式错误')
          fields(observation, ['accountId', 'platformAccountId'])
          const account = state.accounts.find(account => account.id === text(observation, 'accountId') && account.executorId === executor.id)
          if (!account) fail(422, 'ACCOUNT_NOT_FOUND', '账号未登记到此安装')
          const observed = observation.platformAccountId === null ? null : text(observation, 'platformAccountId')
          account.bindingState = observed === null ? 'logged_out' : observed === account.platformAccountId ? 'matched' : 'mismatch'
          account.observedAt = new Date(now()).toISOString()
        }
        executor.extensionVersion = text(body, 'extensionVersion'); executor.lastHeartbeat = new Date(now()).toISOString()
        result = { executorId: executor.id, lastHeartbeat: executor.lastHeartbeat, online: true }
      } else if (req.method === 'POST' && path === '/v1/targets/resolve') {
        fields(body, ['computerId', 'browserId', 'profileId', 'accountId', 'platform'])
        if (!isAdmin && credential?.role !== 'skill') fail(403, 'FORBIDDEN', '需要 Skill 或管理身份')
        const resolved = resolveTarget(state, body)
        result = { ...resolved, online: online(getExecutor(resolved.executorId)), preview: true }
      } else if (req.method === 'GET' && path === '/v1/executors') {
        result = { instanceId: state.instanceId, computers: state.computers.filter(computer => isAdmin || credential?.role === 'skill' || state.executors.some(executor => executor.id === credential?.executorId && executor.computerId === computer.id)), executors: state.executors.filter(executor => isAdmin || credential?.role === 'skill' || credential?.executorId === executor.id).map(executor => ({ ...executor, computerName: state.computers.find(computer => computer.id === executor.computerId)?.name, online: online(executor) })) }
      } else fail(404, 'NOT_FOUND', '接口不存在')
      if (mutation) db.prepare('INSERT INTO receipts VALUES (?, ?, ?)').run(scope, digest, seal({ status, result }, secret))
      db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state))
      db.exec('COMMIT'); transaction = false
      res.writeHead(status); res.end(JSON.stringify(result))
    } catch (error) {
      if (transaction) db.exec('ROLLBACK')
      const known = error instanceof ApiError
      res.writeHead(known ? error.status : 500)
      res.end(JSON.stringify({ requestId, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务内部错误', ...(known && error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}), retryable: !known, nextAction: known ? '请核对请求或联系管理端' : '稍后重试' } }))
    } finally {
      if (upload) { try { unlinkSync(upload.path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('无法删除上传临时文件') } }
    }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('无法读取监听地址')
  return { url: `http://${host}:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close(error => { db.close(); error ? reject(error) : resolve() })) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer({ directory: process.env.HAIQIAI_DATA_DIR || '.haiqiai-publishing', adminKey: process.env.HAIQIAI_ADMIN_KEY || readFileSync(join(process.env.HAIQIAI_DATA_DIR || '.haiqiai-publishing', 'admin.key'), 'utf8').trim(), port: Number(process.env.PORT || 43129), host: process.env.HOST || '127.0.0.1', maxAssetBytes: Number(process.env.HAIQIAI_MAX_ASSET_BYTES || 512 * 1024 * 1024) })
  console.log(`HaiqiAI publishing API: ${server.url}`)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close() })
}
