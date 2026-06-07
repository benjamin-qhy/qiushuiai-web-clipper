import type { Span } from '../types'

export function spansToMarkdown(spans: Span[]): string {
  return spans.map(spanToMarkdown).join('')
}

function spanToMarkdown(span: Span): string {
  if (!span.text) return ''

  if (span.inlineCode) return `\`${span.text}\``

  if (span.link) {
    const inner = applyStyles(span.text, span)
    return `[${inner}](${span.link})`
  }

  return applyStyles(span.text, span)
}

function applyStyles(text: string, span: Span): string {
  let result = text
  if (span.strikethrough) result = `~~${result}~~`
  if (span.bold && span.italic) return `***${result}***`
  if (span.bold) result = `**${result}**`
  if (span.italic) result = `*${result}*`
  return result
}
