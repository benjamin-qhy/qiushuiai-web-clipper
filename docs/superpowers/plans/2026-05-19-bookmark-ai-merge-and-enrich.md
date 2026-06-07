# Bookmark AI Merge & Enrich Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two AI calls (classify + rename title) into one call that also returns summary and tags, save results to IndexedDB, show enriched data in BookmarkList, reverse log order, add processing animation, and fix settings icon size.

**Architecture:** Single AI call returns `{"folder":"...","title":"...","summary":"...","tags":["..."]}`. Results saved to IndexedDB via `saveBookmarkRecord`. `useBookmarkTree` exposes a `recordsMap` so `BookmarkList` can render enriched data for already-processed bookmarks.

**Tech Stack:** Vue 3, TypeScript, WXT, Vitest, browser.bookmarks API, IndexedDB

---

### Task 1: Merge AI calls in `classify.ts`

Replace the two separate AI functions (`classifyAndMove` + `renameBookmark`) with a single `processBookmark` function. Keep the pure helper functions that are tested separately, but replace the prompt builders and parsers.

**Files:**
- Modify: `src/bookmark/classify.ts`
- Modify: `tests/bookmark/classify.test.ts`

- [ ] **Step 1: Update `classify.ts` — replace prompt builders and parsers**

Replace `buildClassifyPrompt`, `buildTitlePrompt`, `parseFolder`, `parseTitle`, `classifyAndMove`, `renameBookmark` with the following. Keep `buildFolderPaths` and `buildFolderPathMap` unchanged.

```ts
import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import type { AIProvider } from '../ai/types'
import type { PageMeta } from './meta'

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode

export function buildFolderPaths(nodes: BookmarkNode[], prefix = ''): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.url) continue
    const path = prefix ? `${prefix}/${node.title}` : node.title
    paths.push(path)
    if (node.children?.length) paths.push(...buildFolderPaths(node.children, path))
  }
  return paths
}

export function buildFolderPathMap(nodes: BookmarkNode[], prefix = ''): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of nodes) {
    if (node.url) continue
    const path = prefix ? `${prefix}/${node.title}` : node.title
    map.set(path, node.id)
    if (node.children?.length) {
      for (const [p, id] of buildFolderPathMap(node.children, path)) map.set(p, id)
    }
  }
  return map
}

export interface ProcessResult {
  folder: string
  title: string
  summary: string
  tags: string[]
}

export function buildProcessPrompt(
  meta: PageMeta,
  url: string,
  folderPaths: string[],
  userSystemPrompt: string,
): { system: string; user: string } {
  const system = `${userSystemPrompt}

可用的书签文件夹：
${folderPaths.join('\n')}

输出格式（仅输出 JSON，不要其他内容）：
{"folder":"文件夹路径","title":"网站名 - 简短描述","summary":"2-3句描述这个网页的内容和用途","tags":["标签1","标签2"]}`

  const user = `标题：${meta.title}
URL：${url}
关键词：${meta.keywords}
描述：${meta.description}`

  return { system, user }
}

export function parseProcessResult(raw: string, fallbackTitle: string): ProcessResult {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const folder = typeof parsed.folder === 'string' ? parsed.folder.trim() : ''
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    const tags = Array.isArray(parsed.tags)
      ? (parsed.tags as unknown[]).filter(t => typeof t === 'string').map(t => (t as string).trim())
      : []
    return {
      folder: folder || '其他',
      title: title || fallbackTitle,
      summary,
      tags,
    }
  } catch {
    return { folder: '其他', title: fallbackTitle, summary: '', tags: [] }
  }
}

async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const children = await browser.bookmarks.getChildren(parentId)
  const existing = children.find(c => !c.url && c.title === name)
  if (existing) return existing.id
  const created = await browser.bookmarks.create({ parentId, title: name })
  return created.id
}

export async function processBookmark(
  bookmarkId: string,
  meta: PageMeta,
  url: string,
  originalTitle: string,
  inboxParentId: string,
  userSystemPrompt: string,
  aiProvider: AIProvider,
): Promise<{ folderPath: string; title: string; summary: string; tags: string[] }> {
  const tree = await browser.bookmarks.getTree()
  const rootChildren = tree[0]?.children ?? []
  const folderPaths = buildFolderPaths(rootChildren)
  const pathMap = buildFolderPathMap(rootChildren)

  const { system, user } = buildProcessPrompt(meta, url, folderPaths, userSystemPrompt)
  const raw = await aiProvider.complete(user, system)
  const result = parseProcessResult(raw, originalTitle)

  const resolvedPath = pathMap.has(result.folder) ? result.folder : '其他'
  const targetFolderId = pathMap.get(result.folder)
    ?? await findOrCreateFolder(inboxParentId, '其他')

  await browser.bookmarks.move(bookmarkId, { parentId: targetFolderId })
  await browser.bookmarks.update(bookmarkId, { title: result.title })

  return {
    folderPath: resolvedPath,
    title: result.title,
    summary: result.summary,
    tags: result.tags,
  }
}
```

