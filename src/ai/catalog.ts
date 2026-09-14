import { getSupportedThinkingLevels, type ThinkingLevel } from '@earendil-works/pi-ai'
import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import type { AIPlatformConfig, Settings } from '../storage/settings'
import type { AIReasoningLevel } from './types'

export type { AIReasoningLevel } from './types'

export interface AIProviderOption {
  id: string
  name: string
}

export interface AIModelOption {
  id: string
  name: string
  provider: string
  reasoning: boolean
  reasoningLevels: ThinkingLevel[]
}

const unsupportedBrowserProviders = new Set([
  'amazon-bedrock',
  'azure-openai-responses',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'github-copilot',
  'google-vertex',
  'openai-codex',
  'radius',
])

const models = builtinModels()

export function getProviderOptions(): AIProviderOption[] {
  const providers = models.getProviders()
    .filter(provider => !unsupportedBrowserProviders.has(provider.id))
    .map(provider => ({ id: provider.id, name: provider.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...providers, { id: 'openai-compatible', name: 'OpenAI 兼容服务' }]
}

export function getModelOptions(platform: AIPlatformConfig): AIModelOption[] {
  if (platform.provider === 'openai-compatible') {
    return platform.customModels
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => ({
        id,
        name: id,
        provider: platform.provider,
        reasoning: true,
        reasoningLevels: ['low', 'medium', 'high'],
      }))
  }

  return models.getModels(platform.provider).map(model => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    reasoning: model.reasoning,
    reasoningLevels: getSupportedThinkingLevels(model)
      .filter((level): level is ThinkingLevel => level !== 'off'),
  }))
}

export function getAvailableModelSelection(settings: Settings): {
  platform: AIPlatformConfig
  modelId: string
} | null {
  if (settings.lastUsedAIModel) {
    const platform = settings.aiPlatforms.find(
      item => item.id === settings.lastUsedAIModel?.platformId,
    )
    const modelExists = platform && getModelOptions(platform).some(
      model => model.id === settings.lastUsedAIModel?.modelId,
    )
    if (platform && modelExists) {
      return { platform, modelId: settings.lastUsedAIModel.modelId }
    }
  }

  for (const platform of settings.aiPlatforms) {
    const model = getModelOptions(platform)[0]
    if (model) return { platform, modelId: model.id }
  }

  return null
}

export function getPiModels() {
  return models
}
