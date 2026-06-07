# Feishu Obsidian Clipper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 WXT + Vue 3 浏览器插件，将飞书文档一键转换为 Obsidian 兼容的 Markdown 文件并写入 vault。

**Architecture:** Content Script 从飞书文档 DOM 提取结构化 blocks，Popup 将 blocks 转换为带 frontmatter 的 Markdown，通过 File System Access API 写入用户授权的 Obsidian vault 目录。

**Tech Stack:** WXT、Vue 3、TypeScript、js-yaml、vitest

---

## 文件结构

```
feishuchajian/
├── package.json
├── wxt.config.ts
├── tsconfig.json
├── vitest.config.ts
├── public/
│   └── icon-128.png          # 占位图标
├── entrypoints/
│   ├── content.ts             # Content Script 入口
│   └── popup/
│       ├── index.html
│       ├── main.ts
│       └── App.vue
├── src/
│   ├── types.ts               # 共享类型定义
│   ├── extractor/
│   │   ├── inline.ts          # 行内 Span 提取（加粗/斜体/链接等）
│   │   ├── blocks.ts          # Block 级 DOM 提取
│   │   └── scroll.ts          # 虚拟滚动加载全部内容
│   ├── converter/
│   │   ├── inline.ts          # Span[] → Markdown 行内字符串
│   │   ├── blocks.ts          # Block[] → Markdown body 字符串
│   │   ├── frontmatter.ts     # DocMeta → YAML frontmatter 字符串
│   │   └── filename.ts        # 标题 → 安全文件名（含冲突处理）
│   ├── storage/
│   │   └── vault.ts           # FileSystemDirectoryHandle 的持久化存取
│   └── filesystem/
│       └── save.ts            # 写入 vault 文件（子目录自动创建）
└── tests/
    ├── converter/
    │   ├── inline.test.ts
    │   ├── blocks.test.ts
    │   ├── frontmatter.test.ts
    │   └── filename.test.ts
    └── filesystem/
        └── save.test.ts
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 初始化 WXT + Vue 3 项目**

```bash
cd /Users/benjamin/work/ai-code/test/feishuchajian
pnpm dlx wxt@latest init . --template vue
```

遇到"目录非空"提示时选择覆盖或手动创建。如果 init 命令不支持当前目录，先在上级目录初始化再移动：

```bash
cd /Users/benjamin/work/ai-code/test
pnpm dlx wxt@latest init feishuchajian-wxt --template vue
cp -r feishuchajian-wxt/* feishuchajian/
rm -rf feishuchajian-wxt
cd feishuchajian
```

- [ ] **Step 2: 安装额外依赖**

```bash
pnpm add -D @wxt-dev/module-vue
pnpm add js-yaml
pnpm add -D vitest @vitest/coverage-v8 jsdom @types/js-yaml @types/jsdom
```

- [ ] **Step 3: 配置 vitest**

创建 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: 配置 wxt.config.ts**

```typescript
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '飞书文档 → Obsidian',
    description: '将飞书文档一键保存为 Obsidian Markdown 笔记',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['*://*.feishu.cn/*'],
  },
})
```

- [ ] **Step 5: 验证项目构建**

```bash
pnpm dev
```

Expected: 浏览器扩展开发服务器启动，无报错。

- [ ] **Step 6: 提交**

```bash
git init
git add .
git commit -m "feat: scaffold WXT + Vue 3 browser extension"
```

---

## Task 2: 共享类型定义

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
// src/types.ts

export type BlockType =
  | 'page'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4'
  | 'heading5' | 'heading6' | 'heading7' | 'heading8' | 'heading9'
  | 'text'
  | 'bullet'
  | 'ordered'
  | 'todo'
  | 'code'
  | 'quote_container'
  | 'divider'
  | 'table'
  | 'image'
  | 'callout'

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  inlineCode?: boolean
  link?: string
}

export interface Cell {
  spans: Span[]
}

export interface Block {
  type: BlockType
  spans?: Span[]          // text / heading / bullet / ordered / todo / quote_container / callout
  level?: number          // bullet / ordered 缩进层级（0 = 顶层）
  language?: string       // code block 语言
  checked?: boolean       // todo 状态
  rows?: Cell[][]         // table 行列数据
  src?: string            // image URL
  alt?: string            // image alt text
}

export interface DocMeta {
  title: string
  source: string
  author?: string         // 原始作者名（不含 [[]]，由 frontmatter 模块加工）
  published?: string      // ISO 日期字符串，如 "2026-04-01"
  created: string         // ISO 日期字符串，保存时自动填入
}

export interface DocContent extends DocMeta {
  blocks: Block[]
}

// Content Script ↔ Popup 消息协议
export type MessageRequest =
  | { type: 'EXTRACT_DOC' }

export type MessageResponse =
  | { ok: true; data: DocContent }
  | { ok: false; error: string }
```

- [ ] **Step 2: 提交**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions"
```

---

## Task 3: 行内 Span 转 Markdown（含测试）

**Files:**
- Create: `src/converter/inline.ts`
- Create: `tests/converter/inline.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/converter/inline.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run tests/converter/inline.test.ts
```

Expected: FAIL — `spansToMarkdown` not found

- [ ] **Step 3: 实现**

```typescript
// src/converter/inline.ts
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
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm vitest run tests/converter/inline.test.ts
```

Expected: PASS — 9 tests

- [ ] **Step 5: 提交**

```bash
git add src/converter/inline.ts tests/converter/inline.test.ts
git commit -m "feat: add inline span to markdown converter"
```

---

## Task 4: Block 转 Markdown（含测试）

**Files:**
- Create: `src/converter/blocks.ts`
- Create: `tests/converter/blocks.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/converter/blocks.test.ts
import { describe, it, expect } from 'vitest'
import { blocksToMarkdown } from '../../src/converter/blocks'
import type { Block } from '../../src/types'

describe('blocksToMarkdown', () => {
  it('heading1', () => {
    const blocks: Block[] = [{ type: 'heading1', spans: [{ text: '标题' }] }]
    expect(blocksToMarkdown(blocks)).toBe('# 标题')
  })

  it('heading3', () => {
    const blocks: Block[] = [{ type: 'heading3', spans: [{ text: '小标题' }] }]
    expect(blocksToMarkdown(blocks)).toBe('### 小标题')
  })

  it('text paragraph', () => {
    const blocks: Block[] = [{ type: 'text', spans: [{ text: '正文内容' }] }]
    expect(blocksToMarkdown(blocks)).toBe('正文内容')
  })

  it('bullet list item', () => {
    const blocks: Block[] = [{ type: 'bullet', spans: [{ text: '项目' }], level: 0 }]
    expect(blocksToMarkdown(blocks)).toBe('- 项目')
  })

  it('nested bullet (level 1)', () => {
    const blocks: Block[] = [{ type: 'bullet', spans: [{ text: '子项' }], level: 1 }]
    expect(blocksToMarkdown(blocks)).toBe('  - 子项')
  })

  it('ordered list item', () => {
    const blocks: Block[] = [
      { type: 'ordered', spans: [{ text: '第一' }], level: 0 },
      { type: 'ordered', spans: [{ text: '第二' }], level: 0 },
    ]
    expect(blocksToMarkdown(blocks)).toBe('1. 第一\n2. 第二')
  })

  it('todo unchecked', () => {
    const blocks: Block[] = [{ type: 'todo', spans: [{ text: '待办' }], checked: false }]
    expect(blocksToMarkdown(blocks)).toBe('- [ ] 待办')
  })

  it('todo checked', () => {
    const blocks: Block[] = [{ type: 'todo', spans: [{ text: '完成' }], checked: true }]
    expect(blocksToMarkdown(blocks)).toBe('- [x] 完成')
  })

  it('code block with language', () => {
    const blocks: Block[] = [{ type: 'code', spans: [{ text: 'const x = 1' }], language: 'typescript' }]
    expect(blocksToMarkdown(blocks)).toBe('```typescript\nconst x = 1\n```')
  })

  it('divider', () => {
    const blocks: Block[] = [{ type: 'divider' }]
    expect(blocksToMarkdown(blocks)).toBe('---')
  })

  it('image', () => {
    const blocks: Block[] = [{ type: 'image', src: 'https://img.example.com/a.png', alt: '截图' }]
    expect(blocksToMarkdown(blocks)).toBe('![截图](https://img.example.com/a.png)')
  })

  it('quote_container', () => {
    const blocks: Block[] = [{ type: 'quote_container', spans: [{ text: '引用内容' }] }]
    expect(blocksToMarkdown(blocks)).toBe('> 引用内容')
  })

  it('table', () => {
    const blocks: Block[] = [{
      type: 'table',
      rows: [
        [{ spans: [{ text: 'A' }] }, { spans: [{ text: 'B' }] }],
        [{ spans: [{ text: '1' }] }, { spans: [{ text: '2' }] }],
      ],
    }]
    expect(blocksToMarkdown(blocks)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('multiple blocks separated by blank line', () => {
    const blocks: Block[] = [
      { type: 'heading1', spans: [{ text: 'H1' }] },
      { type: 'text', spans: [{ text: 'para' }] },
    ]
    expect(blocksToMarkdown(blocks)).toBe('# H1\n\npara')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run tests/converter/blocks.test.ts
```

Expected: FAIL — `blocksToMarkdown` not found

- [ ] **Step 3: 实现**

```typescript
// src/converter/blocks.ts
import type { Block, Cell } from '../types'
import { spansToMarkdown } from './inline'

export function blocksToMarkdown(blocks: Block[]): string {
  const lines: string[] = []
  const orderedCounters: Record<number, number> = {}

  for (const block of blocks) {
    if (block.type !== 'ordered') {
      // reset ordered counters when leaving ordered context
      Object.keys(orderedCounters).forEach(k => delete orderedCounters[Number(k)])
    }
    const line = blockToLine(block, orderedCounters)
    if (line !== null) lines.push(line)
  }

  return lines.join('\n\n')
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
      return `![${block.alt ?? ''}](${block.src ?? ''})`

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
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm vitest run tests/converter/blocks.test.ts
```

Expected: PASS — 14 tests

- [ ] **Step 5: 提交**

```bash
git add src/converter/blocks.ts tests/converter/blocks.test.ts
git commit -m "feat: add block to markdown converter"
```

---

## Task 5: Frontmatter 生成器（含测试）

**Files:**
- Create: `src/converter/frontmatter.ts`
- Create: `tests/converter/frontmatter.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/converter/frontmatter.test.ts
import { describe, it, expect } from 'vitest'
import { buildFrontmatter } from '../../src/converter/frontmatter'
import type { DocMeta } from '../../src/types'

describe('buildFrontmatter', () => {
  it('full metadata', () => {
    const meta: DocMeta = {
      title: '我的会议记录',
      source: 'https://xxx.feishu.cn/docx/abc123',
      author: '张三',
      published: '2026-04-01',
      created: '2026-05-08',
    }
    const result = buildFrontmatter(meta)
    expect(result).toContain('title: "我的会议记录"')
    expect(result).toContain('source: "https://xxx.feishu.cn/docx/abc123"')
    expect(result).toContain('- "[[张三]]"')
    expect(result).toContain('published: 2026-04-01')
    expect(result).toContain('created: 2026-05-08')
    expect(result).toContain('- "clippings"')
    expect(result).toMatch(/^---\n/)
    expect(result).toMatch(/\n---\n$/)
  })

  it('no author - author field is null/empty list', () => {
    const meta: DocMeta = {
      title: '无作者文档',
      source: 'https://feishu.cn/docx/xyz',
      created: '2026-05-08',
    }
    const result = buildFrontmatter(meta)
    expect(result).not.toContain('[[')
    // author 字段存在但值为 null 或空
    expect(result).toContain('author:')
  })

  it('no published - published field is null', () => {
    const meta: DocMeta = {
      title: '测试',
      source: 'https://feishu.cn/docx/xyz',
      created: '2026-05-08',
    }
    const result = buildFrontmatter(meta)
    expect(result).toContain('published:')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run tests/converter/frontmatter.test.ts
```

Expected: FAIL — `buildFrontmatter` not found

- [ ] **Step 3: 实现**

```typescript
// src/converter/frontmatter.ts
import yaml from 'js-yaml'
import type { DocMeta } from '../types'

export function buildFrontmatter(meta: DocMeta): string {
  const data: Record<string, unknown> = {
    title: meta.title,
    source: meta.source,
    author: meta.author ? [`[[${meta.author}]]`] : null,
    published: meta.published ? parseDate(meta.published) : null,
    created: parseDate(meta.created),
    description: null,
    tags: ['clippings'],
  }

  const yamlStr = yaml.dump(data, {
    quotingType: '"',
    forceQuotes: false,
    lineWidth: -1,
  })

  return `---\n${yamlStr}---\n`
}

function parseDate(iso: string): string {
  // js-yaml 会将 "2026-05-08" 识别为 Date 对象，需要强制输出为字符串
  return iso
}
```

**注意**：`js-yaml` dump 默认会将 ISO 日期字符串转为 `Date` 对象输出（如 `2026-05-08T00:00:00.000Z`），需要在调用时加 `schema: yaml.JSON_SCHEMA` 或将日期包装为字符串。如测试失败，修改 `buildFrontmatter` 中的 yaml.dump 调用：

```typescript
const yamlStr = yaml.dump(data, {
  quotingType: '"',
  lineWidth: -1,
  schema: yaml.JSON_SCHEMA,
})
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm vitest run tests/converter/frontmatter.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: 提交**

```bash
git add src/converter/frontmatter.ts tests/converter/frontmatter.test.ts
git commit -m "feat: add frontmatter generator"
```

---

## Task 6: 文件名清理 + 冲突处理（含测试）

**Files:**
- Create: `src/converter/filename.ts`
- Create: `tests/converter/filename.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/converter/filename.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeFilename, resolveFilename } from '../../src/converter/filename'

describe('sanitizeFilename', () => {
  it('normal title', () => {
    expect(sanitizeFilename('我的会议记录')).toBe('我的会议记录')
  })

  it('strips illegal chars', () => {
    expect(sanitizeFilename('file/name:test*?')).toBe('filenametest')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello')
  })

  it('fallback for empty result', () => {
    expect(sanitizeFilename('///**')).toBe('untitled')
  })
})

describe('resolveFilename', () => {
  it('no conflict returns original', () => {
    expect(resolveFilename('note', new Set())).toBe('note')
  })

  it('conflict adds -1 suffix', () => {
    expect(resolveFilename('note', new Set(['note']))).toBe('note-1')
  })

  it('increments suffix until no conflict', () => {
    expect(resolveFilename('note', new Set(['note', 'note-1', 'note-2']))).toBe('note-3')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run tests/converter/filename.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现**

```typescript
// src/converter/filename.ts

const ILLEGAL_CHARS = /[/\\:*?"<>|]/g

export function sanitizeFilename(title: string): string {
  const result = title.trim().replace(ILLEGAL_CHARS, '')
  return result || 'untitled'
}

export function resolveFilename(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let i = 1
  while (existing.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm vitest run tests/converter/filename.test.ts
```

Expected: PASS — 7 tests

- [ ] **Step 5: 提交**

```bash
git add src/converter/filename.ts tests/converter/filename.test.ts
git commit -m "feat: add filename sanitizer and conflict resolver"
```

---

## Task 7: Vault 存储（chrome.storage 持久化）

**Files:**
- Create: `src/storage/vault.ts`

- [ ] **Step 1: 实现 vault 句柄存取**

```typescript
// src/storage/vault.ts

const STORAGE_KEY = 'obsidianVaultHandle'

export async function getVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as FileSystemDirectoryHandle) ?? null
}

export async function setVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: handle })
  // 请求持久化存储，防止浏览器清理
  if (navigator.storage?.persist) {
    await navigator.storage.persist()
  }
}

export async function clearVaultHandle(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

/**
 * 验证已存储的句柄权限是否仍然有效。
 * 返回 true 表示可以直接使用，false 表示需要重新授权。
 */
