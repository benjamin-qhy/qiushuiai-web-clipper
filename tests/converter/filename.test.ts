import { describe, it, expect, vi } from 'vitest'
import { sanitizeFilename, resolveFilename, chooseFilename } from '../../src/converter/filename'

describe('sanitizeFilename', () => {
  it('normal title', () => {
    expect(sanitizeFilename('我的会议记录')).toBe('我的会议记录')
  })

  it('strips illegal chars', () => {
    expect(sanitizeFilename('file/name:test*?')).toBe('filenametest')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello')
  })

  it('fallback for empty result', () => {
    expect(sanitizeFilename('///**')).toBe('untitled')
  })

  it('strips trailing dots (Windows silently truncates them)', () => {
    expect(sanitizeFilename('note...')).toBe('note')
  })

  it('strips leading dots', () => {
    expect(sanitizeFilename('...note')).toBe('note')
  })

  it('appends underscore for Windows reserved names', () => {
    expect(sanitizeFilename('CON')).toBe('CON_')
    expect(sanitizeFilename('nul')).toBe('nul_')
    expect(sanitizeFilename('COM1')).toBe('COM1_')
    expect(sanitizeFilename('LPT9')).toBe('LPT9_')
  })

  it('does not affect non-reserved names similar to reserved', () => {
    expect(sanitizeFilename('CONX')).toBe('CONX')
    expect(sanitizeFilename('COM10')).toBe('COM10')
  })

  it('truncates very long titles to within 200 bytes', () => {
    // 纯中文 70 字 × 3 bytes = 210 bytes，超出 200 byte 限制
    const longTitle = '中'.repeat(70)
    const result = sanitizeFilename(longTitle)
    const byteLen = new TextEncoder().encode(result).length
    expect(byteLen).toBeLessThanOrEqual(200)
    expect(result.length).toBeGreaterThan(0)
  })

  it('truncates mixed emoji+Chinese long title', () => {
    const longTitle = 'sansan0TrendRadar ⭐AI-driven public opinion & trend monitor with multi-platform aggregation, RSS, and smart alerts.🎯 告别信息过载，你的 AI 舆情监控助手与热点筛选工具！聚合多平台热点 + RSS 订阅，支持关键词精准筛选。AI 智能筛选新闻 + AI 翻译 + AI 分析简报直推手机，也支持接入 MCP 架构，赋能 AI 自然语言对话分析、情感洞察与趋势预测等。支持 Docker ，数据本地云端自持。集成微信飞书钉钉Telegram邮件ntfybarkslack 等渠道智能推送。'
    const result = sanitizeFilename(longTitle)
    const byteLen = new TextEncoder().encode(result).length
    expect(byteLen).toBeLessThanOrEqual(200)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('resolveFilename', () => {
  it('no conflict returns original', () => {
    expect(resolveFilename('note', new Set())).toBe('note')
  })

  it('conflict adds -1 suffix', () => {
    expect(resolveFilename('note', new Set(['note']))).toBe('note-1')
  })

  it('increments suffix until no conflict', () => {
    expect(resolveFilename('note', new Set(['note', 'note-1', 'note-2']))).toBe('note-3')
  })
})

describe('chooseFilename', () => {
  it('does not prompt when no conflict exists', async () => {
    const confirmOverwrite = vi.fn().mockReturnValue(true)

    await expect(chooseFilename('note', new Set(), confirmOverwrite)).resolves.toEqual({
      finalName: 'note',
      overwrite: false,
    })
    expect(confirmOverwrite).not.toHaveBeenCalled()
  })

  it('keeps original name when user confirms overwrite', async () => {
    const confirmOverwrite = vi.fn().mockResolvedValue(true)

    await expect(chooseFilename('note', new Set(['note']), confirmOverwrite)).resolves.toEqual({
      finalName: 'note',
      overwrite: true,
    })
    expect(confirmOverwrite).toHaveBeenCalledWith('note.md')
  })

  it('falls back to suffix naming when user declines overwrite', async () => {
    const confirmOverwrite = vi.fn().mockResolvedValue(false)

    await expect(chooseFilename('note', new Set(['note', 'note-1']), confirmOverwrite)).resolves.toEqual({
      finalName: 'note-2',
      overwrite: false,
    })
  })
})
