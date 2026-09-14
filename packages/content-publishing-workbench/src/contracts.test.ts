import { describe, expect, it } from 'vitest'
import { createDraft, resolveReasoningLevel } from './types'
import type { SourceSnapshot } from './types'

const snapshot: SourceSnapshot = {
  id: 'snapshot-1',
  extractedAt: '2026-09-14T06:00:00.000Z',
  markdown: '# 原文',
  meta: {
    title: '标题',
    source: 'https://example.com',
    created: '2026-09-14',
  },
}

describe('publishing workbench contracts', () => {
  it('creates a draft with host-provided last model and empty template instruction', () => {
    const draft = createDraft(snapshot, {
      platformId: 'deepseek-1',
      modelId: 'deepseek-chat',
      reasoning: 'high',
    })

    expect(draft).toMatchObject({
      draftMarkdown: '',
      instruction: { mode: 'template', templateId: '', manualContent: '' },
      model: { platformId: 'deepseek-1', modelId: 'deepseek-chat', reasoning: 'high' },
      themeId: 'minimal',
      coverEnabled: false,
      currentPage: 0,
    })
  })

  it('turns unsupported stored reasoning off', () => {
    expect(resolveReasoningLevel('high', ['minimal', 'low'])).toBe('off')
    expect(resolveReasoningLevel('low', ['minimal', 'low'])).toBe('low')
  })
})
