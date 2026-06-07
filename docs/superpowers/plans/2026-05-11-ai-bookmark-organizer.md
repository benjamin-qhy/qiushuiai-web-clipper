# AI 书签整理器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 AI 驱动的浏览器书签整理功能：读取"待整理"书签文件夹，去重 & 死链清理，AI 生成摘要/标签/分类，将书签移入浏览器分类文件夹，并可手动导出分类笔记到 Obsidian Vault。

**Architecture:** Background Service Worker 通过 `chrome.alarms`（定时 + 启动时）和 `chrome.runtime` 消息（手动触发）编排完整处理流程。纯逻辑模块（AI provider、去重检测、导出格式）独立可测试。Bookmarks 专属页面负责进度展示和手动触发 Obsidian 导出（File System Access API 需在页面上下文使用）。

**Tech Stack:** WXT + Vue 3 + TypeScript, chrome.bookmarks API, browser.alarms API, IndexedDB, File System Access API, OpenAI-compatible REST API (默认阿里云通义千问)

---

## 文件结构

**新增：**
```
src/ai/types.ts                    AIProvider 接口 + AIResult 类型
src/ai/aliyun.ts                   OpenAICompatibleProvider 实现
src/ai/index.ts                    createAIProvider 工厂函数
src/storage/bookmarks.ts           IndexedDB 书签状态存储 + ProcessingStatus 类型
src/bookmark/duplicates.ts         deduplicateByUrl + isDeadLink 纯函数
src/bookmark/process.ts            buildPrompt + parseAIResult + processBookmark
src/bookmark/export.ts             buildBookmarkEntry + extractExistingUrls + exportCategoriesToVault
entrypoints/bookmarks/index.html
entrypoints/bookmarks/main.ts
entrypoints/bookmarks/App.vue
tests/ai/aliyun.test.ts
tests/bookmark/duplicates.test.ts
tests/bookmark/process.test.ts
tests/bookmark/export.test.ts
```

**修改：**
```
src/storage/settings.ts            新增 AIConfig 接口 + 4 个 settings 字段
src/filesystem/save.ts             getDir 改为 export
entrypoints/background.ts          完整重写：alarms + 消息处理 + 处理流程
entrypoints/popup/App.vue          新增"整理书签"入口按钮
entrypoints/options/App.vue        新增 AI 配置 + 书签设置区块
wxt.config.ts                      新增权限：bookmarks, alarms, <all_urls>
```

---

## Task 1: 扩展 Settings

**Files:**
- Modify: `src/storage/settings.ts`

- [ ] **Step 1: 在 settings.ts 中新增 AIConfig 接口和字段**

将文件改为如下内容（保留现有内容，在顶部加 AIConfig，在 Settings 里加 4 个字段，在 DEFAULT_SETTINGS 里加默认值，在 getSettings 合并处理 aiConfig）：

```typescript
import { browser } from 'wxt/browser'

export interface AliyunOSSConfig {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
  prefix: string
  customDomain: string
}

export interface AIConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  subDir: string
  imageMode: 'local' | 'oss'
  ossProvider: 'aliyun'
  aliyunOSS: AliyunOSSConfig
  aiConfig: AIConfig
  bookmarkInboxFolder: string
  processInterval: number
  bookmarkSubDir: string
}

const STORAGE_KEY = 'feishu-clipper-settings'

export const DEFAULT_SETTINGS: Settings = {
  subDir: 'Clippings',
  imageMode: 'local',
  ossProvider: 'aliyun',
  aliyunOSS: {
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: 'oss-cn-hangzhou',
    prefix: 'qiushui-web-clipper',
    customDomain: '',
  },
  aiConfig: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    model: 'qwen-long',
  },
  bookmarkInboxFolder: '待整理',
  processInterval: 6,
  bookmarkSubDir: 'Bookmarks',
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS, ...stored.aliyunOSS },
    aiConfig: { ...DEFAULT_SETTINGS.aiConfig, ...stored.aiConfig },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings })
}
```

- [ ] **Step 2: 更新 src/composables/useSettings.ts，深拷贝 aiConfig**

将第 6 行的 ref 初始值改为：

```typescript
const settings = ref<Settings>({
  ...DEFAULT_SETTINGS,
  aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS },
  aiConfig: { ...DEFAULT_SETTINGS.aiConfig },
})
```

将 `getSettingsSnapshot` 改为：

```typescript
function getSettingsSnapshot(): Settings {
  return {
    ...settings.value,
    aliyunOSS: { ...settings.value.aliyunOSS },
    aiConfig: { ...settings.value.aiConfig },
  }
}
```

- [ ] **Step 3: 运行类型检查确认无报错**

```bash
pnpm compile
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/storage/settings.ts src/composables/useSettings.ts
git commit -m "feat: add AIConfig and bookmark settings fields"
```