- [ ] **Step 2: Update `tests/bookmark/classify.test.ts`**

Replace tests for removed functions with tests for new functions. Keep `buildFolderPaths` and `buildFolderPathMap` tests unchanged.

```ts
import { describe, it, expect } from 'vitest'
import {
  buildFolderPaths,
  buildFolderPathMap,
  buildProcessPrompt,
  parseProcessResult,
} from '../../src/bookmark/classify'
import type { PageMeta } from '../../src/bookmark/meta'

const makeNode = (id: string, title: string, parentId: string, children: object[] = []) => ({
  id, title, parentId, index: 0, dateAdded: 0, children,
})

const sampleTree = [
  makeNode('1', '书签栏', '0', [
    makeNode('2', '工作', '1', [
      makeNode('3', '前端', '2', []),
    ]),
    makeNode('4', '学习', '1', []),
    { id: '5', title: 'React 官网', url: 'https://react.dev', parentId: '1', index: 2, dateAdded: 0 },
  ]),
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tree = sampleTree as any

describe('buildFolderPaths', () => {
  it('returns flat list of folder paths', () => {
    const paths = buildFolderPaths(tree)
    expect(paths).toContain('书签栏')
    expect(paths).toContain('书签栏/工作')
    expect(paths).toContain('书签栏/工作/前端')
    expect(paths).toContain('书签栏/学习')
  })

  it('skips bookmark nodes (nodes with url)', () => {
    const paths = buildFolderPaths(tree)
    expect(paths).not.toContain('书签栏/React 官网')
  })
})

describe('buildFolderPathMap', () => {
  it('maps path to folder id', () => {
    const map = buildFolderPathMap(tree)
    expect(map.get('书签栏/工作/前端')).toBe('3')
    expect(map.get('书签栏/学习')).toBe('4')
  })

  it('does not include bookmark nodes', () => {
    const map = buildFolderPathMap(tree)
    expect(map.has('书签栏/React 官网')).toBe(false)
  })
})

describe('buildProcessPrompt', () => {
  const meta: PageMeta = { title: 'React', keywords: 'frontend,hooks', description: 'A JS library' }

  it('puts user system prompt and folder list in system part', () => {
    const { system } = buildProcessPrompt(meta, 'https://react.dev', ['书签栏/前端'], '自定义指令')
    expect(system).toContain('自定义指令')
    expect(system).toContain('书签栏/前端')
    expect(system).toContain('"folder"')
    expect(system).toContain('"title"')
    expect(system).toContain('"summary"')
    expect(system).toContain('"tags"')
  })

  it('puts meta info in user part', () => {
    const { user } = buildProcessPrompt(meta, 'https://react.dev', [], '指令')
    expect(user).toContain('React')
    expect(user).toContain('https://react.dev')
    expect(user).toContain('frontend,hooks')
  })
})

describe('parseProcessResult', () => {
  it('parses all fields from valid JSON', () => {
    const raw = JSON.stringify({
      folder: '书签栏/工作/前端',
      title: 'React - 前端框架',
      summary: '这是一个用于构建用户界面的 JavaScript 库。',
      tags: ['前端', 'React'],
    })
    const result = parseProcessResult(raw, '原标题')
    expect(result.folder).toBe('书签栏/工作/前端')
    expect(result.title).toBe('React - 前端框架')
    expect(result.summary).toBe('这是一个用于构建用户界面的 JavaScript 库。')
    expect(result.tags).toEqual(['前端', 'React'])
  })

  it('falls back to 其他 and fallbackTitle on invalid JSON', () => {
    const result = parseProcessResult('not json', '原标题')
    expect(result.folder).toBe('其他')
    expect(result.title).toBe('原标题')
    expect(result.summary).toBe('')
    expect(result.tags).toEqual([])
  })

  it('falls back to 其他 when folder is empty string', () => {
    const result = parseProcessResult('{"folder":"","title":"T","summary":"S","tags":[]}', '原')
    expect(result.folder).toBe('其他')
  })

  it('falls back to fallbackTitle when title is empty', () => {
    const result = parseProcessResult('{"folder":"F","title":"","summary":"S","tags":[]}', '原标题')
    expect(result.title).toBe('原标题')
  })

  it('filters non-string values from tags array', () => {
    const raw = JSON.stringify({ folder: 'F', title: 'T', summary: 'S', tags: ['a', 1, null, 'b'] })
    const result = parseProcessResult(raw, '原')
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('returns empty tags when tags field is missing', () => {
    const raw = JSON.stringify({ folder: 'F', title: 'T', summary: 'S' })
    const result = parseProcessResult(raw, '原')
    expect(result.tags).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify**

```bash
pnpm vitest run tests/bookmark/classify.test.ts
```

Expected: all tests pass

- [ ] **Step 4: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/bookmark/classify.ts tests/bookmark/classify.test.ts
git commit -m "refactor: merge AI classify+title+summary+tags into single processBookmark call"
```

