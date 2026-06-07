import type { Block, Cell } from '../../types'
import { extractKdocsSpans } from './inline'

export function parseKdocsBlock(blockTile: Element): Block[] {
  // Image: query broadly, works regardless of intermediate wrapper depth
  // Only accept blob: URLs — loading placeholders (wpscdn GIFs) mean the real
  // image hasn't loaded yet. Returning [] keeps this block_tile out of
  // processedIds so collect.ts retries it on the next scroll step.
  const imgs = [...blockTile.querySelectorAll('.picture-wrapper img')]
    .filter(img => (img as HTMLImageElement).src.startsWith('blob:'))
  if (imgs.length > 0) {
    return imgs.map(img => ({
      type: 'image' as const,
      src: (img as HTMLImageElement).src,
      alt: img.getAttribute('alt') ?? '',
    }))
  }

  // Table
  const table = blockTile.querySelector('table.outline-table')
  if (table) {
    const rows = extractTableRows(table)
    return rows.length > 0 ? [{ type: 'table', rows }] : []
  }

  const el = blockTile.firstElementChild
  if (!el) return []

  // Document title
  if (el.tagName === 'P' && el.classList.contains('mainTitle')) {
    return [{ type: 'page', spans: extractKdocsSpans(el) }]
  }

  // Headings — tag name determines level
  if (el.classList.contains('otl-heading')) {
    const contentEl = el.querySelector('.otl-heading-content') ?? el
    const spans = extractKdocsSpans(contentEl)
    const type = el.tagName === 'H3' ? 'heading3' : 'heading2'
    return [{ type, spans }]
  }

  // Paragraphs and lists
  if (el.classList.contains('otl-paragraph')) {
    const contentEl = el.querySelector('.otl-paragraph-content') ?? el
    const spans = extractKdocsSpans(contentEl)

    if (el.classList.contains('outline-bullet-list-item')) {
      const level = parseInt(el.getAttribute('listlevel') ?? '0', 10)
      return [{ type: 'bullet', spans, level }]
    }

    if (el.classList.contains('outline-order-list-item')) {
      const level = parseInt(el.getAttribute('listlevel') ?? '0', 10)
      return [{ type: 'ordered', spans, level }]
    }

    // Plain paragraph — skip if empty
    const text = spans.map(s => s.text).join('').trim()
    return text ? [{ type: 'text', spans }] : []
  }

  return []
}

function extractTableRows(tableEl: Element): Cell[][] {
  const rows: Cell[][] = []
  for (const tr of tableEl.querySelectorAll('tr')) {
    const cells: Cell[] = []
    for (const td of tr.querySelectorAll('td, th')) {
      const contentEl = td.querySelector('.otl-paragraph-content') ?? td
      cells.push({ spans: extractKdocsSpans(contentEl) })
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}
