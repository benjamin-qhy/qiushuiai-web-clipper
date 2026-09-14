import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSourceSnapshot } from '../../src/publisher/source'
import type { DocContent } from '../../src/types'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createSourceSnapshot', () => {
  it('converts structured document blocks to complete Markdown and keeps metadata separate', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T06:00:00.000Z'))
    vi.stubGlobal('crypto', { randomUUID: () => 'snapshot-1' })
    const doc: DocContent = {
      title: '原始标题',
      source: 'https://example.com/article',
      author: '作者',
      published: '2026-09-01',
      created: '2026-09-14',
      tags: ['AI'],
      blocks: [
        { type: 'heading1', spans: [{ text: '标题' }] },
        { type: 'bullet', spans: [{ text: '重点', bold: true }] },
      ],
    }

    expect(createSourceSnapshot(doc)).toEqual({
      id: 'snapshot-1',
      extractedAt: '2026-09-14T06:00:00.000Z',
      markdown: '# 标题\n\n- **重点**',
      meta: {
        title: '原始标题',
        source: 'https://example.com/article',
        author: '作者',
        published: '2026-09-01',
        created: '2026-09-14',
        tags: ['AI'],
      },
    })
  })

  it('preserves Markdown returned by the general-page extractor', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'snapshot-2' })
    const doc: DocContent = {
      title: '网页',
      source: 'https://example.com',
      created: '2026-09-14',
      blocks: [],
      markdown: '## 小节\n\n原文内容',
    }

    expect(createSourceSnapshot(doc).markdown).toBe('## 小节\n\n原文内容')
  })
})
