// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { startServer } from '../../packages/publishing-api/server.mts'

const directories: string[] = []
const servers: Awaited<ReturnType<typeof startServer>>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }))
})
async function fixture(now?: () => number) {
  const directory = mkdtempSync(join(tmpdir(), 'haiqiai-api-'))
  directories.push(directory)
  const adminKey = 'test-admin-key-with-at-least-32-characters'
  const server = await startServer({ directory, adminKey, port: 0, now })
  servers.push(server)
  async function call(path: string, body?: unknown, token = adminKey, method = body === undefined ? 'GET' : 'POST', key: string = randomUUID()) {
    const response = await fetch(`${server.url}/v1${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, data: await response.json() }
  }
  return { directory, adminKey, server, call }
}
it('pairs an installation with an administrator-selected computer and exposes it to a separate Skill credential', async () => {
  const { call } = await fixture()
  const computer = await call('/computers', { name: '工作电脑' })
  expect(computer.status).toBe(201)
  const pairing = await call('/pairing-codes', { computerId: computer.data.id, browserName: 'Chrome', profileName: '工作' })
  expect(pairing.status).toBe(201)
  const paired = await call('/executors/pair', { pairingCode: pairing.data.code, installationId: randomUUID(), extensionVersion: '1.0.0' }, '')
  expect(paired.status).toBe(201)
  const skill = await call('/keys', { name: '我的 Skill' })
  const discovery = await call('/executors', undefined, skill.data.key)
  expect(discovery.status).toBe(200)
  expect(discovery.data.executors).toEqual([expect.objectContaining({ id: paired.data.executorId, computerId: computer.data.id, browserName: 'Chrome', profileName: '工作', online: false })])
  expect(JSON.stringify(discovery.data)).not.toContain(paired.data.key)
})
it('replays pairing safely, rejects changed or reused codes, and persists revocation across restart', async () => {
  const { call, directory, adminKey, server } = await fixture()
  const computer = await call('/computers', { name: '电脑' })
  const pairing = await call('/pairing-codes', { computerId: computer.data.id, browserName: 'Chrome', profileName: '默认' })
  const body = { pairingCode: pairing.data.code, installationId: randomUUID(), extensionVersion: '1' }
  const key = randomUUID()
  const paired = await call('/executors/pair', body, '', 'POST', key)
  expect(await call('/executors/pair', body, '', 'POST', key)).toEqual(paired)
  expect((await call('/executors/pair', { ...body, installationId: randomUUID() }, '', 'POST', key)).status).toBe(409)
  expect((await call('/executors/pair', body, '')).status).toBe(401)
  expect((await call('/computers', { name: '非法认领' }, paired.data.key)).status).toBe(403)
  expect((await call(`/keys/${paired.data.keyId}/revoke`, {})).status).toBe(200)
  expect((await call('/executors', undefined, paired.data.key)).status).toBe(401)
  await server.close(); servers.splice(servers.indexOf(server), 1)
  const restarted = await startServer({ directory, adminKey, port: 0 }); servers.push(restarted)
  const response = await fetch(`${restarted.url}/v1/executors`, { headers: { Authorization: `Bearer ${adminKey}` } })
  const data = await response.json()
  expect(data.executors).toEqual([expect.objectContaining({ id: paired.data.executorId, revoked: true, online: false })])
})
it('resolves optional browser/profile defaults without rerouting and limits heartbeats to the paired installation', async () => {
  const { call } = await fixture()
  const computer = (await call('/computers', { name: '电脑' })).data
  async function pair(browserName: string, profileName: string, browserId?: string) {
    const code = (await call('/pairing-codes', { computerId: computer.id, browserName, profileName, ...(browserId ? { browserId } : {}) })).data.code
    return (await call('/executors/pair', { pairingCode: code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  }
  const chrome = await pair('Chrome', '工作')
  const edge = await pair('Edge', '个人')
  const second = await pair('Chrome', '备用', chrome.executor.browserId)
  const account = (await call('/accounts', { executorId: chrome.executorId, platform: 'xiaohongshu', platformAccountId: 'platform-user-1', displayName: '秋水' })).data
  const request = { computerId: computer.id, platform: 'xiaohongshu', accountId: account.id }
  expect((await call('/targets/resolve', request)).data.error.code).toBe('DEFAULT_NOT_SET')
  const defaults = { version: 0, defaultBrowserId: chrome.executor.browserId, defaultProfiles: { [chrome.executor.browserId]: chrome.executor.profileId, [edge.executor.browserId]: edge.executor.profileId } }
  expect((await call(`/computers/${computer.id}/defaults`, defaults, undefined, 'PATCH')).status).toBe(200)
  expect((await call(`/computers/${computer.id}/defaults`, defaults, undefined, 'PATCH')).status).toBe(409)
  expect((await call('/targets/resolve', request)).data).toMatchObject({ executorId: chrome.executorId, online: false })
  expect((await call('/targets/resolve', { ...request, profileId: second.executor.profileId })).data.error.code).toBe('ACCOUNT_MISMATCH')
  expect((await call('/targets/resolve', { ...request, browserId: edge.executor.browserId })).data.error.code).toBe('ACCOUNT_MISMATCH')
  expect((await call(`/executors/${chrome.executorId}/heartbeat`, { extensionVersion: '2', accountObservations: [] }, edge.key)).status).toBe(403)
  expect((await call(`/executors/${chrome.executorId}/heartbeat`, { extensionVersion: '2', accountObservations: [{ accountId: account.id, platformAccountId: 'platform-user-1' }] }, chrome.key)).status).toBe(200)
  expect((await call('/targets/resolve', request)).data.online).toBe(true)
  expect((await call(`/accounts?executorId=${chrome.executorId}`)).data.accounts[0]).toMatchObject({ bindingState: 'matched', platformAccountId: 'platform-user-1' })
  expect((await call('/executors', undefined, edge.key)).data.executors).toHaveLength(1)
  expect((await call(`/accounts?executorId=${chrome.executorId}`, undefined, edge.key)).status).toBe(403)
  expect((await call(`/capabilities?executorId=${chrome.executorId}`)).data.capabilities).toEqual(expect.arrayContaining([expect.objectContaining({ platform: 'xiaohongshu', type: 'dynamic', verified: false, autoPublish: false })]))
})
it('expires pairing and heartbeats using server time, rejects Cookie payloads and missing idempotency keys', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'haiqiai-time-')); directories.push(directory)
  let time = Date.parse('2026-10-08T08:00:00Z')
  const adminKey = 'test-admin-key-with-at-least-32-characters'
  const server = await startServer({ directory, adminKey, port: 0, now: () => time }); servers.push(server)
  async function send(path: string, body?: unknown, key = adminKey, idem: string | null = randomUUID()) {
    const response = await fetch(`${server.url}/v1${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idem ? { 'Idempotency-Key': idem } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: await response.json() }
  }
  expect((await send('/computers', { name: '电脑' }, adminKey, null)).status).toBe(400)
  const computer = (await send('/computers', { name: '电脑' })).data
  const pairingBody = { computerId: computer.id, browserName: 'Chrome', profileName: '默认' }
  const expired = (await send('/pairing-codes', pairingBody)).data
  time += 600_001
  expect((await send('/executors/pair', { pairingCode: expired.code, installationId: 'i', extensionVersion: '1' }, '')).status).toBe(401)
  const code = (await send('/pairing-codes', pairingBody)).data.code
  const paired = (await send('/executors/pair', { pairingCode: code, installationId: 'i', extensionVersion: '1' }, '')).data
  expect((await send(`/executors/${paired.executorId}/heartbeat`, { extensionVersion: '1', accountObservations: [], cookie: 'secret' }, paired.key)).status).toBe(400)
  await send(`/executors/${paired.executorId}/heartbeat`, { extensionVersion: '1', accountObservations: [] }, paired.key)
  expect((await send('/executors')).data.executors[0].online).toBe(true)
  time += 90_000
  expect((await send('/executors')).data.executors[0].online).toBe(false)
})

