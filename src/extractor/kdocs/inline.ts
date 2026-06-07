import type { Span } from '../../types'

export function extractKdocsSpans(el: Element): Span[] {
  const raw: Span[] = []
  walkNodes(el, el, raw)
  return mergeSpans(raw)
}

function walkNodes(node: Node, root: Element, out: Span[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as Element
      if (childEl.classList.contains('otl-word-gap')) continue
      walkNodes(childEl, root, out)
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (!text) continue
      const span: Span = { text }
      if (hasBoldAncestor(child, root)) span.bold = true
      if (hasItalicAncestor(child, root)) span.italic = true
      out.push(span)
    }
  }
}

function hasBoldAncestor(node: Node, root: Element): boolean {
  let n = node.parentNode
  while (n && n !== root) {
    if (n instanceof Element && n.tagName === 'STRONG') return true
    n = n.parentNode
  }
  return false
}

function hasItalicAncestor(node: Node, root: Element): boolean {
  let n = node.parentNode
  while (n && n !== root) {
    if (n instanceof Element && n.tagName === 'EM') return true
    n = n.parentNode
  }
  return false
}

function mergeSpans(spans: Span[]): Span[] {
  const result: Span[] = []
  for (const span of spans) {
    const prev = result[result.length - 1]
    if (
      prev &&
      prev.bold === span.bold &&
      prev.italic === span.italic &&
      prev.strikethrough === span.strikethrough &&
      prev.inlineCode === span.inlineCode &&
      prev.link === span.link
    ) {
      prev.text += span.text
    } else {
      result.push({ ...span })
    }
  }
  return result
}