---

## Task 2: AI Provider 抽象层

**Files:**
- Create: `src/ai/types.ts`
- Create: `src/ai/aliyun.ts`
- Create: `src/ai/index.ts`
- Create: `tests/ai/aliyun.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/ai/aliyun.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../../src/ai/aliyun'

describe('OpenAICompatibleProvider', () => {
  it('returns content from successful API response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"摘要","tags":["前端"],"category":"技术"}' } }],
      }),
    } as unknown as Response)

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
    })
    const result = await provider.complete('prompt')
    expect(result).toBe('{"summary":"摘要","tags":["前端"],"category":"技术"}')
  })

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model: '',
    })
    await expect(provider.complete('prompt')).rejects.toThrow('AI API error: 401')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run tests/ai/aliyun.test.ts
```

Expected: FAIL — "Cannot find module '../../src/ai/aliyun'"

- [ ] **Step 3: 创建 src/ai/types.ts**

```typescript
export interface AIProvider {
  complete(prompt: string): Promise<string>
}

export interface AIResult {
  summary: string
  tags: string[]
  category: string
}
```

- [ ] **Step 4: 创建 src/ai/aliyun.ts**

```typescript
import type { AIConfig } from '../storage/settings'
import type { AIProvider } from './types'

export class OpenAICompatibleProvider implements AIProvider {
  constructor(private config: AIConfig) {}

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) throw new Error(`AI API error: ${res.status}`)
    const data = await res.json() as { choices: { message: { content: string } }[] }
    return data.choices[0]?.message?.content ?? ''
  }
}
```

- [ ] **Step 5: 创建 src/ai/index.ts**

```typescript
import type { AIConfig } from '../storage/settings'
import type { AIProvider } from './types'
import { OpenAICompatibleProvider } from './aliyun'

export function createAIProvider(config: AIConfig): AIProvider {
  return new OpenAICompatibleProvider(config)
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm vitest run tests/ai/aliyun.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/ai/ tests/ai/
git commit -m "feat: add AI provider abstraction (OpenAI-compatible)"
```

---

## Task 3: Bookmark 状态存储 (IndexedDB)

**Files:**
- Create: `src/storage/bookmarks.ts`

（IndexedDB 直接测试依赖浏览器环境，此模块不写单元测试，逻辑简单参照 vault.ts 模式。）

- [ ] **Step 1: 创建 src/storage/bookmarks.ts**

```typescript
export interface BookmarkRecord {
  id: string
  url: string
  title: string
  summary: string
  tags: string[]
  category: string
  processedAt: number
}

export interface ProcessingStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  total: number
  processed: number
  duplicatesRemoved: number
  deadLinksRemoved: number
  lastRunAt: number | null
  error?: string
}

const DB_NAME = 'qiushui-bookmarks'
const STORE_NAME = 'records'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveBookmarkRecord(record: BookmarkRecord): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(record)
    req.onsuccess = () => { db.close(); resolve() }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getAllBookmarkRecords(): Promise<BookmarkRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as BookmarkRecord[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getProcessedIds(): Promise<Set<string>> {
  const records = await getAllBookmarkRecords()
  return new Set(records.map(r => r.id))
}
```

- [ ] **Step 2: 运行类型检查**

```bash
pnpm compile
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/storage/bookmarks.ts
git commit -m "feat: add bookmark state storage (IndexedDB)"
```

---

## Task 4: 去重 & 死链检测

**Files:**
- Create: `src/bookmark/duplicates.ts`
- Create: `tests/bookmark/duplicates.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/bookmark/duplicates.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { deduplicateByUrl, isDeadLink } from '../../src/bookmark/duplicates'

describe('deduplicateByUrl', () => {
  it('keeps earliest bookmark when URL duplicates', () => {
    const bookmarks = [
      { id: '1', url: 'https://example.com', dateAdded: 200 },
      { id: '2', url: 'https://example.com', dateAdded: 100 },
      { id: '3', url: 'https://other.com', dateAdded: 300 },
    ]
    const { keep, remove } = deduplicateByUrl(bookmarks)
    expect(keep.map(b => b.id)).toContain('2')
    expect(remove.map(b => b.id)).toContain('1')
    expect(keep).toHaveLength(2)
    expect(remove).toHaveLength(1)
  })

  it('keeps single bookmark with no duplicates', () => {
    const bookmarks = [{ id: '1', url: 'https://a.com', dateAdded: 100 }]
    const { keep, remove } = deduplicateByUrl(bookmarks)
    expect(keep).toHaveLength(1)
    expect(remove).toHaveLength(0)
  })

  it('handles bookmarks without url', () => {
    const bookmarks = [{ id: '1', url: undefined as unknown as string, dateAdded: 100 }]
    const { keep, remove } = deduplicateByUrl(bookmarks)
    expect(keep).toHaveLength(0)
    expect(remove).toHaveLength(0)
  })
})

describe('isDeadLink', () => {
  it('returns true when fetch throws (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    expect(await isDeadLink('https://dead.example.com')).toBe(true)
  })

  it('returns true when status >= 400', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 404 } as Response)
    expect(await isDeadLink('https://notfound.example.com')).toBe(true)
  })

  it('returns false when status 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 } as Response)
    expect(await isDeadLink('https://ok.example.com')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run tests/bookmark/duplicates.test.ts
```

