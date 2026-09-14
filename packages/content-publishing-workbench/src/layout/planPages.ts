import GraphemeSplitter from 'grapheme-splitter'
import type { InlineNode } from '../markdown/inlineMarks'
import type { SemanticBlock } from '../markdown/parse'
import type { PagePlan, PagePlannerOptions } from './types'

const fallbackSplitter = new GraphemeSplitter()
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null

function graphemes(value: string): string[] {
  return segmenter
    ? Array.from(segmenter.segment(value), segment => segment.segment)
    : fallbackSplitter.splitGraphemes(value)
}

function inlineLength(node: InlineNode): number {
  if (node.type === 'break') return 1
  if ('value' in node) return graphemes(node.value).length
  return node.children.reduce((total, child) => total + inlineLength(child), 0)
}

function wrapInline(
  source: Exclude<InlineNode, { type: 'text' | 'inlineCode' | 'break' }>,
  children: InlineNode[],
): InlineNode {
  if (source.type === 'link') return { type: 'link', url: source.url, children }
  return { type: source.type, children }
}

function splitInlineNode(node: InlineNode, count: number): [InlineNode | null, InlineNode | null] {
  if (node.type === 'break') return count > 0 ? [node, null] : [null, node]
  if ('value' in node) {
    const parts = graphemes(node.value)
    const make = (value: string): InlineNode | null => value ? { ...node, value } : null
    return [make(parts.slice(0, count).join('')), make(parts.slice(count).join(''))]
  }

  const [leftChildren, rightChildren] = splitInlineNodes(node.children, count)
  return [
    leftChildren.length ? wrapInline(node, leftChildren) : null,
    rightChildren.length ? wrapInline(node, rightChildren) : null,
  ]
}

export function splitInlineNodes(nodes: InlineNode[], count: number): [InlineNode[], InlineNode[]] {
  const left: InlineNode[] = []
  const right: InlineNode[] = []
  let remaining = count

  nodes.forEach(node => {
    const length = inlineLength(node)
    if (remaining <= 0) right.push(node)
    else if (remaining >= length) {
      left.push(node)
      remaining -= length
    } else {
      const [leftPart, rightPart] = splitInlineNode(node, remaining)
      if (leftPart) left.push(leftPart)
      if (rightPart) right.push(rightPart)
      remaining = 0
    }
  })
  return [left, right]
}

type BlockPair = [SemanticBlock, SemanticBlock | null]

interface BlockSplitter {
  units: number
  split(count: number): BlockPair
}

function splitRowAt(row: InlineNode[][], count: number): [InlineNode[][], InlineNode[][]] {
  const left: InlineNode[][] = []
  const right: InlineNode[][] = []
  let remaining = count
  row.forEach(cell => {
    const length = cell.reduce((total, node) => total + inlineLength(node), 0)
    if (remaining <= 0) {
      left.push([])
      right.push(cell)
    } else if (remaining >= length) {
      left.push(cell)
      right.push([])
      remaining -= length
    } else {
      const [leftCell, rightCell] = splitInlineNodes(cell, remaining)
      left.push(leftCell)
      right.push(rightCell)
      remaining = 0
    }
  })
  return [left, right]
}

