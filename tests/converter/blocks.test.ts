import { describe, it, expect } from 'vitest'
import { blocksToMarkdown } from '../../src/converter/blocks'
import type { Block } from '../../src/types'

describe('blocksToMarkdown', () => {
  it('heading1', () => {
    const blocks: Block[] = [{ type: 'heading1', spans: [{ text: '标题' }] }]
    expect(blocksToMarkdown(blocks)).toBe('# 标题')
  })

  it('heading3', () => {
    const blocks: Block[] = [{ type: 'heading3', spans: [{ text: '小标题' }] }]
    expect(blocksToMarkdown(blocks)).toBe('### 小标题')
  })

  it('text paragraph', () => {
    const blocks: Block[] = [{ type: 'text', spans: [{ text: '正文内容' }] }]
    expect(blocksToMarkdown(blocks)).toBe('正文内容')
  })

  it('bullet list item', () => {
    const blocks: Block[] = [{ type: 'bullet', spans: [{ text: '项目' }], level: 0 }]
    expect(blocksToMarkdown(blocks)).toBe('- 项目')
  })

  it('nested bullet (level 1)', () => {
    const blocks: Block[] = [{ type: 'bullet', spans: [{ text: '子项' }], level: 1 }]
    expect(blocksToMarkdown(blocks)).toBe('  - 子项')
  })

  it('ordered list item', () => {
    const blocks: Block[] = [
      { type: 'ordered', spans: [{ text: '第一' }], level: 0 },
      { type: 'ordered', spans: [{ text: '第二' }], level: 0 },
    ]
    expect(blocksToMarkdown(blocks)).toBe('1. 第一\n2. 第二')
  })

  it('todo unchecked', () => {
    const blocks: Block[] = [{ type: 'todo', spans: [{ text: '待办' }], checked: false }]
    expect(blocksToMarkdown(blocks)).toBe('- [ ] 待办')
  })

  it('todo checked', () => {
    const blocks: Block[] = [{ type: 'todo', spans: [{ text: '完成' }], checked: true }]
    expect(blocksToMarkdown(blocks)).toBe('- [x] 完成')
  })

  it('code block with language', () => {
    const blocks: Block[] = [{ type: 'code', spans: [{ text: 'const x = 1' }], language: 'typescript' }]
    expect(blocksToMarkdown(blocks)).toBe('```typescript\nconst x = 1\n```')
  })

  it('divider', () => {
    const blocks: Block[] = [{ type: 'divider' }]
    expect(blocksToMarkdown(blocks)).toBe('---')
  })

  it('image', () => {
    const blocks: Block[] = [{ type: 'image', src: 'https://img.example.com/a.png', alt: '截图' }]
    expect(blocksToMarkdown(blocks)).toBe('![截图](<https://img.example.com/a.png>)')
  })

  it('quote_container', () => {
    const blocks: Block[] = [{ type: 'quote_container', spans: [{ text: '引用内容' }] }]
    expect(blocksToMarkdown(blocks)).toBe('> 引用内容')
  })

  it('table', () => {
    const blocks: Block[] = [{
      type: 'table',
      rows: [
        [{ spans: [{ text: 'A' }] }, { spans: [{ text: 'B' }] }],
        [{ spans: [{ text: '1' }] }, { spans: [{ text: '2' }] }],
      ],
    }]
    expect(blocksToMarkdown(blocks)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('multiple blocks separated by blank line', () => {
    const blocks: Block[] = [
      { type: 'heading1', spans: [{ text: 'H1' }] },
      { type: 'text', spans: [{ text: 'para' }] },
    ]
    expect(blocksToMarkdown(blocks)).toBe('# H1\n\npara')
  })
})