export async function verifyVaultPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') return true
    const request = await handle.requestPermission({ mode: 'readwrite' })
    return request === 'granted'
  } catch {
    return false
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/storage/vault.ts
git commit -m "feat: add vault handle storage"
```

---

## Task 8: File System 写入（含测试）

**Files:**
- Create: `src/filesystem/save.ts`
- Create: `tests/filesystem/save.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/filesystem/save.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveToVault } from '../../src/filesystem/save'

function makeMockHandle(existingFiles: string[] = []): FileSystemDirectoryHandle {
  const files = new Map<string, string>()
  for (const f of existingFiles) files.set(f, '')

  const makeDir = vi.fn().mockImplementation(async () => makeMockHandle())
  const getFileHandle = vi.fn().mockImplementation(async (name: string) => {
    return {
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }
  })

  const keys = vi.fn().mockImplementation(async function* () {
    for (const name of files.keys()) yield name
  })

  return {
    getDirectoryHandle: makeDir,
    getFileHandle,
    keys,
  } as unknown as FileSystemDirectoryHandle
}

describe('saveToVault', () => {
  it('writes file to subdirectory', async () => {
    const rootHandle = makeMockHandle()
    await saveToVault(rootHandle, 'Clippings', '我的笔记', '# 内容')
    expect(rootHandle.getDirectoryHandle).toHaveBeenCalledWith('Clippings', { create: true })
  })

  it('resolves conflict by appending -1', async () => {
    const subDirHandle = makeMockHandle(['我的笔记.md'])
    const rootHandle = {
      getDirectoryHandle: vi.fn().mockResolvedValue(subDirHandle),
    } as unknown as FileSystemDirectoryHandle

    const result = await saveToVault(rootHandle, 'Clippings', '我的笔记', '# 内容')
    expect(result).toBe('我的笔记-1.md')
  })

  it('returns final filename', async () => {
    const rootHandle = makeMockHandle()
    const result = await saveToVault(rootHandle, 'Clippings', '新笔记', '# 内容')
    expect(result).toBe('新笔记.md')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm vitest run tests/filesystem/save.test.ts
```

Expected: FAIL — `saveToVault` not found

- [ ] **Step 3: 实现**

```typescript
// src/filesystem/save.ts
import { sanitizeFilename, resolveFilename } from '../converter/filename'

/**
 * 将内容写入 vault 的指定子目录，自动创建目录，处理文件名冲突。
 * @returns 实际写入的文件名（含 .md 扩展名）
 */
export async function saveToVault(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  title: string,
  content: string
): Promise<string> {
  const dirHandle = await vaultHandle.getDirectoryHandle(subDir, { create: true })

  // 收集目录中已有的文件名（不含扩展名）
  const existing = new Set<string>()
  for await (const name of dirHandle.keys()) {
    if (name.endsWith('.md')) existing.add(name.slice(0, -3))
  }

  const base = sanitizeFilename(title)
  const finalName = resolveFilename(base, existing)
  const filename = `${finalName}.md`

  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()

  return filename
}
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm vitest run tests/filesystem/save.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: 运行所有测试**

```bash
pnpm vitest run
```

Expected: PASS — 所有之前的测试仍然通过

- [ ] **Step 6: 提交**

```bash
git add src/filesystem/save.ts tests/filesystem/save.test.ts
git commit -m "feat: add vault file system save"
```

---

## Task 9: Content Script — DOM 提取

**Files:**
- Create: `src/extractor/scroll.ts`
- Create: `src/extractor/inline.ts`
- Create: `src/extractor/blocks.ts`
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: 创建虚拟滚动加载器**

```typescript
// src/extractor/scroll.ts

const CONTAINER_SELECTOR = '#mainBox .bear-web-x-container'
const SCROLL_STEP = 800
const SCROLL_DELAY = 120   // ms，等待虚拟渲染
const MAX_WAIT = 15_000    // ms，最多等待 15 秒

export async function scrollToLoadAll(): Promise<Element | null> {
  const container = document.querySelector(CONTAINER_SELECTOR)
  if (!container) return null

  const scrollable = findScrollable(container)
  if (!scrollable) return container

  const start = Date.now()
  let lastHeight = 0

  while (Date.now() - start < MAX_WAIT) {
    scrollable.scrollTop += SCROLL_STEP
    await delay(SCROLL_DELAY)
    const newHeight = scrollable.scrollHeight
    if (newHeight === lastHeight && scrollable.scrollTop + scrollable.clientHeight >= newHeight) break
    lastHeight = newHeight
  }

  // 滚回顶部
  scrollable.scrollTop = 0
  await delay(SCROLL_DELAY)

  return container
}

function findScrollable(el: Element): Element | null {
  let node: Element | null = el
  while (node) {
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
```

- [ ] **Step 2: 创建行内 Span 提取器**

```typescript
// src/extractor/inline.ts
import type { Span } from '../types'

export function extractSpans(el: Element): Span[] {
  const spans: Span[] = []

  // 飞书文档行内元素通常是 <span> 包含 data-* 属性
  const leaves = el.querySelectorAll('[data-leaf], span[class*="text-"]')

  if (leaves.length === 0) {
    // fallback: 直接取 textContent
    const text = el.textContent?.trim() ?? ''
    if (text) spans.push({ text })
    return spans
  }

  for (const leaf of leaves) {
    const text = leaf.textContent ?? ''
    if (!text) continue

    const span: Span = { text }

    // 检测格式标记（飞书通过 data 属性或 class 声明格式）
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
```

- [ ] **Step 3: 创建 Block 提取器**

```typescript
// src/extractor/blocks.ts
import type { Block, BlockType, Cell } from '../types'
import { extractSpans } from './inline'

export function extractBlocks(container: Element): Block[] {
  const blockEls = container.querySelectorAll('[data-block-type]')
  const blocks: Block[] = []

  for (const el of blockEls) {
    const type = el.getAttribute('data-block-type') as BlockType
    if (!type) continue

    const block = parseBlock(el, type)
    if (block) blocks.push(block)
  }

  return blocks
}

function parseBlock(el: Element, type: BlockType): Block | null {
  switch (type) {
    case 'page':
    case 'heading1': case 'heading2': case 'heading3':
    case 'heading4': case 'heading5': case 'heading6':
    case 'heading7': case 'heading8': case 'heading9':
    case 'text':
    case 'quote_container':
    case 'callout':
      return { type, spans: extractSpans(el) }

    case 'bullet':
    case 'ordered': {
      const level = Number(el.getAttribute('data-indent-level') ?? 0)
      return { type, spans: extractSpans(el), level }
    }

    case 'todo': {
      const checked = el.getAttribute('data-checked') === 'true' ||
        el.querySelector('input[type="checkbox"]')?.getAttribute('checked') !== null
      return { type, spans: extractSpans(el), checked }
    }

    case 'code': {
      const language = el.getAttribute('data-language') ??
        el.querySelector('[data-language]')?.getAttribute('data-language') ?? ''
      const text = el.querySelector('pre, code, [data-code-content]')?.textContent ??
        el.textContent ?? ''
      return { type, spans: [{ text }], language }
    }

    case 'divider':
      return { type }

    case 'image': {
      const img = el.querySelector('img')
      return { type, src: img?.src ?? '', alt: img?.alt ?? '' }
    }

    case 'table': {
      const rows = extractTableRows(el)
      return rows.length > 0 ? { type, rows } : null
    }

    default:
      return null
  }
}

function extractTableRows(tableEl: Element): Cell[][] {
  const rows: Cell[][] = []
  const trEls = tableEl.querySelectorAll('tr')

  for (const tr of trEls) {
    const cells: Cell[] = []
    for (const td of tr.querySelectorAll('td, th')) {
      cells.push({ spans: extractSpans(td) })
    }
    if (cells.length > 0) rows.push(cells)
  }

  return rows
}
```

- [ ] **Step 4: 实现 Content Script 入口**

```typescript
// entrypoints/content.ts
import { defineContentScript } from 'wxt/sandbox'
import type { MessageRequest, MessageResponse, DocContent } from '../src/types'
import { scrollToLoadAll } from '../src/extractor/scroll'
import { extractBlocks } from '../src/extractor/blocks'

export default defineContentScript({
  matches: ['*://*.feishu.cn/docx/*', '*://*.feishu.cn/wiki/*'],

  main() {
    chrome.runtime.onMessage.addListener(
      (message: MessageRequest, _sender, sendResponse: (r: MessageResponse) => void) => {
        if (message.type === 'EXTRACT_DOC') {
          extractDoc().then(sendResponse).catch(err =>
            sendResponse({ ok: false, error: String(err) })
          )
          return true // 保持 sendResponse 有效
        }
      }
    )
  },
})

async function extractDoc(): Promise<MessageResponse> {
  const container = await scrollToLoadAll()
  if (!container) {
    return { ok: false, error: '找不到飞书文档内容容器，请确认当前页面是飞书文档。' }
  }

  const blocks = extractBlocks(container)
  const titleBlock = blocks.find(b => b.type === 'page')
  const title = titleBlock?.spans?.map(s => s.text).join('') ??
    document.title.replace(' - 飞书文档', '').trim()

  // 尝试从页面 meta 提取作者和发布时间
  const author = extractMeta('author') ?? extractMeta('feishu:creator')
  const published = extractMeta('article:published_time') ??
    extractMeta('feishu:create_time')

  const data: DocContent = {
    title,
    source: location.href,
    author: author ?? undefined,
    published: published ? published.slice(0, 10) : undefined,
    created: new Date().toISOString().slice(0, 10),
    blocks: blocks.filter(b => b.type !== 'page'), // 标题不重复放入正文
  }

  return { ok: true, data }
}

function extractMeta(name: string): string | null {
  return (
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
    null
  )
}
```

- [ ] **Step 5: 提交**

```bash
git add src/extractor/ entrypoints/content.ts
git commit -m "feat: add content script DOM extractor"
```

---

## Task 10: Vue Composables

**Files:**
- Create: `src/composables/useVaultStore.ts`
- Create: `src/composables/useDocContent.ts`
- Create: `src/composables/useFileSave.ts`

- [ ] **Step 1: useVaultStore**

```typescript
// src/composables/useVaultStore.ts
import { ref } from 'vue'
import {
  getVaultHandle,
  setVaultHandle,
  clearVaultHandle,
  verifyVaultPermission,
} from '../storage/vault'

export function useVaultStore() {
  const handle = ref<FileSystemDirectoryHandle | null>(null)
  const isAuthorized = ref(false)
  const isLoading = ref(false)

  async function init() {
    isLoading.value = true
    try {
      const stored = await getVaultHandle()
      if (stored) {
        const valid = await verifyVaultPermission(stored)
        if (valid) {
          handle.value = stored
          isAuthorized.value = true
        } else {
          await clearVaultHandle()
        }
      }
    } finally {
      isLoading.value = false
    }
  }

  async function authorize() {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' })
    await setVaultHandle(dir)
    handle.value = dir
    isAuthorized.value = true
  }

  return { handle, isAuthorized, isLoading, init, authorize }
}
```

- [ ] **Step 2: useDocContent**

```typescript
// src/composables/useDocContent.ts
import { ref } from 'vue'
import type { DocContent, MessageRequest, MessageResponse } from '../types'

export function useDocContent() {
  const doc = ref<DocContent | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  async function fetch() {
    isLoading.value = true
    error.value = null
    doc.value = null

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('无法获取当前标签页')

      const msg: MessageRequest = { type: 'EXTRACT_DOC' }
      const response: MessageResponse = await chrome.tabs.sendMessage(tab.id, msg)

      if (!response.ok) throw new Error(response.error)
      doc.value = response.data
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isLoading.value = false
    }
  }

  return { doc, error, isLoading, fetch }
}
```

- [ ] **Step 3: useFileSave**

```typescript
// src/composables/useFileSave.ts
import { ref } from 'vue'
import { saveToVault } from '../filesystem/save'
import { buildFrontmatter } from '../converter/frontmatter'
import { blocksToMarkdown } from '../converter/blocks'
import type { DocContent } from '../types'

export function useFileSave() {
  const savedFilename = ref<string | null>(null)
  const error = ref<string | null>(null)
  const isSaving = ref(false)

  async function save(
    vaultHandle: FileSystemDirectoryHandle,
    doc: DocContent,
    subDir: string
  ) {
    isSaving.value = true
    error.value = null
    savedFilename.value = null

    try {
      const frontmatter = buildFrontmatter(doc)
      const body = blocksToMarkdown(doc.blocks)
      const content = `${frontmatter}\n${body}\n`

      const filename = await saveToVault(vaultHandle, subDir, doc.title, content)
      savedFilename.value = filename
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isSaving.value = false
    }
  }

  async function copyToClipboard(doc: DocContent) {
    const frontmatter = buildFrontmatter(doc)
    const body = blocksToMarkdown(doc.blocks)
    const content = `${frontmatter}\n${body}\n`
    await navigator.clipboard.writeText(content)
  }

  return { savedFilename, error, isSaving, save, copyToClipboard }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/composables/
git commit -m "feat: add Vue composables for vault, doc, and save"
```

---

## Task 11: Popup UI

**Files:**
- Modify: `entrypoints/popup/App.vue`
- Create: `entrypoints/popup/index.html`
- Modify: `entrypoints/popup/main.ts`

- [ ] **Step 1: 创建 App.vue**

```vue
<!-- entrypoints/popup/App.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useVaultStore } from '../../src/composables/useVaultStore'
import { useDocContent } from '../../src/composables/useDocContent'
import { useFileSave } from '../../src/composables/useFileSave'

const vault = useVaultStore()
const docContent = useDocContent()
const fileSave = useFileSave()

const subDir = ref('Clippings')
const propertiesOpen = ref(true)
const showDropdown = ref(false)

// 可编辑的 frontmatter 字段
const editableTitle = ref('')
const editableTags = ref('clippings')

onMounted(async () => {
  await vault.init()
  await docContent.fetch()
  if (docContent.doc.value) {
    editableTitle.value = docContent.doc.value.title
  }
})

const doc = computed(() => docContent.doc.value)
const isFeishuDoc = computed(() => doc.value !== null || docContent.isLoading.value)

const previewLines = computed(() => {
  if (!doc.value) return []
  const lines: string[] = []
  for (const block of doc.value.blocks) {
    if (block.spans) lines.push(block.spans.map(s => s.text).join(''))
    if (lines.length >= 5) break
  }
  return lines
})

async function handleSave() {
  if (!vault.handle.value || !doc.value) return
  const mergedDoc = {
    ...doc.value,
    title: editableTitle.value || doc.value.title,
  }
  await fileSave.save(vault.handle.value, mergedDoc, subDir.value)
  showDropdown.value = false
}

async function handleCopy() {
  if (!doc.value) return
  const mergedDoc = {
    ...doc.value,
    title: editableTitle.value || doc.value.title,
  }
  await fileSave.copyToClipboard(mergedDoc)
  showDropdown.value = false
}
</script>

<template>
  <div class="popup">
    <!-- 非飞书文档页 -->
    <div v-if="!isFeishuDoc && !docContent.isLoading.value" class="empty-state">
      <p>请在飞书文档页面使用此插件</p>
    </div>

    <!-- 加载中 -->
    <div v-else-if="docContent.isLoading.value" class="loading">
      <p>正在提取文档内容…</p>
    </div>

    <!-- 主界面 -->
    <template v-else-if="doc">
      <!-- 标题 -->
      <h2 class="doc-title">{{ doc.title }}</h2>

      <!-- 属性面板 -->
      <div class="properties">
        <button class="properties-toggle" @click="propertiesOpen = !propertiesOpen">
          属性 {{ propertiesOpen ? '∧' : '∨' }}
        </button>
        <div v-if="propertiesOpen" class="properties-body">
          <div class="prop-row">
            <span class="prop-icon">≡</span>
            <span class="prop-label">title</span>
            <input v-model="editableTitle" class="prop-input" />
          </div>
          <div class="prop-row">
            <span class="prop-icon">≡</span>
            <span class="prop-label">source</span>
            <span class="prop-value truncate">{{ doc.source }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-icon">≡</span>
            <span class="prop-label">author</span>
            <span class="prop-value">{{ doc.author ? `[[${doc.author}]]` : '' }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-icon">📅</span>
            <span class="prop-label">published</span>
            <span class="prop-value">{{ doc.published ?? '' }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-icon">📅</span>
            <span class="prop-label">created</span>
            <span class="prop-value">{{ doc.created }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-icon">≡</span>
            <span class="prop-label">tags</span>
            <input v-model="editableTags" class="prop-input" />
          </div>
        </div>
      </div>

      <!-- 内容预览 -->
      <div class="preview">
        <p v-for="(line, i) in previewLines" :key="i" class="preview-line">{{ line }}</p>
      </div>

      <!-- 目录输入 + 保存按钮 -->
      <div class="footer">
        <input v-model="subDir" class="dir-input" placeholder="Clippings" />

        <!-- 未授权 vault -->
        <button v-if="!vault.isAuthorized.value" class="btn-authorize" @click="vault.authorize()">
          选择 Obsidian Vault 目录
        </button>

        <!-- 已授权，显示保存按钮 -->
        <div v-else class="save-row">
          <button
            class="btn-save"
            :disabled="fileSave.isSaving.value"
            @click="handleSave"
          >
            {{ fileSave.isSaving.value ? '保存中…' : '保存到 Obsidian' }}
          </button>
          <button class="btn-dropdown" @click="showDropdown = !showDropdown">▼</button>
          <div v-if="showDropdown" class="dropdown">
            <button @click="handleCopy">复制 Markdown</button>
          </div>
        </div>

        <!-- 保存结果 -->
        <p v-if="fileSave.savedFilename.value" class="success">
          ✓ 已保存到 {{ subDir }}/{{ fileSave.savedFilename.value }}
        </p>
        <p v-if="fileSave.error.value" class="error">{{ fileSave.error.value }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.popup { width: 380px; min-height: 200px; font-family: sans-serif; padding: 12px; }
.doc-title { font-size: 15px; font-weight: 600; margin: 0 0 8px; line-height: 1.4; }
.properties { border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px; }
.properties-toggle { background: none; border: none; width: 100%; text-align: left;
  padding: 8px 12px; cursor: pointer; font-size: 13px; color: #555; }
.properties-body { padding: 4px 12px 8px; }
.prop-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; }
.prop-icon { width: 16px; text-align: center; color: #888; }
.prop-label { width: 70px; color: #666; flex-shrink: 0; }
.prop-input { flex: 1; border: none; border-bottom: 1px solid #ddd; font-size: 12px;
  outline: none; padding: 1px 2px; }
.prop-value { flex: 1; color: #333; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.truncate { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.preview { background: #f9f9f9; border-radius: 4px; padding: 8px; margin-bottom: 8px;
  font-size: 12px; color: #444; max-height: 80px; overflow: hidden; }
.preview-line { margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.footer { display: flex; flex-direction: column; gap: 6px; }
.dir-input { border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px;
  font-size: 13px; outline: none; }
.save-row { display: flex; gap: 2px; position: relative; }
.btn-save { flex: 1; background: #6e4dc4; color: white; border: none; border-radius: 6px 0 0 6px;
  padding: 10px; font-size: 14px; font-weight: 500; cursor: pointer; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-dropdown { background: #6e4dc4; color: white; border: none; border-radius: 0 6px 6px 0;
  padding: 10px 12px; cursor: pointer; }
.dropdown { position: absolute; bottom: 44px; right: 0; background: white;
  border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); z-index: 10; }
.dropdown button { display: block; width: 100%; padding: 8px 16px; border: none;
  background: none; cursor: pointer; font-size: 13px; text-align: left; }
.dropdown button:hover { background: #f5f5f5; }
.btn-authorize { background: #6e4dc4; color: white; border: none; border-radius: 6px;
  padding: 10px; font-size: 14px; cursor: pointer; }
.success { color: #2e7d32; font-size: 12px; margin: 0; }
.error { color: #c62828; font-size: 12px; margin: 0; }
.loading, .empty-state { padding: 20px; text-align: center; color: #666; font-size: 13px; }
</style>
```

- [ ] **Step 2: 更新 popup/index.html**

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>飞书文档 → Obsidian</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: 构建并验证**

```bash
pnpm build
```

Expected: 构建成功，`.output/` 目录下生成各浏览器扩展包，无 TypeScript 报错。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/popup/
git commit -m "feat: add popup UI with properties panel and save button"
```

---

## Task 12: 手动集成测试

这些步骤需要在真实浏览器中完成，无法自动化。

- [ ] **Step 1: 在 Chrome 中加载插件**

1. 运行 `pnpm build`
2. 打开 `chrome://extensions/`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `.output/chrome-mv3/` 目录

- [ ] **Step 2: 测试内容提取**

1. 打开任意飞书文档（需已登录）
2. 点击插件图标
3. 确认 Popup 显示文档标题和属性

- [ ] **Step 3: 测试首次授权**

1. 点击「选择 Obsidian Vault 目录」
2. 在文件选择器中选择本地 Obsidian vault 根目录
3. 确认按钮变为「保存到 Obsidian」

- [ ] **Step 4: 测试保存**

1. 确认目标目录为 `Clippings`
2. 点击「保存到 Obsidian」
3. 在 Obsidian vault 的 `Clippings/` 目录中确认 `.md` 文件已创建
4. 打开文件，确认 frontmatter 格式与 Obsidian Web Clipper 一致

- [ ] **Step 5: 测试冲突处理**

1. 对同一篇文档再次点击保存
2. 确认生成了 `{标题}-1.md` 而非覆盖原文件

- [ ] **Step 6: 提交最终版本**

```bash
git add -A
git commit -m "feat: complete feishu obsidian clipper MVP"
```

---

## 全部测试命令

```bash
pnpm vitest run          # 运行所有单元测试
pnpm build               # 构建所有浏览器目标
pnpm dev                 # 开发模式（Chrome）
pnpm dev:firefox         # 开发模式（Firefox）
```
