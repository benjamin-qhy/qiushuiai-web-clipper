import { describe, expect, it } from 'vitest'
import { parseCardMarkdown } from './parse'

describe('parseCardMarkdown', () => {
  it('parses supported block semantics and keeps dividers distinct from page breaks', () => {
    const blocks = parseCardMarkdown(`# 标题

正文 **加粗** 和 *斜体*。

- 第一项
- 第二项

> 引用

---

<!-- pagebreak -->

\`\`\`ts
const marker = '<!-- pagebreak -->'
\`\`\``)

    expect(blocks.map(block => block.type)).toEqual([
      'heading', 'paragraph', 'list', 'quote', 'divider', 'pageBreak', 'code',
    ])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(blocks.at(-1)).toMatchObject({
      type: 'code', language: 'ts', value: "const marker = '<!-- pagebreak -->'",
    })
  })

  it('parses explicit highlights only in ordinary text nodes', () => {
    const [paragraph] = parseCardMarkdown('普通 ==重点==，**加粗**，`==代码==`。')

    expect(paragraph).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'text', value: '普通 ' },
        { type: 'mark', children: [{ type: 'text', value: '重点' }] },
        { type: 'text', value: '，' },
        { type: 'strong', children: [{ type: 'text', value: '加粗' }] },
        { type: 'text', value: '，' },
        { type: 'inlineCode', value: '==代码==' },
        { type: 'text', value: '。' },
      ],
    })
  })

  it('preserves links and GitHub-flavored tables', () => {
    const blocks = parseCardMarkdown('[链接](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |')

    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'link', url: 'https://example.com', children: [{ type: 'text', value: '链接' }] }],
    })
    expect(blocks[1]).toMatchObject({
      type: 'table',
      rows: [
        [[{ type: 'text', value: 'A' }], [{ type: 'text', value: 'B' }]],
        [[{ type: 'text', value: '1' }], [{ type: 'text', value: '2' }]],
      ],
    })
  })

  it('ignores unsupported standalone HTML without treating it as a page break', () => {
    expect(parseCardMarkdown('<aside>不进入卡片</aside>')).toEqual([])
  })

  it('promotes nested page-break lines but leaves fenced and indented code literal', () => {
    const blocks = parseCardMarkdown(`> 引用前
> <!-- pagebreak -->
> 引用后

    <!-- pagebreak -->

~~~md
<!-- pagebreak -->
~~~`)

    expect(blocks.map(block => block.type)).toEqual(['quote', 'pageBreak', 'quote', 'code', 'code'])
    expect(blocks.at(-1)).toMatchObject({ type: 'code', value: '<!-- pagebreak -->' })

    const nestedFence = parseCardMarkdown(`> ~~~md
> <!-- pagebreak -->
> ~~~`)
    expect(nestedFence).toMatchObject([{ type: 'quote', children: [{ type: 'code', value: '<!-- pagebreak -->' }] }])

    const nestedListBreak = parseCardMarkdown(`- 第一段
  <!-- pagebreak -->
  第二段`)
    expect(nestedListBreak.map(block => block.type)).toEqual(['list', 'pageBreak', 'list'])
    expect(nestedListBreak[2]).toMatchObject({ type: 'list', continuedFromPrevious: true })

    const betweenItems = parseCardMarkdown(`1. 第一项
   <!-- pagebreak -->
2. 第二项`)
    expect(betweenItems.map(block => block.type)).toEqual(['list', 'pageBreak', 'list'])
    expect(betweenItems[2]).toMatchObject({ type: 'list', start: 2, continuedFromPrevious: false })

    const consecutiveBreaks = parseCardMarkdown(`- 第一段
  <!-- pagebreak -->
  <!-- pagebreak -->
  第二段`)
    expect(consecutiveBreaks.at(-1)).toMatchObject({ type: 'list', continuedFromPrevious: true })
  })
})
