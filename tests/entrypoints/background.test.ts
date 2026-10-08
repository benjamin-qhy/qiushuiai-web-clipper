import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { browser, listeners } = vi.hoisted(() => {
  const listeners: Record<string, (...args: any[]) => void> = {}
  const event = (name: string) => ({ addListener: vi.fn((callback) => { listeners[name] = callback }) })
  return {
    listeners,
    browser: {
      action: { setPopup: vi.fn().mockResolvedValue(undefined), onClicked: event('clicked') },
      sidePanel: {
        setOptions: vi.fn().mockResolvedValue(undefined),
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
        open: vi.fn().mockResolvedValue(undefined),
      },
      runtime: { onInstalled: event('installed'), onStartup: event('startup') },
      tabs: {
        query: vi.fn().mockResolvedValue([]), get: vi.fn(),
        onActivated: event('activated'), onUpdated: event('updated'),
      },
    },
  }
})
vi.mock('wxt/browser', () => ({ browser }))

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.stubGlobal('chrome', {
    storage: { local: { setAccessLevel: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue({}) } },
    alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: { addListener: vi.fn() } },
    runtime: { onMessage: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
  })
  vi.stubGlobal('defineBackground', (definition: { main: () => void }) => definition)
  const background = await import('../../entrypoints/background')
  background.default.main()
  browser.sidePanel.setOptions.mockClear()
})

describe('tab action routing', () => {
  it('keeps the clipper popup and disables the side panel on ordinary pages', async () => {
    listeners.updated(7, { url: 'https://example.com/article' }, {})
    await vi.waitFor(() => expect(browser.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 7, enabled: false }))
    expect(browser.action.setPopup).toHaveBeenCalledWith({ tabId: 7, popup: 'popup.html' })
  })

  it('keeps the Douyin favorites panel and opens it when the action is clicked', async () => {
    const url = 'https://www.douyin.com/user/self?showTab=favorite_collection'
    listeners.updated(8, { url }, {})
    await vi.waitFor(() => expect(browser.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 8, enabled: true, path: 'douyin-sidepanel.html?tabId=8',
    }))
    expect(browser.action.setPopup).toHaveBeenCalledWith({ tabId: 8, popup: '' })
    listeners.clicked({ id: 8, url })
    expect(browser.sidePanel.open).toHaveBeenCalledWith({ tabId: 8 })
  })
})

afterEach(() => vi.unstubAllGlobals())