it('management CLI reuses its saved request after losing a response file and refuses an occupied output path', async () => {
  const { server, directory, adminKey, call } = await fixture()
  const keyFile = join(directory, 'admin.key')
  const input = join(directory, 'computer.json')
  const output = join(directory, 'result.json')
  writeFileSync(keyFile, adminKey, { mode: 0o600 })
  writeFileSync(input, JSON.stringify({ name: 'CLI 电脑' }))
  const run = () => promisify(execFile)(process.execPath, [resolve('packages/publishing-api/admin.mts'), 'POST', '/v1/computers', input, output], {
    env: { ...process.env, HAIQIAI_API_URL: server.url, HAIQIAI_API_KEY_FILE: keyFile },
  })
  await run()
  const original = readFileSync(output, 'utf8')
  rmSync(output)
  await run()
  expect(readFileSync(output, 'utf8')).toBe(original)
  await expect(run()).rejects.toThrow()
  expect((await call('/executors')).data.computers).toHaveLength(1)
})

it('streams assets to durable storage, rejects digest/length mismatches, and keeps ready bytes immutable', async () => {
  const { call, server, adminKey } = await fixture()
  const bytes = Buffer.from('test image bytes')
  const declaration = { filename: '测试.png', mediaType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  const asset = await call('/assets', declaration)
  expect(asset.status).toBe(201)
  const put = (data: Buffer) => fetch(`${server.url}/v1/assets/${asset.data.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': 'upload-1' }, body: new Uint8Array(data).buffer })
  expect((await put(Buffer.from('wrong'))).status).toBe(422)
  expect((await call(`/assets/${asset.data.assetId}`)).data.ready).toBe(false)
  expect((await put(bytes)).status).toBe(200)
  expect((await call(`/assets/${asset.data.assetId}`)).data.ready).toBe(true)
  const download = await fetch(`${server.url}/v1/assets/${asset.data.assetId}/content`, { headers: { Authorization: `Bearer ${adminKey}` } })
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes)
  expect((await put(bytes)).status).toBe(200)
  expect((await put(Buffer.from('changed'))).status).toBe(422)
})

it('accepts confirmed simulation tasks atomically, locks defaults, isolates claims and returns durable simulated evidence', async () => {
  const { call, server, adminKey } = await fixture()
  const computer = (await call('/computers', { name: '电脑' })).data
  async function pair(name: string) {
    const { code } = (await call('/pairing-codes', { computerId: computer.id, browserName: name, profileName: '默认' })).data
    return (await call('/executors/pair', { pairingCode: code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  }
  const chrome = await pair('Chrome'); const edge = await pair('Edge')
  const account = (await call('/accounts', { executorId: chrome.executorId, platform: 'xiaohongshu', platformAccountId: 'demo', displayName: '测试' })).data
  const defaults = { version: 0, defaultBrowserId: chrome.executor.browserId, defaultProfiles: { [chrome.executor.browserId]: chrome.executor.profileId, [edge.executor.browserId]: edge.executor.profileId } }
  await call(`/computers/${computer.id}/defaults`, defaults, undefined, 'PATCH')
  const bytes = Buffer.from('image')
  const asset = (await call('/assets', { filename: 'image.png', mediaType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })).data
  await fetch(`${server.url}/v1/assets/${asset.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: new Uint8Array(bytes).buffer })
  const target = { clientTargetId: 'a', computerId: computer.id, platform: 'xiaohongshu', accountId: account.id, content: { type: 'dynamic', title: '完整标题', content: '不截断正文', imageAssetIds: [asset.assetId], tags: [] } }
  const payload = { executionMode: 'simulation', confirmation: { confirmedAt: new Date().toISOString(), contentRevision: 'rev-1' }, targets: [target] }
  expect((await call('/tasks', { ...payload, executionMode: 'live' })).status).toBe(422)
  expect((await call('/tasks', { ...payload, targets: [target, { ...target, clientTargetId: 'bad', accountId: 'missing' }] })).status).toBe(422)
  expect((await call('/tasks')).data.tasks).toHaveLength(0)
  const task = await call('/tasks', payload, undefined, 'POST', 'same-task')
  expect(task.status).toBe(201)
  expect(await call('/tasks', payload, undefined, 'POST', 'same-task')).toEqual(task)
  await call(`/computers/${computer.id}/defaults`, { ...defaults, version: 1, defaultBrowserId: edge.executor.browserId }, undefined, 'PATCH')
  expect((await call(`/tasks/${task.data.taskId}`)).data.targets[0]).toMatchObject({ executorId: chrome.executorId, content: target.content, state: 'queued' })
  expect((await call(`/executors/${edge.executorId}/claims`, {}, edge.key)).data.attempt).toBeNull()
  expect((await call(`/assets/${asset.assetId}`, undefined, edge.key)).status).toBe(403)
  const claim = (await call(`/executors/${chrome.executorId}/claims`, {}, chrome.key)).data
  expect(claim.attempt.target.content).toEqual(target.content)
  expect((await call(`/assets/${asset.assetId}`, undefined, chrome.key)).status).toBe(200)
  expect((await call(`/executors/${chrome.executorId}/claims`, {}, chrome.key)).data.attempt).toBeNull()
  const event = { leaseToken: claim.attempt.leaseToken, eventId: randomUUID(), seq: 1, stage: 'simulation', state: 'draft_saved', evidence: { kind: 'simulation_receipt', platform: 'xiaohongshu', accountId: account.id, observedAt: '2026-10-08T08:00:00Z', detail: '模拟草稿，无真实发布' } }
  expect((await call(`/attempts/${claim.attempt.id}/events`, event, edge.key)).status).toBe(403)
  expect((await call(`/attempts/${claim.attempt.id}/events`, { ...event, state: 'published' }, chrome.key)).status).toBe(422)
  await call(`/attempts/${claim.attempt.id}/submit-intent`, { leaseToken: claim.attempt.leaseToken, contentDigest: claim.attempt.target.contentDigest, accountId: account.id, assetsChecked: true }, chrome.key)
  expect((await call(`/attempts/${claim.attempt.id}/events`, event, chrome.key)).status).toBe(200)
  expect((await call(`/attempts/${claim.attempt.id}/events`, event, chrome.key)).status).toBe(200)
  expect((await call(`/attempts/${claim.attempt.id}/events`, { ...event, eventId: randomUUID() }, chrome.key)).status).toBe(409)
  const result = (await call(`/tasks/${task.data.taskId}`)).data
  expect(result).toMatchObject({ executionMode: 'simulation', counts: { draft_saved: 1 } })
  expect(result.targets[0].evidence).toMatchObject(event.evidence)
})

it('uploads from the Skill CLI as a stream and reuses its declared asset after a lost result', async () => {
  const { server, directory, adminKey, call } = await fixture()
  const input = join(directory, 'sample.png'); const output = join(directory, 'uploaded.json'); const keyFile = join(directory, 'skill.key')
  const skill = (await call('/keys', { name: '上传测试 Skill' })).data
  writeFileSync(keyFile, skill.key, { mode: 0o600 })
  const bytes = Buffer.alloc(2 * 1024 * 1024, 7); writeFileSync(input, bytes)
  const run = () => promisify(execFile)(process.execPath, [resolve('packages/publishing-api/upload.mts'), input, 'image/png', output], {
    env: { ...process.env, HAIQIAI_API_URL: server.url, HAIQIAI_API_KEY_FILE: keyFile },
  })
  await run(); const original = readFileSync(output, 'utf8')
  rmSync(output); await run()
  expect(readFileSync(output, 'utf8')).toBe(original)
  const result = JSON.parse(original)
  expect((await call(`/assets/${result.assetId}`)).data).toMatchObject({ ready: true, sizeBytes: bytes.length })
  const download = await fetch(`${server.url}/v1/assets/${result.assetId}/content`, { headers: { Authorization: `Bearer ${adminKey}` } })
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes)
})

