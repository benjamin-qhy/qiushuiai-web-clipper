import type { AIPlatformConfig, Settings } from '../storage/settings'
import type { AIProvider } from './types'
import { OpenAICompatibleProvider } from './aliyun'
import { PiAIProvider } from './pi'
import { getAvailableModelSelection, type AIReasoningLevel } from './catalog'

export function createAIProvider(
  platform: AIPlatformConfig,
  modelId: string,
  reasoning: AIReasoningLevel = 'off',
): AIProvider {
  if (platform.provider === 'openai-compatible') {
    return new OpenAICompatibleProvider({
      baseUrl: platform.baseUrl ?? '',
      apiKey: platform.apiKey,
      model: modelId,
    }, reasoning)
  }
  return new PiAIProvider(platform, modelId, reasoning)
}

export function createDefaultAIProvider(settings: Settings): AIProvider {
  const selection = getAvailableModelSelection(settings)
  if (!selection) throw new Error('尚未配置可用的 AI 模型')
  return createAIProvider(selection.platform, selection.modelId)
}