function createSplitters(block: SemanticBlock): BlockSplitter[] {
  const leftId = (count: number) => `${block.id}:part-${count}`
  const rightId = (count: number) => `${block.id}:rest-${count}`
  if (block.type === 'paragraph' || block.type === 'heading') {
    const units = block.children.reduce((total, child) => total + inlineLength(child), 0)
    return [{ units, split(count) {
      const [left, right] = splitInlineNodes(block.children, count)
      return [{ ...block, id: leftId(count), children: left }, right.length ? { ...block, id: rightId(count), children: right } : null]
    } }]
  }
  if (block.type === 'code') {
    const parts = graphemes(block.value)
    return [{ units: parts.length, split(count) {
      return [
        { ...block, id: leftId(count), value: parts.slice(0, count).join('') },
        parts.length > count ? { ...block, id: rightId(count), value: parts.slice(count).join('') } : null,
      ]
    } }]
  }
  if (block.type === 'list') {
    const splitters: BlockSplitter[] = [{ units: block.items.length, split(count) {
      const start = block.start ?? 1
      return [
        { ...block, id: leftId(count), items: block.items.slice(0, count) },
        block.items.length > count
          ? {
              ...block,
              id: rightId(count),
              start: block.ordered ? start + count : block.start,
              continuedFromPrevious: false,
              items: block.items.slice(count),
            }
          : null,
      ]
    } }]
    const [firstItem, ...remainingItems] = block.items
    if (firstItem?.length > 1) {
      splitters.push({ units: firstItem.length, split(count) {
        return [
          { ...block, id: leftId(count), items: [firstItem.slice(0, count)] },
          {
            ...block,
            id: rightId(count),
            continuedFromPrevious: true,
            items: [firstItem.slice(count), ...remainingItems],
          },
        ]
      } })
    }
    if (firstItem?.length) {
      createSplitters(firstItem[0]).forEach(nested => splitters.push({ units: nested.units, split(count) {
        const [left, right] = nested.split(count)
        return [
          { ...block, id: leftId(count), items: [[left]] },
          right ? {
            ...block,
            id: rightId(count),
            continuedFromPrevious: true,
            items: [[right, ...firstItem.slice(1)], ...remainingItems],
          } : null,
        ]
      } }))
    }
    return splitters
  }
  if (block.type === 'quote') {
    const splitters: BlockSplitter[] = [{ units: block.children.length, split(count) {
      return [
        { ...block, id: leftId(count), children: block.children.slice(0, count) },
        block.children.length > count ? { ...block, id: rightId(count), children: block.children.slice(count) } : null,
      ]
    } }]
    if (block.children.length) {
      createSplitters(block.children[0]).forEach(nested => splitters.push({ units: nested.units, split(count) {
        const [left, right] = nested.split(count)
        return [
          { ...block, id: leftId(count), children: [left] },
          right ? { ...block, id: rightId(count), children: [right, ...block.children.slice(1)] } : null,
        ]
      } }))
    }
    return splitters
  }
  if (block.type === 'table') {
    const [header = [], ...rows] = block.rows
    const splitters: BlockSplitter[] = [{ units: rows.length, split(count) {
      return [
        { ...block, id: leftId(count), rows: [header, ...rows.slice(0, count)] },
        rows.length > count ? { ...block, id: rightId(count), rows: [header, ...rows.slice(count)] } : null,
      ]
    } }]
    const firstRow = rows[0] ?? header
    const rowUnits = firstRow.reduce((total, cell) =>
      total + cell.reduce((cellTotal, node) => cellTotal + inlineLength(node), 0), 0)
    if (rowUnits) splitters.push({ units: rowUnits, split(count) {
      const [leftRow, rightRow] = splitRowAt(firstRow, count)
      if (rows.length) {
        return [
          { ...block, id: leftId(count), rows: [header, leftRow] },
          { ...block, id: rightId(count), rows: [header, rightRow, ...rows.slice(1)] },
        ]
      }
      return [
        { ...block, id: leftId(count), rows: [leftRow] },
        { ...block, id: rightId(count), rows: [rightRow] },
      ]
    } })
    const headerUnits = header.reduce((total, cell) =>
      total + cell.reduce((cellTotal, node) => cellTotal + inlineLength(node), 0), 0)
    if (rows.length && headerUnits) splitters.push({ units: headerUnits, split(count) {
      const [leftHeader, rightHeader] = splitRowAt(header, count)
      return [
        { ...block, id: leftId(count), rows: [leftHeader] },
        { ...block, id: rightId(count), rows: [rightHeader, ...rows] },
      ]
    } })
    return splitters
  }
  return []
}

async function splitBlockToFit(
  block: SemanticBlock,
  prefix: SemanticBlock[],
  options: PagePlannerOptions,
): Promise<[SemanticBlock, SemanticBlock | null] | null> {
  for (const splitter of createSplitters(block)) {
    if (splitter.units < 2) continue
    let low = 1
    let high = splitter.units - 1
    let best = 0
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const [left] = splitter.split(middle)
      if (await options.measure([...prefix, left]) <= options.contentHeight) {
        best = middle
        low = middle + 1
      } else high = middle - 1
    }
    if (best) return splitter.split(best)
  }
  return null
}

function headingFollowers(pending: SemanticBlock[]): SemanticBlock[] {
  const followers: SemanticBlock[] = []
  for (const candidate of pending) {
    if (candidate.type === 'pageBreak') return []
    followers.push(candidate)
    if (candidate.type !== 'divider') return followers
  }
  return []
}

function hasTrailingHeading(blocks: SemanticBlock[]): boolean {
  for (let index = blocks.length - 1; index >= 0; index--) {
    if (blocks[index].type === 'divider') continue
    return blocks[index].type === 'heading'
  }
  return false
}

export async function planPages(blocks: SemanticBlock[], options: PagePlannerOptions): Promise<PagePlan[]> {
  if (options.contentHeight <= 0) throw new Error('contentHeight must be greater than zero')

  const pending = [...blocks]
  const pages: PagePlan[] = []
  let current: SemanticBlock[] = []
  const fits = async (candidate: SemanticBlock[]) => await options.measure(candidate) <= options.contentHeight
  const flush = () => {
    if (!current.length) return
    pages.push({ index: pages.length, blocks: current })
    current = []
  }

  while (pending.length) {
    const block = pending.shift()!
    if (block.type === 'pageBreak') {
      flush()
      continue
    }

    const followers = block.type === 'heading' ? headingFollowers(pending) : []
    if (followers.length && current.length && !await fits([...current, block, ...followers])) {
      flush()
      pending.unshift(block)
      continue
    }
    if (await fits([...current, block])) {
      current.push(block)
      continue
    }

    const blockExceedsBlankPage = !await fits([block])
    const followsHeading = hasTrailingHeading(current)
    if (blockExceedsBlankPage || followsHeading) {
      const split = await splitBlockToFit(block, current, options)
      if (split) {
        current.push(split[0])
        flush()
        if (split[1]) pending.unshift(split[1])
        continue
      }
    }

    if (current.length) {
      flush()
      pending.unshift(block)
      continue
    }

    const split = await splitBlockToFit(block, [], options)
    if (split) {
      current.push(split[0])
      flush()
      if (split[1]) pending.unshift(split[1])
    } else {
      current.push(block)
      flush()
    }
  }

  flush()
  return pages
}