Expected: FAIL — "Cannot find module '../../src/bookmark/duplicates'"

- [ ] **Step 3: 创建 src/bookmark/duplicates.ts**

```typescript
interface MinimalBookmark {
  id: string
  url?: string
  dateAdded?: number
}

export function deduplicateByUrl(bookmarks: MinimalBookmark[]): {
  keep: MinimalBookmark[]
  remove: MinimalBookmark[]
} {
  const byUrl = new Map<string, MinimalBookmark>()
  const remove: MinimalBookmark[] = []

  for (const bm of bookmarks) {
    if (!bm.url) continue
    const existing = byUrl.get(bm.url)
    if (!existing) {
      byUrl.set(bm.url, bm)
    } else {
      const keepExisting = (existing.dateAdded ?? 0) <= (bm.dateAdded ?? 0)
      if (keepExisting) {
        remove.push(bm)
      } else {
        remove.push(existing)
        byUrl.set(bm.url, bm)
      }
    }
  }

  return { keep: Array.from(byUrl.values()), remove }
}

export async function isDeadLink(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return res.status >= 400
  } catch {
    return true
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run tests/bookmark/duplicates.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/bookmark/duplicates.ts tests/bookmark/duplicates.test.ts
git commit -m "feat: add bookmark dedup and dead link detection"
```

---

## Task 5: AI 处理逻辑

**Files:**
- Create: `src/bookmark/process.ts`
- Create: `tests/bookmark/process.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/bookmark/process.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { buildPrompt, parseAIResult, processBookmark } from '../../src/bookmark/process'
import type { AIProvider } from '../../src/ai/types'

describe('buildPrompt', () => {
  it('includes title, url, and content', () => {
    const prompt = buildPrompt('Vite', 'https://vitejs.dev', '构建工具')
    expect(prompt).toContain('Vite')
    expect(prompt).toContain('https://vitejs.dev')
    expect(prompt).toContain('构建工具')
  })

  it('truncates content to 2000 chars', () => {
    const long = 'a'.repeat(3000)
    const prompt = buildPrompt('T', 'https://t.com', long)
    expect(prompt).toContain('a'.repeat(2000))
    expect(prompt.split('a'.repeat(2001)).length).toBe(1)
  })
})

describe('parseAIResult', () => {
  it('parses valid JSON', () => {
    const raw = JSON.stringify({ summary: '摘要', tags: ['前端', '工具'], category: '技术工具' })
    const result = parseAIResult(raw)
    expect(result.summary).toBe('摘要')
    expect(result.tags).toEqual(['前端', '工具'])
    expect(result.category).toBe('技术工具')
  })

  it('falls back to defaults on invalid JSON', () => {
    const result = parseAIResult('not json at all')
    expect(result.summary).toBe('')
    expect(result.tags).toEqual([])
    expect(result.category).toBe('未分类')
  })

  it('falls back to 未分类 when category missing', () => {
    const result = parseAIResult(JSON.stringify({ summary: 's', tags: [] }))
    expect(result.category).toBe('未分类')
  })
})

describe('processBookmark', () => {
  it('calls AI provider and returns parsed result', async () => {
    const mockProvider: AIProvider = {
      async complete() {
        return JSON.stringify({ summary: 'AI摘要', tags: ['工具'], category: '技术工具' })
      },
    }
    const result = await processBookmark('Test', 'https://test.com', 'content', mockProvider)
    expect(result.summary).toBe('AI摘要')
    expect(result.category).toBe('技术工具')
    expect(result.tags).toEqual(['工具'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run tests/bookmark/process.test.ts
```

Expected: FAIL — "Cannot find module '../../src/bookmark/process'"

- [ ] **Step 3: 创建 src/bookmark/process.ts**

```typescript
import type { AIProvider } from '../ai/types'
import type { AIResult } from '../ai/types'

export function buildPrompt(title: string, url: string, pageText: string): string {
  const content = pageText.slice(0, 2000)
  return `你是一个书签整理助手。根据以下网页信息，输出一个 JSON 对象。

标题: ${title}
URL: ${url}
正文摘要: ${content}

