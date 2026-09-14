import { describe, expect, it, vi } from 'vitest'
import {
  CARD_MARKDOWN_OUTPUT_CONTRACT,
  generatePublisherMarkdown,
  getPublisherModelChoices,
  resolvePublisherModelSelection,
} from '../../src/publisher/ai'
import type { Settings } from '../../src/storage/settings'

const settings = {
  aiPlatforms: [{
    id: 'custom-1',
    provider: 'openai-compatible',
    apiKey: 'key',
    baseUrl: 'https://example.com/v1',
    customModels: ['model-a', 'model-b'],
  }],
  lastUsedAIModel: { platformId: 'custom-1', modelId: 'model-b' },
  lastUsedAIReasoning: 'high',
  systemPrompts: [{ id: 'prompt-1', title: '知识卡片', content: '提炼核心观点。' }],
} as Settings

describe('publisher AI adapter', () => {
  it('lists every configured model and clamps the saved reasoning to model capabilities', () => {
    expect(getPublisherModelChoices(settings).map(model => model.modelId)).toEqual(['model-a', 'model-b'])
    expect(resolvePublisherModelSelection(settings)).toEqual({
      platformId: 'custom-1',
      modelId: 'model-b',
      reasoning: 'high',
    })

    const unsupported = { ...settings, lastUsedAIReasoning: 'xhigh' } as Settings
    expect(resolvePublisherModelSelection(unsupported)?.reasoning).toBe('off')

    const missingCredential = {
      ...settings,
      aiPlatforms: [{ ...settings.aiPlatforms[0], apiKey: ' ' }],
    } as Settings
    expect(getPublisherModelChoices(missingCredential)).toEqual([])
    expect(resolvePublisherModelSelection(missingCredential)).toBeNull()

    const missingBaseUrl = {
      ...settings,
      aiPlatforms: [{ ...settings.aiPlatforms[0], baseUrl: ' ' }],
    } as Settings
    expect(getPublisherModelChoices(missingBaseUrl)).toEqual([])
    expect(resolvePublisherModelSelection(missingBaseUrl)).toBeNull()
  })

  it('requests text Markdown and persists model preferences only after success', async () => {
    const complete = vi.fn().mockResolvedValue('## 创作稿')
    const save = vi.fn().mockResolvedValue(undefined)
    const createProvider = vi.fn(() => ({ complete, testConnection: vi.fn() }))
    const latestSettings = { ...settings, systemPrompts: [{ id: 'new', title: '新提示词', content: '保留我' }] }

    const result = await generatePublisherMarkdown({
      sourceMarkdown: '# 原文',
      instruction: '提炼核心观点。',
      model: { platformId: 'custom-1', modelId: 'model-a', reasoning: 'low' },
    }, settings, { createProvider, getLatestSettings: vi.fn().mockResolvedValue(latestSettings), save })

    expect(result).toBe('## 创作稿')
    expect(complete).toHaveBeenCalledWith(
      '# 原文',
      expect.stringContaining(CARD_MARKDOWN_OUTPUT_CONTRACT),
      { responseFormat: 'text' },
    )
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompts: latestSettings.systemPrompts,
      lastUsedAIModel: { platformId: 'custom-1', modelId: 'model-a' },
      lastUsedAIReasoning: 'low',
    }))
  })

  it('does not replace saved preferences when generation fails', async () => {
    const save = vi.fn()
    const createProvider = vi.fn(() => ({
      complete: vi.fn().mockRejectedValue(new Error('上游失败')),
      testConnection: vi.fn(),
    }))
    const getLatestSettings = vi.fn()

    await expect(generatePublisherMarkdown({
      sourceMarkdown: '# 原文',
      instruction: '提炼核心观点。',
      model: { platformId: 'custom-1', modelId: 'model-a', reasoning: 'low' },
    }, settings, { createProvider, getLatestSettings, save })).rejects.toThrow('上游失败')
    expect(getLatestSettings).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects an empty model response without changing preferences', async () => {
    const save = vi.fn()
    const getLatestSettings = vi.fn()
    const createProvider = vi.fn(() => ({
      complete: vi.fn().mockResolvedValue('   '),
      testConnection: vi.fn(),
    }))

    await expect(generatePublisherMarkdown({
      sourceMarkdown: '# 原文',
      instruction: '提炼核心观点。',
      model: { platformId: 'custom-1', modelId: 'model-a', reasoning: 'low' },
    }, settings, { createProvider, getLatestSettings, save })).rejects.toThrow('模型未返回内容')
    expect(getLatestSettings).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})
