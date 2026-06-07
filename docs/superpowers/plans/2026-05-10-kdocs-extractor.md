# 金山文档提取器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为扩展增加金山文档（kdocs.cn）提取能力，用户在 `/l/*` 分享页点击 popup 可保存为 Obsidian Markdown。

**Architecture:** 新建独立 content script `entrypoints/content-kdocs.ts` 匹配 `*.kdocs.cn/l/*`，配套三个提取器模块（inline / blocks / collect）解析 ProseMirror DOM。converter / filesystem / storage / uploader 层全部复用，现有飞书代码零改动。

**Tech Stack:** WXT + TypeScript，Vitest + jsdom（测试），File System Access API，Web Crypto API（OSS 签名复用）

---

## 文件一览

| 操作 | 路径 | 职责 |
|------|------|------|
| 新建 | `src/extractor/kdocs/inline.ts` | kdocs span → Span[]，过滤 otl-word-gap |
| 新建 | `src/extractor/kdocs/blocks.ts` | block_tile DOM → Block[] |
| 新建 | `src/extractor/kdocs/collect.ts` | 滚动 + 收集全文块 |
| 新建 | `entrypoints/content-kdocs.ts` | content script 入口，消息处理，元数据提取 |
| 修改 | `wxt.config.ts` | 增加 host_permissions |
| 新建 | `tests/extractor/kdocs/inline.test.ts` | inline 单元测试 |
| 新建 | `tests/extractor/kdocs/blocks.test.ts` | blocks 单元测试 |

---

## Task 1：inline 提取器

**Files:**
- Create: `src/extractor/kdocs/inline.ts`
- Create: `tests/extractor/kdocs/inline.test.ts`

- [ ] **Step 1：写失败测试**

新建 `tests/extractor/kdocs/inline.test.ts`：

```typescript
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
```

- [ ] **Step 2：运行测试确认失败**

```bash
pnpm vitest run tests/extractor/kdocs/inline.test.ts
```

期望：FAIL（`extractKdocsSpans` 未定义）

- [ ] **Step 3：实现 `src/extractor/kdocs/inline.ts`**

```typescript
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
    if ((n as Element).tagName === 'STRONG') return true
    n = n.parentNode
  }
  return false
}

function hasItalicAncestor(node: Node, root: Element): boolean {
  let n = node.parentNode
  while (n && n !== root) {
    if ((n as Element).tagName === 'EM') return true
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
```

- [ ] **Step 4：运行测试确认通过**

```bash
pnpm vitest run tests/extractor/kdocs/inline.test.ts
```

期望：全部 PASS

- [ ] **Step 5：提交**

```bash
git add src/extractor/kdocs/inline.ts tests/extractor/kdocs/inline.test.ts
git commit -m "feat: add kdocs inline span extractor"
```

---

## Task 2：blocks 解析器

**Files:**
- Create: `src/extractor/kdocs/blocks.ts`
- Create: `tests/extractor/kdocs/blocks.test.ts`

- [ ] **Step 1：写失败测试**

新建 `tests/extractor/kdocs/blocks.test.ts`：

```typescript
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
```

- [ ] **Step 2：运行测试确认失败**

```bash
pnpm vitest run tests/extractor/kdocs/blocks.test.ts
```

期望：FAIL（`parseKdocsBlock` 未定义）

- [ ] **Step 3：实现 `src/extractor/kdocs/blocks.ts`**

```typescript
import type { Block, Cell } from '../../types'
import { extractKdocsSpans } from './inline'

export function parseKdocsBlock(blockTile: Element): Block[] {
  // Image: query broadly, works regardless of intermediate wrapper depth
  const imgs = [...blockTile.querySelectorAll('.picture-wrapper img')]
    .filter(img => (img as HTMLImageElement).src)
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
```

- [ ] **Step 4：运行测试确认通过**

```bash
pnpm vitest run tests/extractor/kdocs/blocks.test.ts
```

期望：全部 PASS

- [ ] **Step 5：提交**

```bash
git add src/extractor/kdocs/blocks.ts tests/extractor/kdocs/blocks.test.ts
git commit -m "feat: add kdocs block parser"
```

---

## Task 3：滚动收集器

**Files:**
- Create: `src/extractor/kdocs/collect.ts`