输出格式（仅输出 JSON，不要其他内容）：
{"summary":"一句话描述网页核心内容，50字以内，中文","tags":["标签1","标签2","标签3"],"category":"分类名称（中文）"}`
}

export function parseAIResult(raw: string): AIResult {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === 'string')
        : [],
      category: typeof parsed.category === 'string' && parsed.category ? parsed.category : '未分类',
    }
  } catch {
    return { summary: '', tags: [], category: '未分类' }
  }
}

export async function processBookmark(
  title: string,
  url: string,
  pageText: string,
  aiProvider: AIProvider,
): Promise<AIResult> {
  const prompt = buildPrompt(title, url, pageText)
  const raw = await aiProvider.complete(prompt)
  return parseAIResult(raw)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run tests/bookmark/process.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/bookmark/process.ts tests/bookmark/process.test.ts
git commit -m "feat: add bookmark AI processing logic"
```

---

## Task 6: 导出到 Obsidian

**Files:**
- Create: `src/bookmark/export.ts`
- Create: `tests/bookmark/export.test.ts`
- Modify: `src/filesystem/save.ts` (export `getDir`)

- [ ] **Step 1: 写失败测试**

创建 `tests/bookmark/export.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { buildBookmarkEntry, buildCategoryFrontmatter, extractExistingUrls } from '../../src/bookmark/export'
import type { BookmarkRecord } from '../../src/storage/bookmarks'

const record: BookmarkRecord = {
  id: '1',
  url: 'https://vitejs.dev',
  title: 'Vite',
  summary: '快速前端构建工具',
  tags: ['前端', '构建'],
  category: '技术工具',
  processedAt: 1715000000000,
}

describe('buildBookmarkEntry', () => {
  it('formats title as markdown link', () => {
    expect(buildBookmarkEntry(record)).toContain('## [Vite](https://vitejs.dev)')
  })

  it('includes summary as blockquote', () => {
    expect(buildBookmarkEntry(record)).toContain('> 快速前端构建工具')
  })

  it('includes tags with hash prefix', () => {
    const entry = buildBookmarkEntry(record)
    expect(entry).toContain('#前端')
    expect(entry).toContain('#构建')
  })
})

describe('buildCategoryFrontmatter', () => {
  it('includes category in tags and as heading', () => {
    const fm = buildCategoryFrontmatter('技术工具', '2026-05-11')
    expect(fm).toContain('tags: [bookmarks, 技术工具]')
    expect(fm).toContain('updated: 2026-05-11')
    expect(fm).toContain('# 技术工具')
  })
})

describe('extractExistingUrls', () => {
  it('extracts URLs from markdown bookmark entries', () => {
    const content = '# 技术工具\n\n## [Vite](https://vitejs.dev)\n> summary\n'
    const urls = extractExistingUrls(content)
    expect(urls.has('https://vitejs.dev')).toBe(true)
  })

  it('extracts multiple URLs', () => {
    const content = '## [A](https://a.com)\n## [B](https://b.com)\n'
    const urls = extractExistingUrls(content)
    expect(urls.has('https://a.com')).toBe(true)
    expect(urls.has('https://b.com')).toBe(true)
  })

  it('returns empty set for empty content', () => {
    expect(extractExistingUrls('').size).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run tests/bookmark/export.test.ts
```

Expected: FAIL — "Cannot find module '../../src/bookmark/export'"

- [ ] **Step 3: 修改 src/filesystem/save.ts，将 getDir 改为 export**

找到文件末尾的 `async function getDir`，加上 `export`：

```typescript
export async function getDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  console.log('[feishu-clipper] getDirectoryHandle:', JSON.stringify(name))
  return parent.getDirectoryHandle(name, { create: true }).catch(e => {
    throw new Error(`无法创建目录 "${name}": ${e}`)
  })
}
```

- [ ] **Step 4: 创建 src/bookmark/export.ts**

```typescript
import type { BookmarkRecord } from '../storage/bookmarks'
import { getDir } from '../filesystem/save'

export function buildBookmarkEntry(record: BookmarkRecord): string {
  const tagsLine = record.tags.length > 0 ? record.tags.map(t => `#${t}`).join(' ') : ''
  const tagsSection = tagsLine ? `\n**标签:** ${tagsLine}` : ''
  return `## [${record.title}](${record.url})\n> ${record.summary}${tagsSection}\n\n---\n\n`
}

export function buildCategoryFrontmatter(category: string, date: string): string {
  return `---\ntags: [bookmarks, ${category}]\nupdated: ${date}\n---\n\n# ${category}\n\n`
}

export function extractExistingUrls(content: string): Set<string> {
  const pattern = /## \[.*?\]\((https?:\/\/[^)]+)\)/g
  const urls = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    urls.add(match[1])
  }
  return urls
}

