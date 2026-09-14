import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { parseInlineNodes, type InlineNode } from './inlineMarks'

export type SemanticBlock =
  | { id: string; type: 'heading'; level: number; children: InlineNode[] }
  | { id: string; type: 'paragraph'; children: InlineNode[] }
  | { id: string; type: 'list'; ordered: boolean; start?: number; continuedFromPrevious?: boolean; items: SemanticBlock[][] }
  | { id: string; type: 'quote'; children: SemanticBlock[] }
  | { id: string; type: 'code'; language?: string; value: string }
  | { id: string; type: 'table'; align: Array<'left' | 'right' | 'center' | null>; rows: InlineNode[][][] }
  | { id: string; type: 'divider' }
  | { id: string; type: 'pageBreak' }

interface MarkdownNode {
  type: string
  depth?: number
  ordered?: boolean
  start?: number | null
  lang?: string | null
  value?: string
  align?: Array<'left' | 'right' | 'center' | null>
  children?: MarkdownNode[]
}

export function parseCardMarkdown(markdown: string): SemanticBlock[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode
  let sequence = 0
  const nextId = () => `block-${sequence++}`

  function parseBlocks(nodes: MarkdownNode[] = []): SemanticBlock[] {
    return nodes.flatMap((node): SemanticBlock[] => {
      switch (node.type) {
        case 'heading':
          return [{ id: nextId(), type: 'heading', level: node.depth ?? 1, children: parseInlineNodes(node.children) }]
        case 'paragraph':
          return [{ id: nextId(), type: 'paragraph', children: parseInlineNodes(node.children) }]
        case 'list':
          return [{
            id: nextId(),
            type: 'list',
            ordered: Boolean(node.ordered),
            start: node.start ?? undefined,
            items: (node.children ?? []).map(item => parseBlocks(item.children)),
          }]
        case 'blockquote':
          return [{ id: nextId(), type: 'quote', children: parseBlocks(node.children) }]
        case 'code':
          return [{ id: nextId(), type: 'code', language: node.lang ?? undefined, value: node.value ?? '' }]
        case 'table':
          return [{
            id: nextId(),
            type: 'table',
            align: node.align ?? [],
            rows: (node.children ?? []).map(row =>
              (row.children ?? []).map(cell => parseInlineNodes(cell.children)),
            ),
          }]
        case 'thematicBreak':
          return [{ id: nextId(), type: 'divider' }]
        case 'html':
          return node.value?.trim() === '<!-- pagebreak -->'
            ? [{ id: nextId(), type: 'pageBreak' }]
            : []
        default:
          return []
      }
    })
  }

  return liftPageBreaks(parseBlocks(tree.children))
}

function liftPageBreaks(blocks: SemanticBlock[]): SemanticBlock[] {
  return blocks.flatMap(block => {
    if (block.type === 'quote') {
      const children = liftPageBreaks(block.children)
      if (!children.some(child => child.type === 'pageBreak')) return [{ ...block, children }]
      const result: SemanticBlock[] = []
      let group: SemanticBlock[] = []
      let part = 0
      const flush = () => {
        if (!group.length) return
        result.push({ ...block, id: `${block.id}:part-${part++}`, children: group })
        group = []
      }
      children.forEach(child => {
        if (child.type === 'pageBreak') {
          flush()
          result.push(child)
        } else group.push(child)
      })
      flush()
      return result
    }
    if (block.type !== 'list') return [block]

    const result: SemanticBlock[] = []
    let items: SemanticBlock[][] = []
    let part = 0
    let continuedFromPrevious = block.continuedFromPrevious
    let currentStart = block.start
    const flush = () => {
      if (!items.length) return
      result.push({ ...block, id: `${block.id}:part-${part++}`, start: currentStart, items, continuedFromPrevious })
      items = []
      continuedFromPrevious = false
    }
    block.items.forEach((item, itemIndex) => {
      const children = liftPageBreaks(item)
      let itemPart: SemanticBlock[] = []
      let itemHasOutput = false
      children.forEach((child, childIndex) => {
        if (child.type === 'pageBreak') {
          const continuesItem = (itemHasOutput || itemPart.length > 0)
            && children.slice(childIndex + 1).some(candidate => candidate.type !== 'pageBreak')
          if (itemPart.length) {
            items.push(itemPart)
            itemHasOutput = true
          }
          flush()
          result.push(child)
          itemPart = []
          continuedFromPrevious = continuesItem
          currentStart = block.ordered
            ? (block.start ?? 1) + itemIndex + (continuesItem ? 0 : 1)
            : block.start
        } else itemPart.push(child)
      })
      if (itemPart.length) items.push(itemPart)
    })
    flush()
    return result
  })
}
