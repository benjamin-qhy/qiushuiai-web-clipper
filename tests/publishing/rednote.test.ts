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
