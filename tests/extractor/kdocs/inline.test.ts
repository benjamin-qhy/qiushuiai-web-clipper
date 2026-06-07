import { describe, it, expect } from 'vitest'
import { extractKdocsSpans } from '../../../src/extractor/kdocs/inline'

function el(html: string): Element {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('extractKdocsSpans', () => {
  it('extracts plain text', () => {
    const spans = extractKdocsSpans(el('<span class="otl-paragraph-content">大家好</span>'))
    expect(spans).toEqual([{ text: '大家好' }])
  })

  it('filters otl-word-gap placeholders', () => {
    const html = '整套<i class="otl-word-gap ProseMirror-widget" contenteditable="false"> </i>系统'
    const spans = extractKdocsSpans(el(html))
    expect(spans.map(s => s.text).join('')).toBe('整套系统')
    expect(spans.some(s => s.text.trim() === '')).toBe(false)
  })

  it('marks bold via strong ancestor', () => {
    const spans = extractKdocsSpans(el('<strong>粗体文字</strong>'))
    expect(spans).toEqual([{ text: '粗体文字', bold: true }])
  })

  it('marks italic via em ancestor', () => {
    const spans = extractKdocsSpans(el('<em>斜体</em>'))
    expect(spans).toEqual([{ text: '斜体', italic: true }])
  })

  it('merges adjacent spans with same attributes', () => {
    const html = '<strong>A</strong><strong>B</strong>'
    const spans = extractKdocsSpans(el(html))
    expect(spans).toEqual([{ text: 'AB', bold: true }])
  })

  it('handles mixed bold and plain', () => {
    const html = '前缀<strong>粗</strong>后缀'
    const spans = extractKdocsSpans(el(html))
    expect(spans).toEqual([
      { text: '前缀' },
      { text: '粗', bold: true },
      { text: '后缀' },
    ])
  })

  it('ignores color_font class, keeps text and bold semantics', () => {
    const html = '<span class="color_font other_color" style="color:#0E52D4;"><strong>蓝色粗体</strong></span>'
    const spans = extractKdocsSpans(el(html))
    expect(spans).toEqual([{ text: '蓝色粗体', bold: true }])
  })
})