（collect.ts 涉及真实滚动行为，依赖浏览器 DOM，不做 jsdom 单元测试；集成测试在真实页面进行。）

- [ ] **Step 1：实现 `src/extractor/kdocs/collect.ts`**

```typescript
import type { Block } from '../../types'
import { parseKdocsBlock } from './blocks'

const CONTAINER_SELECTOR = '#otl-main-editor'
const SCROLL_STEP = 400
const SCROLL_DELAY = 300
const MAX_WAIT = 60_000
const LOG_PREFIX = '[kdocs-clipper][collect]'

export async function scrollAndCollectKdocsBlocks(): Promise<{
  container: Element | null
  blocks: Block[]
}> {
  const container = document.querySelector(CONTAINER_SELECTOR)
  if (!container) {
    console.info(`${LOG_PREFIX} container not found`)
    return { container: null, blocks: [] }
  }

  const order = new Map<string, number>()
  const collected = new Map<string, Block>()
  const processedIds = new Set<string>()
  const blobCaptures: Array<Promise<void>> = []
  let counter = 0
  const startedAt = Date.now()

  function collectVisible(): number {
    let added = 0
    // Only top-level block_tiles (skip those inside table cells)
    for (const bt of container.querySelectorAll('.block_tile')) {
      if (bt.closest('.sub-doc')) continue

      const id = bt.id || `block_${counter}`
      if (processedIds.has(id)) continue

      const blocks = parseKdocsBlock(bt)
      if (blocks.length === 0) continue

      processedIds.add(id)
      for (let i = 0; i < blocks.length; i++) {
        const subId = blocks.length > 1 ? `${id}_${i}` : id
        order.set(subId, counter++)
        collected.set(subId, blocks[i])
        added++

        // Blob images must be captured immediately before viewport exit
        if (blocks[i].type === 'image' && blocks[i].src?.startsWith('blob:')) {
          const src = blocks[i].src!
          blobCaptures.push(
            blobUrlToDataUrl(src).then(dataUrl => {
              if (dataUrl) collected.set(subId, { ...collected.get(subId)!, src: dataUrl })
            })
          )
        }
      }
    }
    return added
  }

  const scrollable = findScrollTarget(container)

  if (!scrollable) {
    collectVisible()
    console.info(`${LOG_PREFIX} done (no scroll target)`, { blocks: collected.size })
    return { container, blocks: sorted(order, collected) }
  }

  scrollable.scrollTop = 0
  await delay(SCROLL_DELAY)
  collectVisible()

  const start = Date.now()
  let prevScrollTop = -1
  let iterations = 0

  while (Date.now() - start < MAX_WAIT) {
    iterations++
    scrollable.scrollTop += SCROLL_STEP
    await delay(SCROLL_DELAY)
    collectVisible()

    if (scrollable.scrollTop === prevScrollTop) {
      await delay(SCROLL_DELAY * 3)
      collectVisible()
      console.info(`${LOG_PREFIX} done (bottom)`, { iterations, blocks: collected.size })
      break
    }
    prevScrollTop = scrollable.scrollTop
  }

  await Promise.all(blobCaptures)
  return { container, blocks: sorted(order, collected) }
}

function sorted(order: Map<string, number>, collected: Map<string, Block>): Block[] {
  return [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => collected.get(id)!)
}

function findScrollTarget(container: Element): Element | null {
  let node: Element | null = container
  while (node && node !== document.body) {
    const { overflow, overflowY } = getComputedStyle(node)
    if (['auto', 'scroll'].includes(overflow) || ['auto', 'scroll'].includes(overflowY)) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || 100
        c.height = img.naturalHeight || 100
        c.getContext('2d')?.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.95))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })
}
```

- [ ] **Step 2：提交**

```bash
git add src/extractor/kdocs/collect.ts
git commit -m "feat: add kdocs scroll collector"
```

---

## Task 4：content script 入口 + wxt.config 更新

**Files:**
- Create: `entrypoints/content-kdocs.ts`
- Modify: `wxt.config.ts`

- [ ] **Step 1：实现 `entrypoints/content-kdocs.ts`**