---

### Task 2: Update `useBookmarkProcess.ts`

Switch from two separate AI calls to the new `processBookmark`, save each result to IndexedDB, and display log in reverse order (newest on top).

**Files:**
- Modify: `src/composables/useBookmarkProcess.ts`

- [ ] **Step 1: Rewrite `useBookmarkProcess.ts`**

```ts
import { ref } from 'vue'
import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import { getSettings } from '../storage/settings'
import { createAIProvider } from '../ai/index'
import { fetchPageMeta } from '../bookmark/meta'
import type { PageMeta } from '../bookmark/meta'
import { processBookmark } from '../bookmark/classify'
import { saveBookmarkRecord } from '../storage/bookmarks'

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode

export interface LogEntry {
  time: string
  title: string
  url: string
  folder: string
  status: 'ok' | 'warning' | 'error'
  warning?: string
  error?: string
}

export interface CurrentItem {
  index: number
  total: number
  url: string
  phase: string
}

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function useBookmarkProcess() {
  const state = ref<'idle' | 'processing' | 'done' | 'error'>('idle')
  const log = ref<LogEntry[]>([])
  const progress = ref({ done: 0, total: 0 })
  const currentItem = ref<CurrentItem | null>(null)

  async function start(): Promise<void> {
    if (state.value === 'processing') return

    state.value = 'processing'
    log.value = []
    progress.value = { done: 0, total: 0 }
    currentItem.value = null

    try {
      const settings = await getSettings()
      const inboxName = settings.bookmarkInboxFolder

      const results = await browser.bookmarks.search({ title: inboxName })
      const inboxFolder = results.find((r: BookmarkNode) => !r.url)
      if (!inboxFolder || !inboxFolder.parentId) {
        state.value = 'error'
        log.value.unshift({
          time: nowTime(),
          title: '未找到收件箱文件夹',
          url: '',
          folder: '',
          status: 'error',
          error: `未找到「${inboxName}」文件夹，请在书签中创建一个`,
        })
        return
      }

      const children = await browser.bookmarks.getChildren(inboxFolder.id)
      const bookmarks = children.filter((c: BookmarkNode) => !!c.url)
      progress.value.total = bookmarks.length

      if (bookmarks.length === 0) {
        state.value = 'done'
        return
      }

      const aiProvider = createAIProvider(settings.aiConfig)

      for (let i = 0; i < bookmarks.length; i++) {
        const bm = bookmarks[i]
        if (!bm.url) continue

        currentItem.value = { index: i + 1, total: bookmarks.length, url: bm.url, phase: '正在获取页面信息…' }

        let meta: PageMeta
        let metaWarning: string | undefined

        try {
          meta = await fetchPageMeta(bm.url)
          if (!meta.title) meta = { title: bm.title ?? '', keywords: '', description: '' }
        } catch {
          meta = { title: bm.title ?? '', keywords: '', description: '' }
          metaWarning = '页面获取失败，已用书签标题兜底'
        }

        try {
          currentItem.value = { ...currentItem.value, phase: 'AI 整理中…' }
          const { folderPath, title, summary, tags } = await processBookmark(
            bm.id,
            meta,
            bm.url,
            bm.title ?? '',
            inboxFolder.parentId!,
            settings.bookmarkSystemPrompt,
            aiProvider,
          )

          await saveBookmarkRecord({
            id: bm.id,
            url: bm.url,
            title,
            summary,
            tags,
            category: folderPath,
            processedAt: Date.now(),
          })

          log.value.unshift({
            time: nowTime(),
            title,
            url: bm.url,
            folder: folderPath,
            status: metaWarning ? 'warning' : 'ok',
            warning: metaWarning,
          })
        } catch (e) {
          log.value.unshift({
            time: nowTime(),
            title: bm.title || bm.url,
            url: bm.url,
            folder: '',
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          })
        }

        progress.value.done++
      }

      state.value = 'done'
      currentItem.value = null
    } catch (e) {
      state.value = 'error'
      log.value.unshift({
        time: nowTime(),
        title: '处理出错',
        url: '',
        folder: '',
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
      currentItem.value = null
    }
  }

  return { state, log, progress, currentItem, start }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/composables/useBookmarkProcess.ts
git commit -m "feat: use merged processBookmark, save to IndexedDB, reverse log order"
```

