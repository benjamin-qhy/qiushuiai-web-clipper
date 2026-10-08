// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { startServer } from '../../packages/publishing-api/server.mts'
import { registerPublishingConnection } from '../../MultiPost-Extension/src/haiqiai/connection'

afterEach(() => vi.unstubAllGlobals())
it('pairs through the extension message boundary, persists its credential privately and stops on revocation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'haiqiai-extension-'))
  const adminKey = 'test-admin-key-with-at-least-32-characters'
  const server = await startServer({ directory, adminKey, port: 0 })
  const local: Record<string, unknown> = {}
  let listener: Function = () => {}; let alarmListener: Function = () => {}
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test-extension/${path}`, getManifest: () => ({ version: '1.0.0' }), onMessage: { addListener: (handler: Function) => { listener = handler } }, onStartup: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
    storage: { local: { setAccessLevel: vi.fn(async () => {}), get: async (key: string) => ({ [key]: local[key] }), set: async (value: object) => Object.assign(local, value) } },
    alarms: { create: vi.fn(async () => {}), onAlarm: { addListener: (handler: Function) => { alarmListener = handler } } },
  })
  async function api(path: string, body: unknown) {
    const response = await fetch(`${server.url}/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) })
    return response.json()
  }
  const send = (payload: object, url = 'chrome-extension://test-extension/publish.html') => new Promise<any>(resolve => listener({ type: 'HAIQIAI_PUBLISHING_CONNECTION', ...payload }, { id: 'test-extension', url }, resolve))
  try {
    const computer = await api('/computers', { name: '测试电脑' })
    const pairing = await api('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: '工作' })
    registerPublishingConnection()
    const forbidden = await send({ action: 'pair', apiUrl: server.url, code: pairing.code }, 'https://example.com/')
    expect(forbidden.error).toBeTruthy()
    const result = await send({ action: 'pair', apiUrl: server.url, code: pairing.code })
    expect(result.data).toMatchObject({ connected: true, executor: { computerId: computer.id, browserName: 'Chrome', online: true } })
    expect(JSON.stringify(result)).not.toContain('"key"')
    const executor = result.data.executor
    const account = await api('/accounts', { executorId: executor.id, platform: 'xiaohongshu', platformAccountId: 'demo', displayName: '模拟账号' })
    const task = await api('/tasks', { executionMode: 'simulation', confirmation: { confirmedAt: new Date().toISOString(), contentRevision: 'r1' }, targets: [{ clientTargetId: 'a', computerId: executor.computerId, browserId: executor.browserId, profileId: executor.profileId, accountId: account.id, platform: 'xiaohongshu', content: { type: 'dynamic', content: '模拟正文' } }] })
    const completed = await send({ action: 'simulate' })
    expect(completed.data.tasks.find((item: any) => item.taskId === task.taskId)).toMatchObject({ executionMode: 'simulation', counts: { draft_saved: 1 } })
    expect(JSON.stringify(completed)).not.toContain('leaseToken')
    const bytes = new TextEncoder().encode('GOOD')
    const asset = await api('/assets', { filename: 'test.png', mediaType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    await fetch(`${server.url}/v1/assets/${asset.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes })
    async function submitImage(label: string) {
      return api('/tasks', { executionMode: 'simulation', confirmation: { confirmedAt: new Date().toISOString(), contentRevision: label }, targets: [{ clientTargetId: label, computerId: executor.computerId, browserId: executor.browserId, profileId: executor.profileId, accountId: account.id, platform: 'xiaohongshu', content: { type: 'dynamic', content: label, imageAssetIds: [asset.assetId] } }] })
    }
    const digestTask = await submitImage('digest')
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith(`/assets/${asset.assetId}/content`) ? Promise.resolve(new Response('EVIL')) : originalFetch(url, init))
    const digestFailure = await send({ action: 'simulate' })
    expect(digestFailure.data.tasks.find((task: any) => task.taskId === digestTask.taskId).targets[0].reason).toMatchObject({ code: 'ASSET_DIGEST_MISMATCH', causeKnown: true, stage: 'download' })
    const httpTask = await submitImage('http')
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith(`/assets/${asset.assetId}/content`) ? Promise.resolve(new Response('', { status: 503 })) : originalFetch(url, init))
    const httpFailure = await send({ action: 'simulate' })
    expect(httpFailure.data.tasks.find((task: any) => task.taskId === httpTask.taskId).targets[0].reason).toMatchObject({ code: 'ASSET_HTTP_ERROR', causeKnown: true, stage: 'download' })
    vi.stubGlobal('fetch', originalFetch)
    const keys = await fetch(`${server.url}/v1/keys`, { headers: { Authorization: `Bearer ${adminKey}` } }).then(response => response.json())
    await api(`/keys/${keys.keys[0].id}/revoke`, {})
    await alarmListener({ name: 'haiqiai-publishing-heartbeat' })
    const revoked = await send({ action: 'status' })
    expect(revoked.data.status).toBe('revoked')
  } finally { await server.close(); rmSync(directory, { recursive: true, force: true }) }
})
