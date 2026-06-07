import type { AIConfig } from '../storage/settings'
import type { AIProvider } from './types'
import { OpenAICompatibleProvider } from './aliyun'

export function createAIProvider(config: AIConfig): AIProvider {
  return new OpenAICompatibleProvider(config)
}
