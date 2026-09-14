import type { AssistantMessage, Model, ThinkingLevel } from '@earendil-works/pi-ai'
import type { AIPlatformConfig } from '../storage/settings'
import type { AICompletionOptions, AIProvider } from './types'
import type { AIReasoningLevel } from './catalog'
import { getPiModels } from './catalog'

interface PiModelsLike {
  getModel(provider: string, modelId: string): Model<any> | undefined
  completeSimple(
    model: Model<any>,
    context: { systemPrompt?: string; messages: Array<{ role: 'user'; content: string; timestamp: number }> },
    options?: { apiKey?: string; reasoning?: ThinkingLevel },
  ): Promise<Pick<AssistantMessage, 'content'> & Partial<Pick<AssistantMessage, 'errorMessage' | 'stopReason'>>>
}

export function extractResponseText(response: Pick<AssistantMessage, 'content'>): string {
  return response.content
    .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

export class PiAIProvider implements AIProvider {
  constructor(
    private platform: AIPlatformConfig,
    private modelId: string,
    private reasoning: AIReasoningLevel = 'off',
    private models: PiModelsLike = getPiModels(),
  ) {}

  async complete(
    userPrompt: string,
    systemPrompt?: string,
    _options?: AICompletionOptions,
  ): Promise<string> {
    if (!this.platform.apiKey.trim()) throw new Error('请先填写 API Key')
    const model = this.models.getModel(this.platform.provider, this.modelId)
    if (!model) throw new Error('所选模型已不可用，请重新选择')

    const options = this.reasoning === 'off'
      ? { apiKey: this.platform.apiKey.trim() }
      : { apiKey: this.platform.apiKey.trim(), reasoning: this.reasoning }
    const response = await this.models.completeSimple(model, {
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt, timestamp: Date.now() }],
    }, options)

    if (response.stopReason === 'error') {
      throw new Error(response.errorMessage || '模型调用失败')
    }
    return extractResponseText(response as Pick<AssistantMessage, 'content'>)
  }

  async testConnection(): Promise<void> {
    await this.complete('Reply with OK.')
  }
}