export async function exportCategoriesToVault(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  records: BookmarkRecord[],
): Promise<void> {
  const dir = subDir.trim() || 'Bookmarks'
  const dirHandle = await getDir(vaultHandle, dir)
  const date = new Date().toISOString().slice(0, 10)

  const byCategory = new Map<string, BookmarkRecord[]>()
  for (const r of records) {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  }

  for (const [category, catRecords] of byCategory) {
    const filename = `${category}.md`
    let existingContent = ''
    let fileHandle: FileSystemFileHandle

    try {
      fileHandle = await dirHandle.getFileHandle(filename)
      existingContent = await (await fileHandle.getFile()).text()
    } catch {
      fileHandle = await dirHandle.getFileHandle(filename, { create: true })
    }

    const existingUrls = extractExistingUrls(existingContent)
    const newEntries = catRecords
      .filter(r => !existingUrls.has(r.url))
      .map(r => buildBookmarkEntry(r))
      .join('')

    if (!newEntries) continue

    const finalContent = existingContent
      ? existingContent.trimEnd() + '\n\n' + newEntries
      : buildCategoryFrontmatter(category, date) + newEntries

    const writable = await fileHandle.createWritable()
    await writable.write(finalContent)
    await writable.close()
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm vitest run tests/bookmark/export.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 6: 运行全部测试确认无回归**

```bash
pnpm vitest run
```

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/bookmark/export.ts src/filesystem/save.ts tests/bookmark/export.test.ts
git commit -m "feat: add bookmark Obsidian export logic"
```

---

## Task 7: Background Worker

**Files:**
- Modify: `entrypoints/background.ts`

（background.ts 中所有逻辑依赖 chrome API，不写单元测试；逻辑已在纯函数模块中测试覆盖。）

- [ ] **Step 1: 完整替换 entrypoints/background.ts**

```typescript
import { browser } from 'wxt/browser'
import { getSettings } from '../src/storage/settings'
import { getProcessedIds, saveBookmarkRecord } from '../src/storage/bookmarks'
import type { ProcessingStatus } from '../src/storage/bookmarks'
import { deduplicateByUrl, isDeadLink } from '../src/bookmark/duplicates'
import { processBookmark } from '../src/bookmark/process'
import { createAIProvider } from '../src/ai/index'

const ALARM_NAME = 'qiushui-bookmark-processor'
const STATUS_KEY = 'bookmark-processing-status'

function findBookmarkFolder(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  title: string,
): chrome.bookmarks.BookmarkTreeNode | null {
  for (const node of nodes) {
    if (!node.url && node.title === title) return node
    if (node.children) {
      const found = findBookmarkFolder(node.children, title)
      if (found) return found
    }
  }
  return null
}

function getAllLeafBookmarks(
  node: chrome.bookmarks.BookmarkTreeNode,
): chrome.bookmarks.BookmarkTreeNode[] {
  if (node.url) return [node]
  return (node.children ?? []).flatMap(getAllLeafBookmarks)
}

async function findOrCreateFolder(parentId: string, title: string): Promise<string> {
  const children = await chrome.bookmarks.getChildren(parentId)
  const existing = children.find(c => !c.url && c.title === title)
  if (existing) return existing.id
  const created = await chrome.bookmarks.create({ parentId, title })
  return created.id
}

async function getStatus(): Promise<ProcessingStatus> {
  const result = await browser.storage.local.get(STATUS_KEY)
  return (result[STATUS_KEY] as ProcessingStatus) ?? {
    state: 'idle',
    total: 0,
    processed: 0,
    duplicatesRemoved: 0,
    deadLinksRemoved: 0,
    lastRunAt: null,
  }
}

async function updateStatus(patch: Partial<ProcessingStatus>): Promise<void> {
  const current = await getStatus()
  await browser.storage.local.set({ [STATUS_KEY]: { ...current, ...patch } })
}

function extractPageText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const html = await res.text()
    return extractPageText(html)
  } catch {
    return ''
  }
}