---

### Task 3: Expose `recordsMap` from `useBookmarkTree.ts`

Add a `recordsMap: ref<Map<string, BookmarkRecord>>` that is populated alongside `processedIds` in `loadTree()`. This lets components look up enriched data by bookmark ID.

**Files:**
- Modify: `src/composables/useBookmarkTree.ts`

- [ ] **Step 1: Update `useBookmarkTree.ts`**

Add `import type { BookmarkRecord } from '../storage/bookmarks'` to the import line (it already imports `getAllBookmarkRecords`).

Then add `recordsMap` ref and populate it in `loadTree`:

In the imports section, change:
```ts
import { getAllBookmarkRecords } from '../storage/bookmarks'
```
to:
```ts
import { getAllBookmarkRecords } from '../storage/bookmarks'
import type { BookmarkRecord } from '../storage/bookmarks'
```

Add the `recordsMap` ref after `processedIds`:
```ts
const recordsMap = ref<Map<string, BookmarkRecord>>(new Map())
```

In `loadTree()`, replace:
```ts
      const records = await getAllBookmarkRecords()
      processedIds.value = new Set(records.map(r => r.id))
```
with:
```ts
      const records = await getAllBookmarkRecords()
      processedIds.value = new Set(records.map(r => r.id))
      recordsMap.value = new Map(records.map(r => [r.id, r]))
```

Add `recordsMap` to the return object:
```ts
  return {
    folderTree,
    selectedFolderId,
    selectedBookmarks,
    processedIds,
    recordsMap,
    dragOverFolderId,
    error,
    loadTree,
    selectFolder,
    toggleExpand,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    deleteBookmark,
    moveBookmark,
  }
```

- [ ] **Step 2: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/composables/useBookmarkTree.ts
git commit -m "feat: expose recordsMap from useBookmarkTree for enriched bookmark display"
```

---

### Task 4: Update `BookmarkList.vue` to show enriched data

When a bookmark has an IndexedDB record, show its `category` (folder path), `summary`, and `tags` below the title/url row. The existing `processedIds` badge changes to reflect the enriched state.

**Files:**
- Modify: `entrypoints/bookmarks/components/BookmarkList.vue`

You'll need to look at how `BookmarkList.vue` is used in its parent component to understand how to pass the new `records` prop. Read `entrypoints/bookmarks/App.vue` first.

- [ ] **Step 1: Read the parent component**

Read `entrypoints/bookmarks/App.vue` to see how `BookmarkList` is used and how to thread `recordsMap` through.

- [ ] **Step 2: Update `BookmarkList.vue` props**

Add `records` prop (optional, `Map<string, BookmarkRecord>`). Import `BookmarkRecord` from storage.

Change the props definition from:
```ts
import type { BookmarkNode } from '../../../src/composables/useBookmarkTree'

const props = defineProps<{
  bookmarks: BookmarkNode[]
  processedIds: Set<string>
  folderTitle: string
}>()
```
to:
```ts
import type { BookmarkNode } from '../../../src/composables/useBookmarkTree'
import type { BookmarkRecord } from '../../../src/storage/bookmarks'

const props = defineProps<{
  bookmarks: BookmarkNode[]
  processedIds: Set<string>
  records?: Map<string, BookmarkRecord>
  folderTitle: string
}>()
```

- [ ] **Step 3: Update the bookmark item template**

Replace the bookmark item `<li>` template to show enriched data when available:

```html
<li
  v-for="bm in bookmarks"
  :key="bm.id"
  class="bookmark-item"
  draggable="true"
  @dragstart="onDragStart($event, bm.id)"
