import { afterEach, expect, it, vi } from 'vitest'
import { registerPublishingConnection } from '../../MultiPost-Extension/src/haiqiai/connection'

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
it('inspects only the Xiaohongshu creator tab from the trusted workspace and reports login without publishing', async () => {
  let listener: Function = () => {}
  const local: Record<string, unknown> = {}
  let url = 'https://creator.xiaohongshu.com/login'
  const executeScript = vi.fn(async ({ func, args }: any) => [{ result: await func(...(args || [])) }])
  vi.stubGlobal('chrome', {
    runtime: { id: 'test', getURL: (p: string) => `chrome-extension://test/${p}`, getManifest: () => ({ version: '1' }), onMessage: { addListener: (f: Function) => { listener = f } }, onStartup: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
    storage: { local: { setAccessLevel: async () => {}, get: async (key: string) => ({ [key]: local[key] }), set: async (value: object) => Object.assign(local, value) } },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    tabs: { query: vi.fn(async () => [{ id: 12, url }]) }, scripting: { executeScript },
  })
  registerPublishingConnection()
  const send = (senderUrl = 'chrome-extension://test/publish.html') => new Promise<any>(resolve => listener({ type: 'HAIQIAI_PUBLISHING_CONNECTION', action: 'inspectXiaohongshu' }, { id: 'test', url: senderUrl }, resolve))
  expect((await send('https://creator.xiaohongshu.com/publish/publish')).error).toBeTruthy()
  expect(executeScript).not.toHaveBeenCalled()
  const login = await send()
  expect(login.data.xiaohongshu).toMatchObject({ status: 'needs_attention', code: 'LOGIN_REQUIRED' })
  expect(executeScript).not.toHaveBeenCalled()
  url = 'https://creator.xiaohongshu.com/publish/publish'
  vi.stubGlobal('location', new URL(url))
  document.body.innerHTML = '<input type="file" multiple><input type="text"><div contenteditable="true"></div><button>发布</button>'
  const click = vi.fn(); document.querySelector('button')!.addEventListener('click', click)
  const inspected = await send()
  expect(inspected.data.xiaohongshu).toMatchObject({ status: 'needs_attention', code: 'ACCOUNT_UNVERIFIED', fields: { imageInput: true, titleInput: true, contentEditor: true } })
  expect(click).not.toHaveBeenCalled()
  expect(document.querySelector('input[type="text"]')).toHaveProperty('value', '')
  expect(JSON.stringify(inspected)).not.toContain('<input')
  document.body.innerHTML = '<div class="user-info"><div class="name-box">测试账号</div></div><div class="others description-text"><div>小红书账号: test-account</div></div>'
  expect((await send()).data.xiaohongshu).toMatchObject({ code: 'ACCOUNT_UNVERIFIED', displayName: '测试账号', creatorAccountNumber: 'test-account' })
  vi.stubGlobal('location', new URL('https://example.com/'))
  expect((await send()).data.xiaohongshu).toMatchObject({ code: 'PAGE_UNAVAILABLE' })
})

it('compares the requested profile identity with the creator account number rather than nickname', async () => {
  let listener: Function = () => {}
  const local: Record<string, unknown> = {}
  const stableId = '692d2f9a00000000310171f2'
  const creatorUrl = 'https://creator.xiaohongshu.com/new/home'
  const profileUrl = `https://www.xiaohongshu.com/user/profile/${stableId}`
  let profileNumber = '27786321025'
  vi.stubGlobal('chrome', {
    runtime: { id: 'test', getURL: (p: string) => `chrome-extension://test/${p}`, getManifest: () => ({ version: '1' }), onMessage: { addListener: (f: Function) => { listener = f } }, onStartup: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
    storage: { local: { setAccessLevel: async () => {}, get: async (key: string) => ({ [key]: local[key] }), set: async (value: object) => Object.assign(local, value) } },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    tabs: { query: async ({ url }: any) => url.includes('creator.') ? [{ id: 1, url: creatorUrl }] : [{ id: 2, url: profileUrl }] },
    scripting: { executeScript: async ({ target, func, args }: any) => {
      vi.stubGlobal('location', new URL(target.tabId === 1 ? creatorUrl : profileUrl))
      document.body.innerHTML = target.tabId === 1 ? '<div class="user-info"><span class="name-box">秋水聊AI落地</span></div><div class="others description-text"><div>小红书账号: 27731394763</div></div>' : `<span class="user-redId">小红书号：${profileNumber}</span>`
      return [{ result: await func(...(args || [])) }]
    } },
  })
  registerPublishingConnection()
  const send = () => new Promise<any>(resolve => listener({ type: 'HAIQIAI_PUBLISHING_CONNECTION', action: 'inspectXiaohongshu', platformAccountId: stableId }, { id: 'test', url: 'chrome-extension://test/publish.html' }, resolve))
  expect((await send()).data.xiaohongshu).toMatchObject({ code: 'ACCOUNT_MISMATCH', creatorAccountNumber: '27731394763' })
  profileNumber = '27731394763'
  expect((await send()).data.xiaohongshu).toMatchObject({ code: 'ACCOUNT_MATCHED', platformAccountId: stableId })
})
