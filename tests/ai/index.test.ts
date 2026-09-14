import { describe, expect, it } from 'vitest'
import { createDefaultAIProvider } from '../../src/ai'
import { DEFAULT_SETTINGS, type Settings } from '../../src/storage/settings'

describe('createDefaultAIProvider', () => {
  it('fails clearly when no configured platform has a model', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      aiPlatforms: [],
      lastUsedAIModel: null,
    }

    expect(() => createDefaultAIProvider(settings)).toThrow('尚未配置可用的 AI 模型')
  })

  it('creates a provider from the last-used valid model', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      aiPlatforms: [{
        id: 'custom-1',
        provider: 'openai-compatible',
        apiKey: 'key',
        baseUrl: 'https://example.com/v1',
        customModels: ['model-a', 'model-b'],
      }],
      lastUsedAIModel: { platformId: 'custom-1', modelId: 'model-b' },
    } satisfies Settings

    expect(createDefaultAIProvider(settings)).toBeDefined()
  })
})
