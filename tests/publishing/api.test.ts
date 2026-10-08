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
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'haiqiai-api-'))
  directories.push(directory)
  const adminKey = 'test-admin-key-with-at-least-32-characters'
  const server = await startServer({ directory, adminKey, port: 0 })
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