>
  <img
    :src="faviconUrl(bm.url || '')"
    class="favicon"
    @error="onFaviconError"
    width="16"
    height="16"
  />
  <div class="bm-content" @click="bm.url && emit('openBookmark', bm.url)">
    <span class="bm-title">{{ bm.title || bm.url }}</span>
    <span class="bm-url">{{ bm.url }}</span>
    <template v-if="records?.get(bm.id) as record">
      <span v-if="(records?.get(bm.id))?.category" class="bm-category">
        {{ (records?.get(bm.id))?.category }}
      </span>
      <span v-if="(records?.get(bm.id))?.summary" class="bm-summary">
        {{ (records?.get(bm.id))?.summary }}
      </span>
      <span v-if="(records?.get(bm.id))?.tags?.length" class="bm-tags">
        <span v-for="tag in (records?.get(bm.id))?.tags" :key="tag" class="bm-tag">{{ tag }}</span>
      </span>
    </template>
  </div>
  <span v-if="processedIds.has(bm.id)" class="badge-processed">已整理</span>
  <button class="delete-btn" title="删除" @click.stop="emit('deleteBookmark', bm.id)">✕</button>
</li>
```

Note: Vue doesn't support `v-if` with variable binding like that. Instead use computed or inline access. Use this simpler pattern:

```html
<li
  v-for="bm in bookmarks"
  :key="bm.id"
  class="bookmark-item"
  draggable="true"
  @dragstart="onDragStart($event, bm.id)"
>
  <img
    :src="faviconUrl(bm.url || '')"
    class="favicon"
    @error="onFaviconError"
    width="16"
    height="16"
  />
  <div class="bm-content" @click="bm.url && emit('openBookmark', bm.url)">
    <span class="bm-title">{{ bm.title || bm.url }}</span>
    <span class="bm-url">{{ bm.url }}</span>
    <span v-if="records?.get(bm.id)?.category" class="bm-category">
      {{ records?.get(bm.id)?.category }}
    </span>
    <span v-if="records?.get(bm.id)?.summary" class="bm-summary">
      {{ records?.get(bm.id)?.summary }}
    </span>
    <span v-if="records?.get(bm.id)?.tags?.length" class="bm-tags">
      <span v-for="tag in records?.get(bm.id)?.tags" :key="tag" class="bm-tag">{{ tag }}</span>
    </span>
  </div>
  <span v-if="processedIds.has(bm.id)" class="badge-processed">已整理</span>
  <button class="delete-btn" title="删除" @click.stop="emit('deleteBookmark', bm.id)">✕</button>
</li>
```

- [ ] **Step 4: Add CSS for enriched fields**

Add these styles after `.bm-url`:

```css
.bm-category {
  display: block;
  font-size: 12px;
  color: var(--color-accent);
  margin-top: 2px;
  font-weight: 500;
}
.bm-summary {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.bm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.bm-tag {
  font-size: 11px;
  padding: 1px 5px;
  background: var(--color-border-light);
  color: var(--color-text-secondary);
  border-radius: 2px;
}
```

- [ ] **Step 5: Update the parent component to pass `recordsMap`**

In `entrypoints/bookmarks/App.vue`, find where `<BookmarkList>` is used. Pass `:records="tree.recordsMap.value"` as an additional prop.

- [ ] **Step 6: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add entrypoints/bookmarks/components/BookmarkList.vue entrypoints/bookmarks/App.vue
git commit -m "feat: show category, summary, tags in BookmarkList for processed bookmarks"
```

---

### Task 5: AISidebar UI fixes — animation and icon size

Two small CSS-only changes: (1) pulse animation on the `.current-item` section while processing; (2) bigger settings gear icon.

**Files:**
- Modify: `entrypoints/bookmarks/components/AISidebar.vue`

- [ ] **Step 1: Increase `.btn-icon` font-size**

Change `.btn-icon` font-size from `14px` to `20px`:

```css
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  color: var(--color-text-muted);
  padding: 0 3px;
  line-height: 1;
}
```

- [ ] **Step 2: Add pulse animation to `.current-item`**

Add a `@keyframes` and apply it to `.current-item`:

```css
@keyframes pulse-border {
  0%, 100% { border-left-color: transparent; }
  50% { border-left-color: var(--color-accent); }
}

.current-item {
  padding: 8px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
  border-left: 3px solid transparent;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  animation: pulse-border 1.4s ease-in-out infinite;
}
```

- [ ] **Step 3: Type-check and build**

```bash
pnpm compile && pnpm build
```

Expected: no errors, `.output/chrome-mv3/` updated

- [ ] **Step 4: Commit**

```bash
git add entrypoints/bookmarks/components/AISidebar.vue
git commit -m "fix: increase settings icon size and add pulse animation to current-item"
```
