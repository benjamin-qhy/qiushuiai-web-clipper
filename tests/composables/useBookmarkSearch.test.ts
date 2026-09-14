import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBookmarkSearch } from '../../src/composables/useBookmarkSearch'

const { bookmarksGetTree, getSettingsMock, aiCompleteMock } = vi.hoisted(() => ({
  bookmarksGetTree: vi.fn(),
  getSettingsMock: vi.fn(),
  aiCompleteMock: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    bookmarks: {
      getTree: bookmarksGetTree,
    },
  },
}))

vi.mock('../../src/storage/settings', () => ({
  getSettings: getSettingsMock,
}))

vi.mock('../../src/ai', () => ({
  createDefaultAIProvider: () => ({
    complete: aiCompleteMock,
  }),
}))

describe('useBookmarkSearch.aiSearch', () => {
  beforeEach(() => {
    bookmarksGetTree.mockReset()
    getSettingsMock.mockReset()
    aiCompleteMock.mockReset()

    bookmarksGetTree.mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            children: [
              { id: '2', title: 'React Docs', url: 'https://react.dev/reference/react' },
            ],
          },
        ],
      },
    ])

    getSettingsMock.mockResolvedValue({
      aiPlatforms: [{
        id: 'custom-1',
        provider: 'openai-compatible',
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
        customModels: ['test-model'],
      }],
      lastUsedAIModel: { platformId: 'custom-1', modelId: 'test-model' },
    })

    aiCompleteMock.mockResolvedValue('{"indices":[0]}')
  })

  it('sends domain instead of summary in the AI search prompt', async () => {
    const search = useBookmarkSearch()
    const recordsMap = new Map([
      ['2', {
        id: '2',
        url: 'https://react.dev/reference/react',
        title: 'React Docs',
        summary: 'React 官方文档摘要',
        tags: ['React', '前端'],
        category: '开发/前端',
        processedAt: 1,
      }],
    ])

    await search.aiSearch('react', recordsMap)

    expect(aiCompleteMock).toHaveBeenCalledWith(
      expect.stringContaining('域名: react.dev'),
      expect.any(String)
    )
    expect(aiCompleteMock).not.toHaveBeenCalledWith(
      expect.stringContaining('摘要: React 官方文档摘要'),
      expect.any(String)
    )
  })

  it('logs submit payload and response payload to the console', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const search = useBookmarkSearch()
    const recordsMap = new Map([
      ['2', {
        id: '2',
        url: 'https://react.dev/reference/react',
        title: 'React Docs',
        summary: 'React 官方文档摘要',
        tags: ['React', '前端'],
        category: '开发/前端',
        processedAt: 1,
      }],
    ])

    await search.aiSearch('react', recordsMap)

    expect(logSpy).toHaveBeenCalledWith(
      '[bookmark-ai-search] submit',
      expect.objectContaining({
        query: 'react',
        bookmarkCount: 1,
        systemPrompt: expect.any(String),
        userPrompt: expect.stringContaining('域名: react.dev'),
      }),
    )
    expect(logSpy).toHaveBeenCalledWith(
      '[bookmark-ai-search] response',
      expect.objectContaining({
        query: 'react',
        rawResponse: '{"indices":[0]}',
        parsedIndices: [0],
      }),
    )

    logSpy.mockRestore()
  })
})