async function runProcessing(): Promise<void> {
  const current = await getStatus()
  if (current.state === 'running') return

  await updateStatus({ state: 'running', processed: 0, total: 0, duplicatesRemoved: 0, deadLinksRemoved: 0, error: undefined })

  try {
    const settings = await getSettings()
    const tree = await chrome.bookmarks.getTree()
    const inboxFolder = findBookmarkFolder(tree, settings.bookmarkInboxFolder)

    if (!inboxFolder) {
      await updateStatus({ state: 'done', lastRunAt: Date.now() })
      return
    }

    const allBookmarks = getAllLeafBookmarks(inboxFolder)
    if (allBookmarks.length === 0) {
      await updateStatus({ state: 'done', lastRunAt: Date.now() })
      return
    }

    // 去重
    const { keep, remove: dupes } = deduplicateByUrl(allBookmarks)
    for (const bm of dupes) await chrome.bookmarks.remove(bm.id)

    // 死链检测
    const alive: chrome.bookmarks.BookmarkTreeNode[] = []
    let deadCount = 0
    for (const bm of keep) {
      if (!bm.url) continue
      if (await isDeadLink(bm.url)) {
        await chrome.bookmarks.remove(bm.id)
        deadCount++
      } else {
        alive.push(bm)
      }
    }

    await updateStatus({
      total: alive.length,
      duplicatesRemoved: dupes.length,
      deadLinksRemoved: deadCount,
    })

    // AI 处理（跳过已处理）
    const processedIds = await getProcessedIds()
    const toProcess = alive.filter(bm => !processedIds.has(bm.id))
    const aiProvider = createAIProvider(settings.aiConfig)
    const inboxParentId = inboxFolder.parentId ?? '1'

    let processedCount = 0
    for (const bm of toProcess) {
      try {
        const pageText = await fetchPageText(bm.url!)
        const result = await processBookmark(bm.title, bm.url!, pageText, aiProvider)

        await saveBookmarkRecord({
          id: bm.id,
          url: bm.url!,
          title: bm.title,
          summary: result.summary,
          tags: result.tags,
          category: result.category,
          processedAt: Date.now(),
        })

        const categoryFolderId = await findOrCreateFolder(inboxParentId, result.category)
        await chrome.bookmarks.move(bm.id, { parentId: categoryFolderId })

        processedCount++
        await updateStatus({ processed: processedCount })
      } catch {
        // 保留在 inbox，下次重试
      }
    }

    await updateStatus({ state: 'done', lastRunAt: Date.now() })
  } catch (err) {
    await updateStatus({
      state: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings()
    await browser.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.processInterval * 60,
    })
    await runProcessing()
  })

  browser.runtime.onStartup.addListener(async () => {
    const settings = await getSettings()
    const existing = await browser.alarms.get(ALARM_NAME)
    if (!existing) {
      await browser.alarms.create(ALARM_NAME, {
        periodInMinutes: settings.processInterval * 60,
      })
    }
    await runProcessing()
  })

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) await runProcessing()
  })

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type: string }

    if (msg.type === 'PROCESS_BOOKMARKS') {
      runProcessing()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err) }))
      return true
    }

    if (msg.type === 'GET_PROCESSING_STATUS') {
      getStatus()
        .then(status => sendResponse({ ok: true, status }))
        .catch(err => sendResponse({ ok: false, error: String(err) }))
      return true
    }
  })
})
```

- [ ] **Step 2: 运行类型检查**

```bash
pnpm compile
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: implement background worker for bookmark processing"
```

---

## Task 8: 权限配置

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: 更新 wxt.config.ts**

```typescript
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'qiushui Web Clipper',
    description: '秋水 · 网页剪藏 — 将飞书文档一键保存为 Obsidian Markdown 笔记',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting', 'bookmarks', 'alarms'],
    host_permissions: [
      '*://*.feishu.cn/*',
      '*://*.kdocs.cn/*',
      'https://*.aliyuncs.com/*',
      '<all_urls>',
    ],
  },
})
```

- [ ] **Step 2: 构建确认无报错**

```bash
pnpm build
```

Expected: 成功生成 `.output/chrome-mv3/`

- [ ] **Step 3: Commit**

```bash
git add wxt.config.ts
git commit -m "feat: add bookmarks and alarms permissions"
```

---

## Task 9: Bookmarks 专属页面

**Files:**
- Create: `entrypoints/bookmarks/index.html`
- Create: `entrypoints/bookmarks/main.ts`
- Create: `entrypoints/bookmarks/App.vue`

- [ ] **Step 1: 创建 entrypoints/bookmarks/index.html**

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>秋水 · 书签整理</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 创建 entrypoints/bookmarks/main.ts**

```typescript
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

- [ ] **Step 3: 创建 entrypoints/bookmarks/App.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { browser } from 'wxt/browser'
import { getAllBookmarkRecords } from '../../src/storage/bookmarks'
import { exportCategoriesToVault } from '../../src/bookmark/export'
import { getVaultHandle } from '../../src/storage/vault'
import type { ProcessingStatus } from '../../src/storage/bookmarks'

const status = ref<ProcessingStatus>({
  state: 'idle',
  total: 0,
  processed: 0,
  duplicatesRemoved: 0,
  deadLinksRemoved: 0,
  lastRunAt: null,
})
const isTriggering = ref(false)
const isExporting = ref(false)
const exportResult = ref<string | null>(null)
const exportError = ref<string | null>(null)

