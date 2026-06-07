import { describe, it, expect } from 'vitest'
import { parseKdocsBlock } from '../../../src/extractor/kdocs/blocks'

function blockTile(inner: string): Element {
  const div = document.createElement('div')
  div.className = 'block_tile'
  div.innerHTML = inner
  return div
}

describe('parseKdocsBlock', () => {
  it('parses mainTitle as page block', () => {
    const el = blockTile('<p class="mainTitle selection-inside">标题</p>')
    const blocks = parseKdocsBlock(el)
    expect(blocks).toEqual([{ type: 'page', spans: [{ text: '标题' }] }])
  })

  it('filters otl-word-gap from title', () => {
    const el = blockTile(
      '<p class="mainTitle">50<i class="otl-word-gap ProseMirror-widget" contenteditable="false"> </i>个skills</p>'
    )
    const blocks = parseKdocsBlock(el)
    expect(blocks[0].spans?.map(s => s.text).join('')).toBe('50个skills')
  })

  it('parses h2.otl-heading as heading2', () => {
    const el = blockTile(
      '<h2 class="otl-heading"><div class="text-block-content-container"><span class="otl-heading-content">一、整套系统</span></div></h2>'
    )
    expect(parseKdocsBlock(el)).toEqual([{ type: 'heading2', spans: [{ text: '一、整套系统' }] }])
  })

  it('parses h3.otl-heading as heading3', () => {
    const el = blockTile(
      '<h3 class="otl-heading"><div class="text-block-content-container"><span class="otl-heading-content">子标题</span></div></h3>'
    )
    expect(parseKdocsBlock(el)).toEqual([{ type: 'heading3', spans: [{ text: '子标题' }] }])
  })

  it('parses plain paragraph as text', () => {
    const el = blockTile(
      '<div class="otl-paragraph"><div class="text-block-content-container"><span class="otl-paragraph-content">正文内容</span></div></div>'
    )
    expect(parseKdocsBlock(el)).toEqual([{ type: 'text', spans: [{ text: '正文内容' }] }])
  })

  it('returns [] for empty paragraph', () => {
    const el = blockTile(
      '<div class="otl-paragraph"><div class="text-block-content-container"><span class="otl-paragraph-content"></span></div></div>'
    )
    expect(parseKdocsBlock(el)).toEqual([])
  })

  it('parses bullet list item', () => {
    const el = blockTile(
      '<div class="otl-paragraph outline-bullet-list-item" listlevel="0"><div class="text-block-content-container"><span class="otl-paragraph-content">列表项</span></div></div>'
    )
    expect(parseKdocsBlock(el)).toEqual([{ type: 'bullet', spans: [{ text: '列表项' }], level: 0 }])
  })

  it('parses nested bullet list item', () => {
    const el = blockTile(
      '<div class="otl-paragraph outline-bullet-list-item" listlevel="2"><div class="text-block-content-container"><span class="otl-paragraph-content">子项</span></div></div>'
    )
    expect(parseKdocsBlock(el)).toEqual([{ type: 'bullet', spans: [{ text: '子项' }], level: 2 }])
  })

  it('parses ordered list item', () => {
    const el = blockTile(
      '<div class="otl-paragraph outline-order-list-item" listlevel="0"><div class="text-block-content-container"><span class="otl-list-str no-hit"></span><span class="otl-paragraph-content text-block-content-dom">有序项</span></div></div>'
    )
    expect(parseKdocsBlock(el)).toEqual([{ type: 'ordered', spans: [{ text: '有序项' }], level: 0 }])
  })

  it('parses image block', () => {
    const el = blockTile(
      '<div class="PMNodeview block"><div class="picture-wrapper"><div class="img-wrapper-events"><img src="blob:https://www.kdocs.cn/abc" alt=""></div></div></div>'
    )
    const blocks = parseKdocsBlock(el)
    expect(blocks).toEqual([{ type: 'image', src: 'blob:https://www.kdocs.cn/abc', alt: '' }])
  })

  it('parses table block', () => {
    const el = blockTile(`
      <div class="table-wrapper">
        <table class="outline-table data-normal-view">
          <tbody>
            <tr>
              <td><div class="sub-doc-tile"><div class="otl-paragraph"><div class="text-block-content-container"><span class="otl-paragraph-content">A</span></div></div></div></td>
              <td><div class="sub-doc-tile"><div class="otl-paragraph"><div class="text-block-content-container"><span class="otl-paragraph-content">B</span></div></div></div></td>
            </tr>
          </tbody>
        </table>
      </div>
    `)
    const blocks = parseKdocsBlock(el)
    expect(blocks).toEqual([{
      type: 'table',
      rows: [[{ spans: [{ text: 'A' }] }, { spans: [{ text: 'B' }] }]],
    }])
  })

  it('returns [] for unknown block', () => {
    const el = blockTile('<div class="unknown-block">something</div>')
    expect(parseKdocsBlock(el)).toEqual([])
  })
})
