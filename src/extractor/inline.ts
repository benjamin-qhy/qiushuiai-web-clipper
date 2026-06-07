import type { Span } from '../types'

export function extractSpans(el: Element): Span[] {
  const spans: Span[] = []

  const allLeaves = el.querySelectorAll('[data-leaf], span[class*="text-"]')
  // Only process leaves that belong directly to this block, not to nested child blocks
  const leaves = [...allLeaves].filter(leaf => !isInsideNestedBlock(leaf, el))

  if (leaves.length === 0) {
    const text = ownTextContent(el).trim()
    if (text) spans.push({ text })
    return spans
  }

  for (const leaf of leaves) {
    const text = leaf.textContent ?? ''
    if (!text) continue

    const span: Span = { text }

    if (
      leaf.getAttribute('data-bold') === 'true' ||
      leaf.closest('[data-bold="true"]')
    ) span.bold = true

    if (
      leaf.getAttribute('data-italic') === 'true' ||
      leaf.closest('[data-italic="true"]')
    ) span.italic = true

    if (
      leaf.getAttribute('data-strike') === 'true' ||
      leaf.closest('[data-strikethrough="true"]')
    ) span.strikethrough = true

    if (
      leaf.getAttribute('data-code') === 'true' ||
      leaf.closest('code')
    ) span.inlineCode = true

    const anchor = leaf.closest('a')
    if (anchor?.href) span.link = anchor.href

    spans.push(span)
  }

  return spans
}

function isInsideNestedBlock(leaf: Element, root: Element): boolean {
  let node = leaf.parentElement
  while (node && node !== root) {
    if (node.hasAttribute('data-block-type')) return true
    node = node.parentElement
  }
  return false
}

function ownTextContent(el: Element): string {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      if (!child.hasAttribute('data-block-type')) {
        text += ownTextContent(child)
      }
    }
  }
  return text
}
