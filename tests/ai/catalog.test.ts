import { describe, expect, it } from 'vitest'
import {
  getAvailableModelSelection,
  getModelOptions,
  getProviderOptions,
} from '../../src/ai/catalog'
import type { Settings } from '../../src/storage/settings'

describe('AI model catalog', () => {
  it('lists browser API-key providers and excludes unsupported authentication flows', () => {
    const ids = getProviderOptions().map(provider => provider.id)

    expect(ids).toContain('deepseek')
    expect(ids).toContain('openai-compatible')
    expect(ids).not.toContain('amazon-bedrock')
    expect(ids).not.toContain('github-copilot')
    expect(ids).not.toContain('openai-codex')
  })

  it('returns all Pi models owned by the selected provider', () => {
    const models = getModelOptions({
      id: 'deepseek-1',
      provider: 'deepseek',
      apiKey: 'key',
      customModels: [],
    })

    expect(models.length).toBeGreaterThan(0)
    expect(models.every(model => model.provider === 'deepseek')).toBe(true)
  })

  it('uses configured model names for a custom OpenAI-compatible platform', () => {
    const models = getModelOptions({
      id: 'custom-1',
      provider: 'openai-compatible',
      apiKey: 'key',
      baseUrl: 'https://example.com/v1',
      customModels: ['model-a', 'model-b'],
    })

    expect(models.map(model => model.id)).toEqual(['model-a', 'model-b'])
  })

  it('prefers the last-used valid model and otherwise falls back to the first configured model', () => {
    const settings = {
      aiPlatforms: [
        {
          id: 'custom-1',
          provider: 'openai-compatible',
          apiKey: 'key',
          baseUrl: 'https://example.com/v1',
          customModels: ['model-a', 'model-b'],
        },
      ],
      lastUsedAIModel: { platformId: 'custom-1', modelId: 'model-b' },
    } as Settings

    expect(getAvailableModelSelection(settings)).toEqual({
      platform: settings.aiPlatforms[0],
      modelId: 'model-b',
    })

    settings.lastUsedAIModel = { platformId: 'custom-1', modelId: 'removed' }
    expect(getAvailableModelSelection(settings)?.modelId).toBe('model-a')
  })
})