async function refreshStatus() {
  const res = await browser.runtime.sendMessage({ type: 'GET_PROCESSING_STATUS' }) as
    | { ok: true; status: ProcessingStatus }
    | { ok: false; error: string }
  if (res.ok) status.value = res.status
}

onMounted(refreshStatus)

async function triggerProcessing() {
  isTriggering.value = true
  exportResult.value = null
  exportError.value = null
  await browser.runtime.sendMessage({ type: 'PROCESS_BOOKMARKS' })
  await refreshStatus()
  isTriggering.value = false
}

async function handleExport() {
  isExporting.value = true
  exportResult.value = null
  exportError.value = null
  try {
    const vaultHandle = await getVaultHandle()
    if (!vaultHandle) {
      exportError.value = '请先在设置中配置 Obsidian Vault 目录'
      return
    }
    const { getSettings } = await import('../../src/storage/settings')
    const settings = await getSettings()
    const records = await getAllBookmarkRecords()
    if (records.length === 0) {
      exportResult.value = '暂无已处理书签可导出'
      return
    }
    await exportCategoriesToVault(vaultHandle, settings.bookmarkSubDir, records)
    exportResult.value = `已导出 ${records.length} 条书签到 Obsidian`
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : String(e)
  } finally {
    isExporting.value = false
  }
}

