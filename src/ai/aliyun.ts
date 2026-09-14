import type { AIConfig } from '../storage/settings'
import type { AICompletionOptions, AIProvider } from './types'
import type { AIReasoningLevel } from './catalog'

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private config: AIConfig,
    private reasoning: AIReasoningLevel = 'off',
  ) {}

  async complete(
    userPrompt: string,
    systemPrompt?: string,
    options?: AICompletionOptions,
  ): Promise<string> {
    const messages: { role: string; content: string }[] = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    const res = await fetch(this.chatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        ...(options?.responseFormat === 'text'
          ? {}
          : { response_format: { type: 'json_object' } }),
        enable_thinking: this.reasoning !== 'off',
        ...(this.reasoning === 'off' ? {} : { reasoning_effort: this.reasoning }),
      }),
    })
    if (!res.ok) {
      let detail = ''
      if (typeof res.text === 'function') {
        const raw = await res.text().catch(() => '')
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
            detail = parsed.error?.message ?? parsed.message ?? raw
          } catch {
            detail = raw
          }
        }
      }
      throw new Error(`AI API error: ${res.status}${detail ? ` - ${detail}` : ''}`)
    }
    const data = await res.json() as { choices: { message: { content: string } }[] }
    return data.choices[0]?.message?.content ?? ''
  }

  async testConnection(): Promise<void> {
    const res = await fetch(this.chatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 8,
      }),
    })
    if (!res.ok) throw new Error(`AI API error: ${res.status}`)
    await res.json()
  }

  private chatCompletionsUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/g, '')}/chat/completions`
  }
}
