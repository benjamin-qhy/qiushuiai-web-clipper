import { describe, expect, it, vi } from 'vitest'
import { PiAIProvider, extractResponseText } from '../../src/ai/pi'

describe('Pi AI provider', () => {
  it('extracts only text blocks from a Pi response', () => {
    expect(extractResponseText({
      content: [
        { type: 'thinking', thinking: 'hidden' },
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ],
    })).toBe('first\nsecond')
  })

  it('omits reasoning by default and forwards an enabled reasoning level', async () => {
    const completeSimple = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
    })
    const models = {
      getModel: vi.fn().mockReturnValue({ id: 'model-1', provider: 'deepseek' }),
      completeSimple,
    }
    const platform = {
      id: 'deepseek-1',
      provider: 'deepseek',
      apiKey: 'secret',
      customModels: [],
    }

    await new PiAIProvider(platform, 'model-1', 'off', models).complete('hello')
    expect(completeSimple.mock.calls[0][2]).toEqual({ apiKey: 'secret' })

    await new PiAIProvider(platform, 'model-1', 'high', models).complete('hello')
    expect(completeSimple.mock.calls[1][2]).toEqual({ apiKey: 'secret', reasoning: 'high' })
  })

  it('reports a model removed from the selected provider catalog', async () => {
    const models = {
      getModel: vi.fn().mockReturnValue(undefined),
      completeSimple: vi.fn(),
    }
    const provider = new PiAIProvider({
      id: 'deepseek-1',
      provider: 'deepseek',
      apiKey: 'secret',
      customModels: [],
    }, 'removed-model', 'off', models)

    await expect(provider.complete('hello')).rejects.toThrow('所选模型已不可用')
  })
})