function formatDate(ts: number | null): string {
  if (!ts) return '从未'
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<template>
  <main class="page">
    <h1 class="title">秋水 · 书签整理</h1>

    <section class="card">
      <div class="status-row">
        <span class="label">状态</span>
        <span :class="['badge', status.state]">{{ { idle: '空闲', running: '处理中', done: '完成', error: '错误' }[status.state] }}</span>
      </div>

      <div v-if="status.state === 'running'" class="progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: status.total ? `${(status.processed / status.total) * 100}%` : '0%' }" />
        </div>
        <span class="progress-text">{{ status.processed }} / {{ status.total }}</span>
      </div>

      <div v-if="status.duplicatesRemoved > 0" class="stat">✓ 去重：删除 {{ status.duplicatesRemoved }} 条重复</div>
      <div v-if="status.deadLinksRemoved > 0" class="stat">✓ 死链：删除 {{ status.deadLinksRemoved }} 条失效</div>
      <div v-if="status.error" class="error-msg">✗ {{ status.error }}</div>

      <div class="last-run">上次整理：{{ formatDate(status.lastRunAt) }}</div>
    </section>

    <div class="actions">
      <button class="btn-primary" :disabled="isTriggering || status.state === 'running'" @click="triggerProcessing">
        {{ isTriggering ? '触发中…' : '立即整理' }}
      </button>
      <button class="btn-secondary" :disabled="isExporting" @click="handleExport">
        {{ isExporting ? '导出中…' : '导出到 Obsidian' }}
      </button>
    </div>

    <p v-if="exportResult" class="success">✓ {{ exportResult }}</p>
    <p v-if="exportError" class="error-msg">✗ {{ exportError }}</p>
  </main>
</template>

<style scoped>
.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #222;
}
.title { margin: 0 0 24px; font-size: 20px; font-weight: 600; }
.card {
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
  margin-bottom: 20px;
}
.status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.label { color: #555; font-size: 13px; }
.badge { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
.badge.idle { background: #f0f0f0; color: #666; }
.badge.running { background: #e8f0fe; color: #1a73e8; }
.badge.done { background: #e6f4ea; color: #2e7d32; }
.badge.error { background: #fce8e6; color: #c62828; }
.progress { margin-bottom: 12px; }
.progress-bar { height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
.progress-fill { height: 100%; background: #6e4dc4; transition: width 0.3s; }
.progress-text { font-size: 12px; color: #666; }
.stat { font-size: 13px; color: #2e7d32; margin-bottom: 4px; }
.last-run { font-size: 12px; color: #888; margin-top: 12px; }
.actions { display: flex; gap: 10px; margin-bottom: 12px; }
.btn-primary {
  flex: 1; padding: 10px; background: #6e4dc4; color: #fff;
  border: none; border-radius: 6px; font-size: 14px; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary {
  flex: 1; padding: 10px; background: #f5f5f5; color: #222;
  border: 1px solid #ccc; border-radius: 6px; font-size: 14px; cursor: pointer;
}
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
.success { color: #2e7d32; font-size: 13px; margin: 0; }
.error-msg { color: #c62828; font-size: 13px; margin: 0; }
</style>
```

- [ ] **Step 4: 构建确认新页面正常生成**

```bash
pnpm build
```

Expected: `.output/chrome-mv3/bookmarks.html` 存在

- [ ] **Step 5: Commit**

```bash
git add entrypoints/bookmarks/
git commit -m "feat: add bookmarks page UI"
```

---

## Task 10: Popup 入口按钮

**Files:**
- Modify: `entrypoints/popup/App.vue`

- [ ] **Step 1: 在 Popup 的 `openSettings` 函数下方添加 openBookmarks 函数**

在 `entrypoints/popup/App.vue` 的 `<script setup>` 中，`openSettings` 函数之后添加：

```typescript
function openBookmarks() {
  browser.tabs.create({ url: browser.runtime.getURL('/bookmarks.html') })
}
```

- [ ] **Step 2: 在 template 中添加"整理书签"按钮**

在 `.btn-gear` 按钮之后插入：

```html
<button class="btn-bookmark" title="整理书签" @click="openBookmarks">⊞</button>
```

在 `<style scoped>` 中添加样式（紧跟 `.btn-gear` 之后）：

```css
.btn-bookmark { background: none; border: none; cursor: pointer; font-size: 16px; color: #888;
  padding: 0 2px; line-height: 1; flex-shrink: 0; }
.btn-bookmark:hover { color: #444; }
```

- [ ] **Step 3: 构建并手动验证**

```bash
pnpm build
```

在 Chrome 中加载扩展，打开 Popup，确认按钮存在。

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/App.vue
git commit -m "feat: add bookmark organizer entry button in popup"
```

---

## Task 11: Options 页面 — AI 配置 + 书签设置

**Files:**
- Modify: `entrypoints/options/App.vue`

- [ ] **Step 1: 在 `<script setup>` 中添加 showAISecret ref**

在 `showSecret` 的声明之后添加：

```typescript
const showAISecret = ref(false)
```

- [ ] **Step 2: 在 template 末尾的 `</main>` 之前添加两个新 section**

在最后的 `<footer>` 之前，`</main>` 之前插入：

```html
<section class="section">
  <h2 class="section-title">AI 配置</h2>

  <div class="field">
    <label class="label" for="ai-base-url">API 地址</label>
    <input
      id="ai-base-url"
      v-model="settings.aiConfig.baseUrl"
      class="input"
      placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
    />
    <p class="hint">支持任意 OpenAI 兼容接口，默认为阿里云通义千问。</p>
  </div>

  <div class="field">
    <label class="label" for="ai-api-key">API Key</label>
    <div class="secret-row">
      <input
        id="ai-api-key"
        v-model="settings.aiConfig.apiKey"
        :type="showAISecret ? 'text' : 'password'"
        class="input"
        autocomplete="off"
      />
      <button class="btn-secondary" type="button" @click="showAISecret = !showAISecret">
        {{ showAISecret ? '隐藏' : '显示' }}
      </button>
    </div>
  </div>

  <div class="field">
    <label class="label" for="ai-model">模型</label>
    <input
      id="ai-model"
      v-model="settings.aiConfig.model"
      class="input"
      placeholder="qwen-long"
    />
  </div>
</section>

<section class="section">
  <h2 class="section-title">书签整理</h2>

  <div class="field">
    <label class="label" for="bookmark-inbox">待整理文件夹名称</label>
    <input
      id="bookmark-inbox"
      v-model="settings.bookmarkInboxFolder"
      class="input"
      placeholder="待整理"
    />
    <p class="hint">将书签收藏到该文件夹后，插件会自动整理其中的内容。</p>
  </div>

  <div class="field">
    <label class="label" for="process-interval">自动整理间隔（小时）</label>
    <input
      id="process-interval"
      v-model.number="settings.processInterval"
      class="input"
      type="number"
      min="1"
      max="168"
    />
  </div>

  <div class="field">
    <label class="label" for="bookmark-sub-dir">Obsidian 书签子目录</label>
    <input
      id="bookmark-sub-dir"
      v-model="settings.bookmarkSubDir"
      class="input"
      placeholder="Bookmarks"
    />
    <p class="hint">整理后的书签笔记将保存到 Vault 下的此子目录中。</p>
  </div>
</section>
```

- [ ] **Step 3: 构建并手动验证**

```bash
pnpm build
```

在 Chrome 中打开扩展设置页，确认 "AI 配置" 和 "书签整理" 区块正常显示，字段可填写，保存成功。

- [ ] **Step 4: 运行全部测试**

```bash
pnpm vitest run
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/App.vue
git commit -m "feat: add AI config and bookmark settings to options page"
```

---

## 验收标准

1. `pnpm vitest run` 全部通过
2. `pnpm build` 无报错，`.output/chrome-mv3/bookmarks.html` 存在
3. Popup 显示"整理书签"按钮，点击打开专属页面
4. 设置页显示 AI 配置和书签整理配置，保存后生效
5. 首次安装时自动触发处理；alarm 按 `processInterval` 定时触发
6. 处理完成后书签从"待整理"移入对应分类文件夹
7. 点击"导出到 Obsidian"后对应分类 `.md` 文件写入 Vault，重复运行不产生重复条目
