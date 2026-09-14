import { describe, expect, it } from 'vitest'
import { planPages } from './planPages'
import type { SemanticBlock } from '../markdown/parse'

const paragraph = (id: string, value: string): SemanticBlock => ({
  id, type: 'paragraph', children: [{ type: 'text', value }],
})
const heading = (id: string, value: string): SemanticBlock => ({
  id, type: 'heading', level: 2, children: [{ type: 'text', value }],
})
const pageBreak = (id: string): SemanticBlock => ({ id, type: 'pageBreak' })
const ids = (pages: Awaited<ReturnType<typeof planPages>>) =>
  pages.map(page => page.blocks.map(block => block.id))

describe('planPages', () => {
  it('returns no pages for empty content', async () => {
    expect(await planPages([], { contentHeight: 100, measure: async () => 0 })).toEqual([])
  })

  it('packs exact-fit blocks and starts a new page only after capacity', async () => {
    const heights = new Map([['a', 40], ['b', 60], ['c', 1]])
    const pages = await planPages([paragraph('a', 'A'), paragraph('b', 'B'), paragraph('c', 'C')], {
      contentHeight: 100,
      measure: async blocks => blocks.reduce((total, block) => total + (heights.get(block.id) ?? 1), 0),
    })
    expect(ids(pages)).toEqual([['a', 'b'], ['c']])
  })

  it('obeys explicit page breaks without creating empty edge pages', async () => {
    const pages = await planPages([
      pageBreak('first'), paragraph('a', 'A'), pageBreak('middle'), paragraph('b', 'B'), pageBreak('last'),
    ], { contentHeight: 100, measure: async blocks => blocks.length * 10 })
    expect(ids(pages)).toEqual([['a'], ['b']])
  })

  it('keeps a heading with the following substantive block', async () => {
    const heights = new Map([['intro', 70], ['heading', 20], ['body', 30]])
    const pages = await planPages([
      paragraph('intro', '介绍'), heading('heading', '标题'), paragraph('body', '正文'),
    ], { contentHeight: 100, measure: async blocks =>
      blocks.reduce((total, block) => total + (heights.get(block.id) ?? 0), 0) })
    expect(ids(pages)).toEqual([['intro'], ['heading', 'body']])
  })

  it('does not keep a heading with content across an explicit page break', async () => {
    const pages = await planPages([
      paragraph('intro', '介绍'), heading('heading', '标题'), pageBreak('break'), paragraph('body', '正文'),
    ], { contentHeight: 100, measure: async blocks =>
      blocks.reduce((total, block) => total + (block.id === 'intro' ? 70 : 20), 0) })
    expect(ids(pages)).toEqual([['intro', 'heading'], ['body']])
  })

  it('keeps a new-page heading with a measured fragment of a near-full paragraph', async () => {
    const textLength = (block: SemanticBlock) => block.type === 'paragraph'
      ? block.children.reduce((total, child) => total + ('value' in child ? Array.from(child.value).length : 0), 0)
      : 2
    const pages = await planPages([heading('heading', '标题'), paragraph('body', '123456789')], {
      contentHeight: 10,
      measure: async blocks => blocks.reduce((total, block) => total + textLength(block), 0),
    })
    expect(pages[0].blocks.map(block => block.type)).toEqual(['heading', 'paragraph'])
    expect(pages[1].blocks.map(block => block.type)).toEqual(['paragraph'])
  })

  it('splits only oversized paragraphs at grapheme boundaries and preserves marks', async () => {
    const block: SemanticBlock = {
      id: 'long', type: 'paragraph', children: [
        { type: 'text', value: 'A😀' },
        { type: 'mark', children: [{ type: 'text', value: '重点B' }] },
      ],
    }
    const pages = await planPages([block], {
      contentHeight: 30,
      measure: async candidates => candidates.reduce((height, candidate) => {
        if (candidate.type !== 'paragraph') return height
        return height + Array.from(candidate.children.map(child =>
          child.type === 'mark' ? child.children.map(item => 'value' in item ? item.value : '').join('') : 'value' in child ? child.value : '',
        ).join('')).length * 10
      }, 0),
    })

    expect(pages).toHaveLength(2)
    expect(new Set(pages.flatMap(page => page.blocks.map(item => item.id))).size).toBe(2)
    expect(pages[0].blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: 'A😀' }, { type: 'mark', children: [{ type: 'text', value: '重' }] }],
    })
    expect(pages[1].blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'mark', children: [{ type: 'text', value: '点B' }] }],
    })
  })

  it('does not impose a maximum page count', async () => {
    const blocks = Array.from({ length: 25 }, (_, index) => paragraph(`p-${index}`, String(index)))
    const pages = await planPages(blocks, { contentHeight: 10, measure: async candidates => candidates.length * 10 })
    expect(pages).toHaveLength(25)
  })

  it('splits oversized lists, quotes, code, and tables at semantic boundaries', async () => {
    const inline = (value: string) => [{ type: 'text' as const, value }]
    const list: SemanticBlock = {
      id: 'list', type: 'list', ordered: true, start: 3,
      items: Array.from({ length: 4 }, (_, index) => [paragraph(`item-${index}`, String(index))]),
    }
    const quote: SemanticBlock = {
      id: 'quote', type: 'quote', children: Array.from({ length: 4 }, (_, index) => paragraph(`quote-${index}`, String(index))),
    }
    const code: SemanticBlock = { id: 'code', type: 'code', language: 'txt', value: 'ABCDEF' }
    const table: SemanticBlock = {
      id: 'table', type: 'table', align: [null], rows: [inline('H'), inline('1'), inline('2'), inline('3')].map(cell => [cell]),
    }
    const measure = async (blocks: SemanticBlock[]) => blocks.reduce((total, block) => {
      if (block.type === 'list') return total + block.items.length * 30
      if (block.type === 'quote') return total + block.children.length * 30
      if (block.type === 'code') return total + Array.from(block.value).length * 20
      if (block.type === 'table') return total + block.rows.length * 20
      return total
    }, 0)

    const [listPages, quotePages, codePages, tablePages] = await Promise.all([
      planPages([list], { contentHeight: 60, measure }),
      planPages([quote], { contentHeight: 60, measure }),
      planPages([code], { contentHeight: 60, measure }),
      planPages([table], { contentHeight: 60, measure }),
    ])
    expect(listPages.map(page => (page.blocks[0] as Extract<SemanticBlock, { type: 'list' }>).items.length)).toEqual([2, 2])
    expect((listPages[1].blocks[0] as Extract<SemanticBlock, { type: 'list' }>).start).toBe(5)
    expect(quotePages.map(page => (page.blocks[0] as Extract<SemanticBlock, { type: 'quote' }>).children.length)).toEqual([2, 2])
    expect(codePages.map(page => (page.blocks[0] as Extract<SemanticBlock, { type: 'code' }>).value)).toEqual(['ABC', 'DEF'])
    expect(tablePages.map(page => (page.blocks[0] as Extract<SemanticBlock, { type: 'table' }>).rows.length)).toEqual([3, 2])
  })

  it('recursively splits a single long list item, quote paragraph, and table row', async () => {
    const long = paragraph('long', '12345678')
    const list: SemanticBlock = { id: 'list', type: 'list', ordered: false, items: [[long]] }
    const quote: SemanticBlock = { id: 'quote', type: 'quote', children: [long] }
    const table: SemanticBlock = {
      id: 'table', type: 'table', align: [null],
      rows: [[[{ type: 'text', value: 'H' }]], [[{ type: 'text', value: '12345678' }]]],
    }
    const inlineUnits = (nodes: Array<{ type: string; value?: string; children?: unknown[] }>): number =>
      nodes.reduce((total, node) => total + (node.value ? Array.from(node.value).length : 0), 0)
    const blockUnits = (block: SemanticBlock): number => {
      if (block.type === 'paragraph' || block.type === 'heading') return inlineUnits(block.children)
      if (block.type === 'list') return block.items.flat().reduce((total, child) => total + blockUnits(child), 0)
      if (block.type === 'quote') return block.children.reduce((total, child) => total + blockUnits(child), 0)
      if (block.type === 'table') return block.rows.flat().reduce((total, cell) => total + inlineUnits(cell), 0)
      return 0
    }
    const measure = async (blocks: SemanticBlock[]) => blocks.reduce((total, block) => total + blockUnits(block), 0)

    const [listPages, quotePages, tablePages, titledListPages] = await Promise.all([
      planPages([list], { contentHeight: 5, measure }),
      planPages([quote], { contentHeight: 5, measure }),
      planPages([table], { contentHeight: 5, measure }),
      planPages([heading('heading', '标题'), list], { contentHeight: 5, measure }),
    ])
    expect(listPages).toHaveLength(2)
    expect((listPages[1].blocks[0] as Extract<SemanticBlock, { type: 'list' }>).continuedFromPrevious).toBe(true)
    expect(quotePages).toHaveLength(2)
    expect(tablePages).toHaveLength(2)
    expect(titledListPages[0].blocks.map(block => block.type)).toEqual(['heading', 'list'])
  })

  it('recurses into an oversized first child and can split an oversized table header', async () => {
    const long = paragraph('long', '12345678')
    const short = paragraph('short', 'X')
    const list: SemanticBlock = { id: 'list', type: 'list', ordered: false, items: [[long, short]] }
    const quote: SemanticBlock = { id: 'quote', type: 'quote', children: [long, short] }
    const table: SemanticBlock = {
      id: 'table', type: 'table', align: [null],
      rows: [[[{ type: 'text', value: '12345678' }]], [[{ type: 'text', value: 'X' }]]],
    }
    const units = (block: SemanticBlock): number => {
      if (block.type === 'paragraph') return block.children.reduce((total, node) => total + ('value' in node ? node.value.length : 0), 0)
      if (block.type === 'list') return block.items.flat().reduce((total, child) => total + units(child), 0)
      if (block.type === 'quote') return block.children.reduce((total, child) => total + units(child), 0)
      if (block.type === 'table') return block.rows.flat(2).reduce((total, node) => total + ('value' in node ? node.value.length : 0), 0)
      return 0
    }
    const measure = async (blocks: SemanticBlock[]) => blocks.reduce((total, block) => total + units(block), 0)

    expect(await planPages([list], { contentHeight: 5, measure })).toHaveLength(2)
    expect(await planPages([quote], { contentHeight: 5, measure })).toHaveLength(2)
    expect(await planPages([table], { contentHeight: 5, measure })).toHaveLength(2)
  })
})
