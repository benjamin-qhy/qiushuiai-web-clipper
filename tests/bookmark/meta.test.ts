import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { tabsCreate, tabsGet, tabsRemove, tabsSendMessage, addListener, removeListener, executeScript } = vi.hoisted(() => ({
  tabsCreate: vi.fn(),
  tabsGet: vi.fn(),
  tabsRemove: vi.fn(),
  tabsSendMessage: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  executeScript: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      create: tabsCreate,
      get: tabsGet,
      remove: tabsRemove,
      sendMessage: tabsSendMessage,
      onUpdated: {
        addListener,
        removeListener,
      },
    },
    scripting: {
      executeScript,
    },
  },
}))

import { fetchPageMeta } from '../../src/bookmark/meta'

beforeEach(() => {
  tabsCreate.mockResolvedValue({ id: 123 })
  tabsGet.mockResolvedValue({ status: 'complete' })
  tabsRemove.mockResolvedValue(undefined)
  tabsSendMessage.mockResolvedValue({
    ok: true,
    data: {
      title: 'Loaded',
      description: '页面描述',
      blocks: [],
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('fetchPageMeta', () => {
  it('returns title and description from content script response', async () => {
    const meta = await fetchPageMeta('https://example.com')
    expect(meta.title).toBe('Loaded')
    expect(meta.description).toBe('页面描述')
  })

  it('falls back to first 500 chars of markdown when no description', async () => {
    tabsSendMessage.mockResolvedValue({
      ok: true,
      data: {
        title: 'No Desc',
        blocks: [],
        markdown: 'A'.repeat(600),
      },
    })
    const meta = await fetchPageMeta('https://example.com')
    expect(meta.description).toBe('A'.repeat(500))
  })

  it('falls back to first 500 chars of blocks text when no description and no markdown', async () => {
    tabsSendMessage.mockResolvedValue({
      ok: true,
      data: {
        title: 'Blocks',
        blocks: [
          { type: 'text', spans: [{ text: 'Hello ' }] },
          { type: 'text', spans: [{ text: 'World' }] },
        ],
      },
    })
    const meta = await fetchPageMeta('https://example.com')
    expect(meta.description).toContain('Hello')
    expect(meta.description).toContain('World')
  })

  it('falls back to executeScript when sendMessage fails', async () => {
    tabsSendMessage.mockRejectedValue(new Error('no content script'))
    executeScript.mockResolvedValue([{ result: { title: 'Fallback', keywords: '', description: 'fb desc' } }])
    const meta = await fetchPageMeta('https://example.com')
    expect(meta.title).toBe('Fallback')
    expect(meta.description).toBe('fb desc')
  })

  it('sets timeout to 30 seconds by default', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    await fetchPageMeta('https://example.com')
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 30000)
  })
})
