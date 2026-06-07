import { describe, it, expect } from 'vitest'
import { spansToMarkdown } from '../../src/converter/inline'
import type { Span } from '../../src/types'

describe('spansToMarkdown', () => {
  it('plain text', () => {
    const spans: Span[] = [{ text: 'hello' }]
    expect(spansToMarkdown(spans)).toBe('hello')
  })

  it('bold', () => {
    const spans: Span[] = [{ text: 'world', bold: true }]
    expect(spansToMarkdown(spans)).toBe('**world**')
  })

  it('italic', () => {
    const spans: Span[] = [{ text: 'hi', italic: true }]
    expect(spansToMarkdown(spans)).toBe('*hi*')
  })

  it('bold + italic', () => {
    const spans: Span[] = [{ text: 'hi', bold: true, italic: true }]
    expect(spansToMarkdown(spans)).toBe('***hi***')
  })

  it('strikethrough', () => {
    const spans: Span[] = [{ text: 'del', strikethrough: true }]
    expect(spansToMarkdown(spans)).toBe('~~del~~')
  })

  it('inline code', () => {
    const spans: Span[] = [{ text: 'const x', inlineCode: true }]
    expect(spansToMarkdown(spans)).toBe('`const x`')
  })

  it('link', () => {
    const spans: Span[] = [{ text: 'click', link: 'https://example.com' }]
    expect(spansToMarkdown(spans)).toBe('[click](https://example.com)')
  })

  it('mixed spans', () => {
    const spans: Span[] = [
      { text: 'Hello ' },
      { text: 'world', bold: true },
      { text: '!' },
    ]
    expect(spansToMarkdown(spans)).toBe('Hello **world**!')
  })

  it('empty spans returns empty string', () => {
    expect(spansToMarkdown([])).toBe('')
  })
})
