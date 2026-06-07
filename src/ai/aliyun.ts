import type { AIConfig } from '../storage/settings'
import type { AIProvider } from './types'

export class OpenAICompatibleProvider implements AIProvider {
  constructor(private config: AIConfig) {}

  async complete(userPrompt: string, systemPrompt?: string): Promise<string> {
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
        response_format: { type: 'json_object' },
        enable_thinking: false,
      }),
    })
    if (!res.ok) throw new Error(`AI API error: ${res.status}`)
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
