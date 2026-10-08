import type { AIPlatformConfig } from '../storage/settings'
import type { AIProvider } from './types'
import { OpenAICompatibleProvider } from './aliyun'
import { PiAIProvider } from './pi'
import { type AIReasoningLevel } from './catalog'

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