```typescript
import { defineContentScript } from 'wxt/utils/define-content-script'
import type { MessageRequest, MessageResponse, DocContent } from '../src/types'
import { scrollAndCollectKdocsBlocks } from '../src/extractor/kdocs/collect'

export default defineContentScript({
  matches: ['*://*.kdocs.cn/l/*'],

  main() {
    chrome.runtime.onMessage.addListener(
      (message: MessageRequest, _sender, sendResponse: (r: MessageResponse) => void) => {
        if (message.type === 'EXTRACT_DOC') {
          extractDoc().then(sendResponse).catch(err =>
            sendResponse({ ok: false, error: String(err) })
          )
          return true
        }
        if (message.type === 'DOWNLOAD_IMAGE') {
          downloadImage(message.url).then(sendResponse).catch(err =>
            sendResponse({ ok: false, error: String(err) })
          )
          return true
        }
      }
    )
  },
})

async function extractDoc(): Promise<MessageResponse> {
  const { container, blocks } = await scrollAndCollectKdocsBlocks()
  if (!container) {
    return { ok: false, error: '找不到金山文档内容容器，请确认当前页面是金山文档。' }
  }

  const titleBlock = blocks.find(b => b.type === 'page')
  const title = titleBlock?.spans?.map(s => s.text).join('').trim() ||
    document.title.replace(/\s*[-–]\s*金山文档.*$/i, '').trim()

  const author = extractAuthor()
  const published = extractPublished()

  const data: DocContent = {
    title,
    source: location.href,
    author: author ?? undefined,
    published: published ?? undefined,
    created: new Date().toISOString().slice(0, 10),
    blocks: blocks.filter(b => b.type !== 'page'),
  }

  return { ok: true, data }
}

async function downloadImage(url: string): Promise<MessageResponse> {
  if (url.startsWith('blob:')) return { ok: false, error: 'blob URL not downloadable' }
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { ok: true, base64, mimeType: blob.type || 'image/jpeg' }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

function extractAuthor(): string | null {
  return document.querySelector('.title-foot-info-name')?.textContent?.trim() ?? null
}

function extractPublished(): string | null {
  // Structure: <span class="title-foot-info-update-time">
  //   <span class="title-foot-info-time-user">oulinjie</span>
  //   <span>04-25 17:56</span>   ← target: second anonymous span
  //   <span>更新</span>
  // </span>
  const timeEl = document.querySelector('.title-foot-info-update-time')
  if (!timeEl) return null

  const spans = [...timeEl.querySelectorAll('span')]
  // Find the span that matches MM-DD HH:mm pattern
  const dateSpan = spans.find(s => /^\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(s.textContent?.trim() ?? ''))
  if (!dateSpan) return null

  const raw = dateSpan.textContent!.trim() // e.g. "04-25 17:56"
  const year = new Date().getFullYear()
  const parsed = new Date(`${year}-${raw.slice(0, 5)}`)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}
```

- [ ] **Step 2：更新 `wxt.config.ts`**

将 `host_permissions` 改为：

```typescript
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '飞书文档 → Obsidian',
    description: '将飞书文档一键保存为 Obsidian Markdown 笔记',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [
      '*://*.feishu.cn/*',
      '*://*.kdocs.cn/*',
      'https://*.aliyuncs.com/*',
    ],
  },
})
```

- [ ] **Step 3：类型检查**

```bash
pnpm compile
```

期望：无错误

- [ ] **Step 4：运行全部测试**

```bash
pnpm vitest run
```

期望：全部 PASS（包括 Task 1 / Task 2 新增测试及现有测试）

- [ ] **Step 5：构建验证**

```bash
pnpm build
```

期望：build 成功，`.output/chrome-mv3/` 下出现 `content-kdocs.js`

- [ ] **Step 6：提交**

```bash
git add entrypoints/content-kdocs.ts wxt.config.ts
git commit -m "feat: add kdocs content script and host_permissions"
```

---

## 验收检查（手动）

完成以上任务后，在真实 kdocs 页面验证：

1. 打开 https://www.kdocs.cn/l/cuXp1QU9RjzQ
2. 点击扩展 popup
3. 确认标题显示正确（无乱码、无空格占位符）
4. 确认 author / published 字段填入
5. 点击「保存到 Obsidian」，检查生成的 `.md` 文件：
   - 标题、正文、标题层级正确
   - 列表（有序/无序）格式正确
   - 图片（blob 图）已本地保存到 `.assets/`
   - 表格渲染为 Markdown 表格
