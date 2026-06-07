import type { Block, BlockType, Cell } from '../types'
import { extractSpans } from './inline'

// 飞书专有 block，不转换为 Markdown
export const SKIP_TYPES = new Set([
  'ai-summary', 'whiteboard', 'diagram', 'bitable', 'mindnote',
  'iframe', 'isv', 'synced_source', 'synced_reference', 'grid',
])

export function extractAiSummaryText(container: Element): string {
  const aiEl = container.querySelector('[data-block-type="ai-summary"]')
  if (!aiEl) return ''

  const loadingEl = aiEl.querySelector('.doc-ai-summary-loading')
  if (loadingEl && !loadingEl.classList.contains('doc-ai-summary-loading__hidden')) return ''

  const lines: string[] = []
  for (const el of aiEl.querySelectorAll('[data-block-type]')) {
    const type = el.getAttribute('data-block-type') as BlockType
    if (!type || (type as string) === 'ai-summary' || SKIP_TYPES.has(type)) continue
    for (const block of parseBlock(el, type)) {
      if (!block.spans?.length) continue
      const text = block.spans.map(s => s.text).join('').trim()
      if (text) lines.push(text)
    }
  }
  return lines.join('\n')
}

export function extractBlocks(container: Element): Block[] {
  const blocks: Block[] = []
  for (const el of container.querySelectorAll('[data-block-type]')) {
    const type = el.getAttribute('data-block-type') as BlockType
    if (!type || SKIP_TYPES.has(type)) continue
    blocks.push(...parseBlock(el, type))
  }
  return blocks
}

// 返回 Block[]：普通块返回单元素数组，image 多图返回多元素，无法解析返回 []
export function parseBlock(el: Element, type: BlockType): Block[] {
  switch (type) {
    case 'page':
    case 'heading1': case 'heading2': case 'heading3':
    case 'heading4': case 'heading5': case 'heading6':
    case 'heading7': case 'heading8': case 'heading9':
    case 'text':
    case 'quote_container':
    case 'callout':
      return [{ type, spans: extractSpans(el) }]

    case 'bullet':
    case 'ordered': {
      const level = Number(el.getAttribute('data-indent-level') ?? 0)
      return [{ type, spans: extractSpans(el), level }]
    }

    case 'todo': {
      const checked = el.getAttribute('data-checked') === 'true' ||
        el.querySelector('input[type="checkbox"]')?.getAttribute('checked') !== null
      return [{ type, spans: extractSpans(el), checked }]
    }

    case 'code': {
      const language = el.getAttribute('data-language') ??
        el.querySelector('[data-language]')?.getAttribute('data-language') ?? ''
      const text = el.querySelector('pre, code, [data-code-content]')?.textContent ??
        el.textContent ?? ''
      return [{ type, spans: [{ text }], language }]
    }

    case 'divider':
      return [{ type }]

    case 'image': {
      // 一个 image block 可能含多张图（gallery 拼贴）
      const imgs = [...el.querySelectorAll('img')]
        .filter(img => img.src && !img.src.startsWith('data:'))
      return imgs.map(img => ({
        type: 'image' as BlockType,
        src: img.src,
        alt: img.alt || '',
      }))
    }

    case 'table': {
      const rows = extractTableRows(el)
      return rows.length > 0 ? [{ type, rows }] : []
    }

    default:
      return []
  }
}


function extractTableRows(tableEl: Element): Cell[][] {
  const rows: Cell[][] = []
  for (const tr of tableEl.querySelectorAll('tr')) {
    const cells: Cell[] = []
    for (const td of tr.querySelectorAll('td, th')) {
      cells.push({ spans: extractSpans(td) })
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}
