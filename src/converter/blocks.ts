import type { Block, Cell } from '../types'
import { spansToMarkdown } from './inline'

export function blocksToMarkdown(blocks: Block[]): string {
  const LIST_TYPES = new Set(['bullet', 'ordered', 'todo'])
  const rendered: Array<{ text: string; type: string }> = []
  const orderedCounters: Record<number, number> = {}

  for (const block of blocks) {
    if (block.type !== 'ordered') {
      Object.keys(orderedCounters).forEach(k => delete orderedCounters[Number(k)])
    }
    const line = blockToLine(block, orderedCounters)
    if (line !== null) rendered.push({ text: line, type: block.type })
  }

  if (rendered.length === 0) return ''

  let result = rendered[0].text
  for (let i = 1; i < rendered.length; i++) {
    const prev = rendered[i - 1]
    const curr = rendered[i]
    // consecutive list items use single newline
    const separator = (LIST_TYPES.has(prev.type) && LIST_TYPES.has(curr.type))
      ? '\n'
      : '\n\n'
    result += separator + curr.text
  }
  return result
}

function blockToLine(block: Block, orderedCounters: Record<number, number>): string | null {
  const level = block.level ?? 0
  const indent = '  '.repeat(level)
  const text = block.spans ? spansToMarkdown(block.spans) : ''

  switch (block.type) {
    case 'page':
      return `# ${text}`

    case 'heading1': return `# ${text}`
    case 'heading2': return `## ${text}`
    case 'heading3': return `### ${text}`
    case 'heading4': return `#### ${text}`
    case 'heading5': return `##### ${text}`
    case 'heading6': return `###### ${text}`
    case 'heading7': return `####### ${text}`
    case 'heading8': return `######## ${text}`
    case 'heading9': return `######### ${text}`

    case 'text':
      return text || null

    case 'bullet':
      return `${indent}- ${text}`

    case 'ordered': {
      orderedCounters[level] = (orderedCounters[level] ?? 0) + 1
      return `${indent}${orderedCounters[level]}. ${text}`
    }

    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${text}`

    case 'code':
      return `\`\`\`${block.language ?? ''}\n${text}\n\`\`\``

    case 'quote_container':
    case 'callout':
      return `> ${text}`

    case 'divider':
      return '---'

    case 'image':
      return `![${block.alt ?? ''}](<${block.src ?? ''}>)`

    case 'table':
      return tableToMarkdown(block.rows ?? [])

    default:
      return null
  }
}

function tableToMarkdown(rows: Cell[][]): string {
  if (rows.length === 0) return ''

  const renderRow = (cells: Cell[]) =>
    '| ' + cells.map(c => spansToMarkdown(c.spans)).join(' | ') + ' |'

  const header = renderRow(rows[0])
  const separator = '| ' + rows[0].map(() => '---').join(' | ') + ' |'
  const body = rows.slice(1).map(renderRow)

  return [header, separator, ...body].join('\n')
}
