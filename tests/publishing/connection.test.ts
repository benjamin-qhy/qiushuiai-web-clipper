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
    const liveTask = await api('/tasks', { executionMode: 'live', confirmation: { action: 'prepare', confirmedAt: new Date().toISOString(), contentRevision: 'live-r1' }, targets: [{ clientTargetId: 'live', computerId: executor.computerId, browserId: executor.browserId, profileId: executor.profileId, accountId: account.id, platform: 'xiaohongshu', content: { type: 'dynamic', title: '正式测试', content: '保持原文', tags: ['人工智能'], imageAssetIds: [asset.assetId] } }] })
    Object.assign(globalThis.chrome, { tabs: { query: async () => [] } })
    const liveResult = await send({ action: 'prepare' })
    expect(liveResult.data.tasks.find((task: any) => task.taskId === liveTask.taskId)).toMatchObject({ executionMode: 'live', counts: { needs_attention: 1 }, targets: [{ reason: { code: 'PAGE_REQUIRED', stage: 'validation', causeKnown: true, retryable: false } }] })
    expect(JSON.stringify(liveResult)).not.toContain('leaseToken')
    const liveAccount = await api('/accounts', { executorId: executor.id, platform: 'xiaohongshu', platformAccountId: '6a275c1f0000000001007c00', displayName: '真实账号' })
    Object.assign(globalThis.chrome, {
      tabs: { query: async ({ url }: any) => url.includes('creator.') ? [{ id: 1, url: 'https://creator.xiaohongshu.com/new/home' }] : [{ id: 2, url: 'https://www.xiaohongshu.com/user/profile/6a275c1f0000000001007c00' }] },
      scripting: { executeScript: async ({ target }: any) => [{ result: target.tabId === 1 ? { creatorAccountNumber: '27731394763', displayName: '真实账号' } : { platformAccountId: '6a275c1f0000000001007c00', number: '27731394763' } }] },
    })
    const submitLive = (revision: string, action = 'prepare') => api('/tasks', { executionMode: 'live', confirmation: { action, confirmedAt: new Date().toISOString(), contentRevision: revision }, targets: [{ clientTargetId: revision, computerId: executor.computerId, browserId: executor.browserId, profileId: executor.profileId, accountId: liveAccount.id, platform: 'xiaohongshu', content: { type: 'dynamic', title: '正式内容', content: '不得截断', tags: ['人工智能'], imageAssetIds: [asset.assetId] } }] })
    const realFetch = globalThis.fetch
    const liveReceiptTask = await submitLive('live-lost-event')
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const response = await realFetch(url, init)
      if (url.endsWith('/events')) throw new TypeError('lost live event response')
      return response
    })
    expect((await send({ action: 'prepare' })).error).toContain('真实任务')
    vi.stubGlobal('fetch', realFetch)
    const liveReplay = await send({ action: 'prepare' })
    expect(liveReplay.data.tasks.find((task: any) => task.taskId === liveReceiptTask.taskId)).toMatchObject({ counts: { needs_attention: 1 }, targets: [{ reason: { code: 'READONLY_CHECKED', stage: 'validation', causeKnown: true } }] })
    expect(liveReplay.data.accounts.find((item: any) => item.id === liveAccount.id).bindingState).toBe('matched')
    const liveDigestTask = await submitLive('live-digest-failure')
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith('/content') ? Promise.resolve(new Response('EVIL')) : realFetch(url, init))
    const badLive = await send({ action: 'prepare' })
    expect(badLive.data.tasks.find((task: any) => task.taskId === liveDigestTask.taskId)).toMatchObject({ counts: { needs_attention: 1 }, targets: [{ reason: { code: 'ASSET_DIGEST_MISMATCH', stage: 'download', causeKnown: true } }] })
    vi.stubGlobal('fetch', realFetch)
    const fillTask = await submitLive('fill-native-topics', 'fill')
    let editorCalls = 0
    Object.assign(globalThis.chrome.tabs, { create: async ({ url }: any) => ({ id: url.includes('/user/profile/') ? 2 : url.includes('/new/home') ? 3 : 4, url }), get: async (id: number) => ({ id, status: 'complete', url: id === 2 ? 'https://www.xiaohongshu.com/user/profile/6a275c1f0000000001007c00' : id === 3 ? 'https://creator.xiaohongshu.com/new/home' : 'https://creator.xiaohongshu.com/publish/publish' }), remove: async () => {} })
    globalThis.chrome.scripting.executeScript = (async ({ target, args }: any) => {
      if (target.tabId === 4) { editorCalls++; expect(args[0]).toMatchObject({ title: '正式内容', content: '不得截断', tags: ['人工智能'], images: [{ name: 'test.png', size: 4, url: 'data:image/png;base64,R09PRA==' }] }); return [{ result: { ok: true, code: 'AWAITING_PUBLISH_CONFIRMATION' } }] }
      return [{ result: target.tabId === 2 ? { platformAccountId: '6a275c1f0000000001007c00', number: '27731394763' } : { creatorAccountNumber: '27731394763', displayName: '真实账号' } }]
    }) as any
    const filled = await send({ action: 'prepare' })
    expect(filled.data.tasks.find((item: any) => item.taskId === fillTask.taskId)).toMatchObject({ counts: { needs_attention: 1 }, targets: [{ reason: { code: 'AWAITING_PUBLISH_CONFIRMATION', stage: 'preparation' } }] })
    await send({ action: 'prepare' }); expect(editorCalls).toBe(1)
    const digestTask = await submitImage('digest')
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith(`/assets/${asset.assetId}/content`) ? Promise.resolve(new Response('EVIL')) : originalFetch(url, init))
    const digestFailure = await send({ action: 'simulate' })
    expect(digestFailure.data.tasks.find((task: any) => task.taskId === digestTask.taskId).targets[0].reason).toMatchObject({ code: 'ASSET_DIGEST_MISMATCH', causeKnown: true, stage: 'download' })
    const httpTask = await submitImage('http')
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith(`/assets/${asset.assetId}/content`) ? Promise.resolve(new Response('', { status: 403 })) : originalFetch(url, init))
    const httpFailure = await send({ action: 'simulate' })
    expect(httpFailure.data.tasks.find((task: any) => task.taskId === httpTask.taskId).targets[0].reason).toMatchObject({ code: 'ASSET_HTTP_ERROR', causeKnown: true, stage: 'download' })
    vi.stubGlobal('fetch', originalFetch)
    const metadataTask = await submitImage('metadata-denied')
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => url.endsWith(`/assets/${asset.assetId}`) ? Promise.resolve(new Response('{}', { status: 403 })) : originalFetch(url, init))
    const metadataFailure = await send({ action: 'simulate' })
    expect(metadataFailure.data.tasks.find((task: any) => task.taskId === metadataTask.taskId).targets[0].reason).toMatchObject({ code: 'ASSET_HTTP_ERROR', causeKnown: true, stage: 'download' })
    vi.stubGlobal('fetch', originalFetch)
    const retryTask = await submitImage('bounded-retries')
    let downloads = 0
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (url.endsWith(`/assets/${asset.assetId}/content`)) { downloads++; return Promise.resolve(new Response('', { status: 503, headers: { 'Retry-After': '8' } })) }
      return originalFetch(url, init)
    })
    const clock = vi.spyOn(Date, 'now'); const baseTime = Date.now()
    try {
      clock.mockReturnValue(baseTime)
      await send({ action: 'simulate' }); expect(downloads).toBe(1)
      clock.mockReturnValue(baseTime + 5000); await send({ action: 'simulate' }); expect(downloads).toBe(1)
      clock.mockReturnValue(baseTime + 8000); await send({ action: 'simulate' }); expect(downloads).toBe(2)
      clock.mockReturnValue(baseTime + 23000)
      const exhausted = await send({ action: 'simulate' })
      expect(exhausted.data.tasks.find((task: any) => task.taskId === retryTask.taskId).targets[0]).toMatchObject({ state: 'failed', reason: { code: 'ASSET_HTTP_ERROR', retryable: false } })
      await send({ action: 'simulate' }); expect(downloads).toBe(3)
    } finally { clock.mockRestore(); vi.stubGlobal('fetch', originalFetch) }
    const receiptTask = await submitImage('lost-event-response')
    let receiptIntents = 0
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const response = await originalFetch(url, init)
      if (url.endsWith('/submit-intent')) receiptIntents++
      if (url.endsWith('/events')) throw new TypeError('response lost after accepted event')
      return response
    })
    expect((await send({ action: 'simulate' })).error).toBeTruthy()
    vi.stubGlobal('fetch', originalFetch)
    registerPublishingConnection()
    const replayed = await send({ action: 'simulate' })
    expect(replayed.data.tasks.find((task: any) => task.taskId === receiptTask.taskId).counts).toEqual({ draft_saved: 1 })
    expect(receiptIntents).toBe(1)
    const interruptedTask = await submitImage('lost-submit-response')
    let intents = 0
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const response = await originalFetch(url, init)
      if (url.endsWith('/submit-intent')) { intents++; throw new TypeError('connection lost after server accepted intent') }
      return response
    })
    expect((await send({ action: 'simulate' })).error).toBeTruthy()
    vi.stubGlobal('fetch', originalFetch)
    registerPublishingConnection() // service worker restarted, persistent storage retained
    const recovered = await send({ action: 'simulate' })
    const interrupted = recovered.data.tasks.find((task: any) => task.taskId === interruptedTask.taskId).targets[0]
    expect(interrupted).toMatchObject({ state: 'outcome_unknown', reason: { causeKnown: false, retryable: false } })
    expect(intents).toBe(1)
    const queried = await send({ action: 'reconcile', targetId: interrupted.id })
    expect(queried.data.tasks.find((task: any) => task.taskId === interruptedTask.taskId).targets[0].state).toBe('outcome_unknown')
    const keys = await fetch(`${server.url}/v1/keys`, { headers: { Authorization: `Bearer ${adminKey}` } }).then(response => response.json())
    await api(`/keys/${keys.keys[0].id}/revoke`, {})
    await alarmListener({ name: 'haiqiai-publishing-heartbeat' })
    const revoked = await send({ action: 'status' })
    expect(revoked.data.status).toBe('revoked')
  } finally { await server.close(); rmSync(directory, { recursive: true, force: true }) }
})
