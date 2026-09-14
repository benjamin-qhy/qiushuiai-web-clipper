import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/storage/settings'

const { mockStorage, storageGet, storageSet } = vi.hoisted(() => {
  const mockStorage: Record<string, unknown> = {}
  return {
    mockStorage,
    storageGet: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
    storageSet: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(mockStorage, obj)
    }),
  }
})

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
      },
    },
  },
}))

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  storageGet.mockClear()
  storageSet.mockClear()
})

describe('getSettings', () => {
  it('returns defaults when nothing stored', async () => {
    const s = await getSettings()
    expect(s.subDir).toBe('Clippings')
    expect(s.imageMode).toBe('local')
    expect(s.ossProvider).toBe('aliyun')
    expect(s.aliyunOSS.prefix).toBe('qiushui-web-clipper')
    expect(s.aliyunOSS.customDomain).toBe('')
    expect(s.getNote.clientId).toBe('')
    expect(s.getNote.authToken).toBe('')
    expect(s.aiPlatforms).toEqual([])
    expect(s.lastUsedAIModel).toBeNull()
  })

  it('merges stored values over defaults', async () => {
    mockStorage['feishu-clipper-settings'] = { subDir: 'Notes', imageMode: 'oss' }
    const s = await getSettings()
    expect(s.subDir).toBe('Notes')
    expect(s.imageMode).toBe('oss')
    expect(s.aliyunOSS.region).toBe('oss-cn-hangzhou')
  })

  it('merges nested get note settings over defaults', async () => {
    mockStorage['feishu-clipper-settings'] = { getNote: { clientId: 'cli_123' } }
    const s = await getSettings()
    expect(s.getNote.clientId).toBe('cli_123')
    expect(s.getNote.authToken).toBe('')
  })

  it('migrates the legacy AI config without losing its endpoint or model', async () => {
    mockStorage['feishu-clipper-settings'] = {
      aiConfig: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'legacy-key',
        model: 'qwen-long',
      },
    }

    const s = await getSettings()

    expect(s.aiPlatforms).toEqual([{
      id: 'legacy-openai-compatible',
      provider: 'openai-compatible',
      apiKey: 'legacy-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      customModels: ['qwen-long'],
    }])
    expect(s.lastUsedAIModel).toEqual({
      platformId: 'legacy-openai-compatible',
      modelId: 'qwen-long',
    })
  })

  it('keeps any number of configured platforms', async () => {
    const aiPlatforms = Array.from({ length: 5 }, (_, index) => ({
      id: `platform-${index}`,
      provider: `provider-${index}`,
      apiKey: `key-${index}`,
      customModels: [],
    }))
    mockStorage['feishu-clipper-settings'] = { aiPlatforms }

    const s = await getSettings()

    expect(s.aiPlatforms).toHaveLength(5)
  })

  it('clears a last-used selection whose platform no longer exists', async () => {
    mockStorage['feishu-clipper-settings'] = {
      aiPlatforms: [],
      lastUsedAIModel: { platformId: 'deleted', modelId: 'missing' },
    }

    const s = await getSettings()

    expect(s.lastUsedAIModel).toBeNull()
  })
})

describe('saveSettings', () => {
  it('persists settings to browser.storage.local', async () => {
    const settings = { ...DEFAULT_SETTINGS, subDir: 'Archive' }
    await saveSettings(settings)
    const stored = mockStorage['feishu-clipper-settings'] as typeof settings
    expect(stored.subDir).toBe('Archive')
  })
})