it('routes real Xiaohongshu preparation separately and cannot mistake its observations for a saved draft', async () => {
  let clock = Date.now()
  const { call, server, adminKey } = await fixture(() => clock)
  const computer = (await call('/computers', { name: '真实准备测试' })).data
  const code = (await call('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: '工作' })).data.code
  const executor = (await call('/executors/pair', { pairingCode: code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  const account = (await call('/accounts', { executorId: executor.executorId, platform: 'xiaohongshu', platformAccountId: 'stable-user', displayName: '账号' })).data
  const bytes = Buffer.from('fixture image')
  const asset = (await call('/assets', { filename: '1.png', mediaType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })).data
  await fetch(`${server.url}/v1/assets/${asset.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes })
  const payload = { executionMode: 'live', confirmation: { action: 'prepare', confirmedAt: new Date().toISOString(), contentRevision: 'r1' }, targets: [{ clientTargetId: 'xhs', computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, accountId: account.id, platform: 'xiaohongshu', content: { type: 'dynamic', title: '完整标题', content: '原始正文', tags: ['人工智能'], imageAssetIds: [asset.assetId] } }] }
  const task = await call('/tasks', payload)
  expect(task.status).toBe(201)
  expect((await call(`/executors/${executor.executorId}/claims`, {}, executor.key)).data.attempt).toBeNull()
  const attempt = (await call(`/executors/${executor.executorId}/claims`, { executionMode: 'live' }, executor.key)).data.attempt
  expect(attempt).toMatchObject({ executionMode: 'live', target: { content: payload.targets[0].content } })
  expect((await call(`/attempts/${attempt.id}`, undefined, executor.key)).data.executionMode).toBe('live')
  expect((await call(`/attempts/${attempt.id}/submit-intent`, { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: account.id, assetsChecked: true }, executor.key)).status).toBe(409)
  const base = { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, stage: 'validation' }
  expect((await call(`/attempts/${attempt.id}/events`, { ...base, state: 'draft_saved', evidence: { kind: 'simulation_receipt', platform: 'xiaohongshu', accountId: account.id, observedAt: new Date().toISOString(), detail: '不是真草稿' } }, executor.key)).status).toBe(422)
  const reason = { code: 'ACCOUNT_UNVERIFIED', message: '稳定账号身份尚未核对', stage: 'validation', causeKnown: true, retryable: false, nextAction: '核对指定账号身份后恢复' }
  expect((await call(`/attempts/${attempt.id}/events`, { ...base, state: 'needs_attention', reason }, executor.key)).status).toBe(200)
  expect((await call(`/tasks/${task.data.taskId}`)).data).toMatchObject({ executionMode: 'live', counts: { needs_attention: 1 }, targets: [{ reason }] })
  expect((await call('/tasks', { ...payload, confirmation: { ...payload.confirmation, action: 'publish' } })).status).toBe(422)
  const fillContent = { ...payload.targets[0].content, collectionName: 'AI落地', declareOriginal: true }
  const fillPayload = { ...payload, confirmation: { ...payload.confirmation, action: 'fill' }, targets: [{ ...payload.targets[0], content: fillContent }] }
  const fill = await call('/tasks', fillPayload)
  expect(fill.status).toBe(201)
  const filling = (await call(`/executors/${executor.executorId}/claims`, { executionMode: 'live' }, executor.key)).data.attempt
  expect(filling.action).toBe('fill')
  expect(filling.target.content).toEqual(fillContent)
  expect((await call('/tasks', { ...fillPayload, targets: [{ ...fillPayload.targets[0], content: { ...fillContent, declareOriginal: 'true' } }] })).status).toBe(422)
  const intent = { leaseToken: filling.leaseToken, contentDigest: filling.target.contentDigest, accountId: account.id, assetsChecked: true, editorTabId: 42 }
  expect((await call(`/attempts/${filling.id}/prepare-intent`, intent, executor.key)).status).toBe(200)
  expect((await call(`/attempts/${filling.id}/prepare-intent`, intent, executor.key)).status).toBe(409)
  const readyReason = { code: 'AWAITING_PUBLISH_CONFIRMATION', message: '图片、正文和话题已填好，等待发布确认', stage: 'preparation', causeKnown: true, retryable: false, nextAction: '检查页面内容后确认发布' }
  expect((await call(`/attempts/${filling.id}/events`, { leaseToken: filling.leaseToken, eventId: randomUUID(), seq: 1, stage: 'preparation', state: 'needs_attention', reason: readyReason }, executor.key)).status).toBe(200)
  expect((await call(`/targets/${filling.target.id}/resume`, {})).status).toBe(409)
  expect((await call(`/tasks/${fill.data.taskId}`)).data.targets[0]).toMatchObject({ state: 'needs_attention', editorTabId: 42, reason: readyReason })
  await call('/tasks', fillPayload)
  const interrupted = (await call(`/executors/${executor.executorId}/claims`, { executionMode: 'live' }, executor.key)).data.attempt
  const grant = await call(`/attempts/${interrupted.id}/prepare-intent`, { ...intent, leaseToken: interrupted.leaseToken }, executor.key)
  expect(grant.data.durationMs).toBe(90_000)
  clock += 180_000 // Server expiry does not prove that a remote browser stopped.
  const proof = { leaseToken: interrupted.leaseToken, executionStopped: true, pageClosed: false }
  expect((await call(`/attempts/${interrupted.id}/recover`, proof, executor.key)).status).toBe(422)
  expect((await call(`/attempts/${interrupted.id}/recover`, { ...proof, preparationStopped: true, preparationResult: { ...readyReason, code: 'TOPIC_NOT_FOUND', message: '未找到同名话题' } }, executor.key)).data.state).toBe('needs_attention')
  expect((await call(`/executors/${executor.executorId}/claims`, { executionMode: 'live' }, executor.key)).data.attempt).toBeNull()


})

it('accepts explicit live finish choices and requires live result evidence after a one-shot intent', async () => {
  const { call, server, adminKey } = await fixture()
  const computer = (await call('/computers', { name: 'finish' })).data
  const pairing = (await call('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: 'default' })).data
  const executor = (await call('/executors/pair', { pairingCode: pairing.code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  const account = (await call('/accounts', { executorId: executor.executorId, platform: 'xiaohongshu', platformAccountId: 'stable-user', displayName: '测试' })).data
  const bytes = Buffer.from('image')
  const asset = (await call('/assets', { filename: '1.png', mediaType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })).data
  await fetch(`${server.url}/v1/assets/${asset.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes })
  const payload = { executionMode: 'live', confirmation: { action: 'fill', finish: 'save_draft', originalAgreementAccepted: true, confirmedAt: new Date().toISOString(), contentRevision: 'r1' }, targets: [{ clientTargetId: 'xhs', computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, accountId: account.id, platform: 'xiaohongshu', content: { type: 'dynamic', title: '原始标题', content: '原文', collectionName: 'AI落地', declareOriginal: true, imageAssetIds: [asset.assetId] } }] }
  expect((await call('/tasks', { ...payload, confirmation: { ...payload.confirmation, finish: 'unknown' } })).status).toBe(422)
  const task = await call('/tasks', payload)
  expect(task.status).toBe(201)
  const attempt = (await call(`/executors/${executor.executorId}/claims`, { executionMode: 'live' }, executor.key)).data.attempt
  expect(attempt.confirmation).toMatchObject({ finish: 'save_draft', originalAgreementAccepted: true })
  const proof = { leaseToken: attempt.leaseToken, accountId: account.id, contentDigest: attempt.target.contentDigest, assetsChecked: true }
  expect((await call(`/attempts/${attempt.id}/submit-intent`, proof, executor.key)).status).toBe(409)
  await call(`/attempts/${attempt.id}/prepare-intent`, { ...proof, editorTabId: 77 }, executor.key)
  const grant = await call(`/attempts/${attempt.id}/submit-intent`, { ...proof, editorTabId: 77, preparationChecked: true, finish: 'save_draft' }, executor.key)
  expect(grant.status).toBe(200)
  expect(grant.data).toMatchObject({ authorized: true, finish: 'save_draft', executionMode: 'live' })
  expect((await call(`/attempts/${attempt.id}/submit-intent`, { ...proof, editorTabId: 77, preparationChecked: true, finish: 'save_draft' }, executor.key)).status).toBe(409)
  const event = { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, state: 'draft_saved', stage: 'reconciliation', evidence: { kind: 'platform_receipt', platform: 'xiaohongshu', accountId: account.id, observedAt: new Date().toISOString(), detail: '保存成功', finish: 'save_draft', editorTabId: 77, title: '原始标题', signal: 'draft_saved', storage: 'browser_local' } }
  expect((await call(`/attempts/${attempt.id}/events`, { ...event, evidence: { ...event.evidence, title: '其他内容' } }, executor.key)).status).toBe(422)
  expect((await call(`/attempts/${attempt.id}/events`, event, executor.key)).status).toBe(200)
  expect((await call(`/tasks/${task.data.taskId}`)).data.targets[0]).toMatchObject({ state: 'draft_saved', evidence: { storage: 'browser_local' } })
})

it('accepts a live Xiaohongshu video without silently ignoring unimplemented cover options', async () => {
  const { call, server, adminKey } = await fixture()
  const computer = (await call('/computers', { name: 'video' })).data
  const pair = (await call('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: 'default' })).data
  const executor = (await call('/executors/pair', { pairingCode: pair.code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  const account = (await call('/accounts', { executorId: executor.executorId, platform: 'xiaohongshu', platformAccountId: '6a275c1f0000000001007c00', displayName: 'test' })).data
  const bytes = Buffer.from('video fixture')
  const asset = (await call('/assets', { filename: 'video.mp4', mediaType: 'video/mp4', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })).data
  await fetch(`${server.url}/v1/assets/${asset.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes })
  const target = { clientTargetId: 'video', computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, platform: 'xiaohongshu', accountId: account.id, content: { type: 'video', title: 'CLI与MCP怎么选', content: '完整正文', tags: [], videoAssetId: asset.assetId } }
  const payload = { executionMode: 'live', confirmation: { action: 'fill', finish: 'stay', confirmedAt: new Date().toISOString(), contentRevision: 'v1' }, targets: [target] }
  const coverBytes = Buffer.from('cover fixture')
  const cover = (await call('/assets', { filename: 'cover.png', mediaType: 'image/png', sizeBytes: coverBytes.length, sha256: createHash('sha256').update(coverBytes).digest('hex') })).data
  await fetch(`${server.url}/v1/assets/${cover.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: coverBytes })
  const response = await call('/tasks', payload)
  expect(response.status).toBe(201)
  expect(response.data.targets[0].content).toEqual(target.content)
  const options = { ...target.content, horizontalCoverAssetId: cover.assetId, verticalCoverAssetId: cover.assetId, collectionName: 'AI落地', declareOriginal: true }
  const withCovers = await call('/tasks', { ...payload, targets: [{ ...target, content: options }] })
  expect(withCovers.status).toBe(201)
  expect(withCovers.data.targets[0].content).toEqual(options)
  expect((await call('/tasks', { ...payload, targets: [{ ...target, content: { ...options, coverAssetId: cover.assetId } }] })).status).toBe(422)
  const claim = (await call(`/executors/${executor.executorId}/claims`, { executionMode: 'live' }, executor.key)).data.attempt
  const intent = await call(`/attempts/${claim.id}/prepare-intent`, { leaseToken: claim.leaseToken, contentDigest: claim.target.contentDigest, accountId: account.id, assetsChecked: true, editorTabId: 45 }, executor.key)
  expect(intent.data.durationMs).toBe(90_000)
  expect((await call(`/targets/${claim.target.id}/continue-video`, {}, executor.key)).status).toBe(403)
  expect((await call(`/targets/${claim.target.id}/continue-video`, {})).status).toBe(409)

  expect((await call(`/attempts/${claim.id}/prepare-intent`, { leaseToken: claim.leaseToken, contentDigest: claim.target.contentDigest, accountId: account.id, assetsChecked: true, editorTabId: 45 }, executor.key)).status).toBe(409)
  expect((await call('/tasks', { ...payload, targets: [{ ...target, content: { ...target.content, scheduledPublishTime: 1 } }] })).status).toBe(422)
  await call(`/attempts/${claim.id}/events`, { leaseToken: claim.leaseToken, eventId: randomUUID(), seq: 1, state: 'needs_attention', stage: 'preparation', reason: { code: 'VIDEO_UPLOAD_UNCONFIRMED', message: 'preview', stage: 'preparation', causeKnown: true, retryable: false, nextAction: 'review' } }, executor.key)
  expect((await call(`/targets/${claim.target.id}/resume`, {})).status).toBe(409)
  expect((await call(`/targets/${claim.target.id}/continue-video`, {})).status).toBe(200)
  expect((await call(`/targets/${claim.target.id}/continue-video`, {})).status).toBe(409)

})

it('allows X stay tasks and other-platform readonly checks while rejecting unverified final actions', async () => {
  const { call } = await fixture()
  const computer = (await call('/computers', { name: 'social' })).data
  const pair = (await call('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: 'default' })).data
  const executor = (await call('/executors/pair', { pairingCode: pair.code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  for (const platform of ['x', 'douyin', 'maimai']) {
    const account = (await call('/accounts', { executorId: executor.executorId, platform, platformAccountId: 'test-account', displayName: 'test' })).data
    const target = { clientTargetId: platform, computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, platform, accountId: account.id, content: { type: 'dynamic', content: 'CLI处理本地任务，MCP连接系统，Skill沉淀方法。' } }
    const base = { executionMode: 'live', confirmation: { action: 'prepare', confirmedAt: new Date().toISOString(), contentRevision: 'social-v1' }, targets: [target] }
    expect((await call('/tasks', base)).status).toBe(201)
    const fill = { ...base, confirmation: { ...base.confirmation, action: 'fill', finish: 'stay' } }
    expect((await call('/tasks', fill)).status).toBe(platform === 'x' ? 201 : 422)
    expect((await call('/tasks', { ...fill, confirmation: { ...fill.confirmation, finish: 'publish' } })).status).toBe(422)
    if (platform === 'x') expect((await call('/tasks', { ...fill, targets: [{ ...target, content: { ...target.content, content: '中'.repeat(141) } }] })).status).toBe(422)
  }
})

it('routes separate content endpoints to platform targets without accepting mixed content types', async () => {
  const { call, server, adminKey } = await fixture()
  const computer = (await call('/computers', { name: 'typed-endpoints' })).data
  const pair = (await call('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: 'default' })).data
  const executor = (await call('/executors/pair', { pairingCode: pair.code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  const bytes = Buffer.from('video')
  const video = (await call('/assets', { filename: 'video.mp4', mediaType: 'video/mp4', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })).data
  await fetch(`${server.url}/v1/assets/${video.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes })
  for (const [type, platforms, content] of [
    ['dynamic', ['xiaohongshu', 'weibo'], { content: '图文正文' }],
    ['video', ['xiaohongshu', 'douyin'], { title: '视频标题', content: '视频正文', videoAssetId: video.assetId }],
    ['article', ['weixin', 'medium'], { title: '文章标题', htmlContent: '<p>文章正文</p>', markdownContent: '文章正文' }],
  ] as const) {
    const targets = []
    for (const platform of platforms) {
      const account = (await call('/accounts', { executorId: executor.executorId, platform, platformAccountId: platform + '-' + type, displayName: platform })).data
      targets.push({ clientTargetId: platform, computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, accountId: account.id, platform, content })
    }
    const body = { executionMode: 'simulation', confirmation: { confirmedAt: new Date().toISOString(), contentRevision: type }, targets }
    const key = randomUUID()
    const result = await call('/tasks/' + type, body, adminKey, 'POST', key)
    expect(result.status, JSON.stringify(result.data)).toBe(201)
    expect(result.data.targets.map((t: any) => [t.platform, t.content.type])).toEqual(platforms.map(platform => [platform, type]))
    expect((await call('/tasks/' + type, body, adminKey, 'POST', key)).data.taskId).toBe(result.data.taskId)
    const wrong = await call('/tasks/' + type, { ...body, targets: [{ ...targets[0], content: { ...content, type: type === 'video' ? 'dynamic' : 'video' } }] })
    expect(wrong.status).toBe(422)
    expect(JSON.stringify(wrong.data)).toContain('CONTENT_TYPE_MISMATCH')
  }
})
