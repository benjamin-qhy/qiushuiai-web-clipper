import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'

const directory = process.env.HAIQIAI_DATA_DIR || '.haiqiai-publishing'
const [command, path, input, output] = process.argv.slice(2)
if (command === 'init') {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(join(directory, 'admin.key'), randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 })
  console.log('管理密钥已保存。运行 pnpm publishing:api 启动本机服务。')
} else {
  if (!['GET', 'POST', 'PATCH', 'UPLOAD'].includes(command) || !path?.startsWith('/v1/')) throw new Error('用法：GET|POST|PATCH|UPLOAD /v1/路径 [请求.json|-] [输出.json]')
  if (command !== 'GET' && !output) throw new Error('变更请求必须指定输出文件，密钥或配对码只保存到该文件。')
  const endpoint = new URL(process.env.HAIQIAI_API_URL || 'http://127.0.0.1:43129')
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)))) throw new Error('远程 API 必须使用 HTTPS，本机可用 HTTP')
  const key = readFileSync(process.env.HAIQIAI_API_KEY_FILE || join(directory, 'admin.key'), 'utf8').trim()
  let body: string | ReadableStream<Uint8Array> | undefined
  let bodyDigest: string | undefined
  if (command === 'UPLOAD') {
    if (!input || !/^\/v1\/assets\/[^/]+\/content$/.test(path)) throw new Error('UPLOAD 仅用于素材内容接口，且需要文件路径')
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(input)) digest.update(chunk)
    bodyDigest = digest.digest('hex')
    const iterator = createReadStream(input)[Symbol.asyncIterator]()
    body = new ReadableStream({
      async pull(controller) { const item = await iterator.next(); if (item.done) controller.close(); else controller.enqueue(new Uint8Array(item.value)) },
      async cancel() { await iterator.return?.() },
    })
  } else { body = command === 'GET' ? undefined : input && input !== '-' ? readFileSync(input, 'utf8') : '{}'; bodyDigest = body }

  let requestId = process.env.HAIQIAI_REQUEST_ID || randomUUID()
  if (output) {
    if (existsSync(output)) throw new Error('输出文件已存在；请先查看已保存的结果，不重复发送。')
    const pendingPath = `${output}.request.json`
    const digest = createHash('sha256').update(JSON.stringify([command, endpoint.href, path, bodyDigest, createHash('sha256').update(key).digest('hex')])).digest('hex')
    try { writeFileSync(pendingPath, JSON.stringify({ requestId, digest }), { flag: 'wx', mode: 0o600 }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const saved = JSON.parse(readFileSync(pendingPath, 'utf8'))
      if (saved.digest !== digest || (process.env.HAIQIAI_REQUEST_ID && saved.requestId !== process.env.HAIQIAI_REQUEST_ID)) throw new Error('输出路径对应其他请求，请使用新的输出路径')
      requestId = saved.requestId
    }
  }
  const init: RequestInit & { duplex?: 'half' } = {
    method: command === 'UPLOAD' ? 'PUT' : command, redirect: 'error', signal: AbortSignal.timeout(command === 'UPLOAD' ? 600_000 : 15_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': command === 'UPLOAD' ? 'application/octet-stream' : 'application/json', 'Idempotency-Key': requestId },
    body, ...(command === 'UPLOAD' ? { duplex: 'half' as const } : {}),
  }
  const response = await fetch(`${endpoint.href.replace(/\/$/, '')}${path}`, init)
  const result = await response.text()
  if (!response.ok) { console.error(result); process.exitCode = 1 }
  else if (output) { writeFileSync(output, result + '\n', { mode: 0o600, flag: 'wx' }); console.log(`结果已保存：${output}`) }
  else console.log(result)
}
