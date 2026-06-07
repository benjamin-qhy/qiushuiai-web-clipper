import { describe, it, expect, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../../src/ai/aliyun'

describe('OpenAICompatibleProvider', () => {
  it('returns content from successful API response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"摘要","tags":["前端"],"category":"技术"}' } }],
      }),
    } as unknown as Response)

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
    })
    const result = await provider.complete('prompt')
    expect(result).toBe('{"summary":"摘要","tags":["前端"],"category":"技术"}')
  })

  it('disables thinking explicitly in chat completions requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"indices":[0]}' } }],
      }),
    })
    global.fetch = fetchMock

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
    })

    await provider.complete('prompt', 'system')

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        model: 'test-model',
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'prompt' },
        ],
        response_format: { type: 'json_object' },
        enable_thinking: false,
      }),
    }))
  })

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model: '',
    })
    await expect(provider.complete('prompt')).rejects.toThrow('AI API error: 401')
  })

  it('tests model availability with a lightweight chat completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
    })
    global.fetch = fetchMock

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1/',
      apiKey: 'test-key',
      model: 'test-model',
    })

    await provider.testConnection()

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 8,
      }),
    }))
  })
})
