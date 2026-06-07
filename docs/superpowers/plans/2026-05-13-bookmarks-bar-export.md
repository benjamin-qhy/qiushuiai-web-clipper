# Bookmarks Bar Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two bookmarks page actions that export the browser bookmarks bar as one Markdown file or as Obsidian Markdown files split by top-level bookmarks-bar folders.

**Architecture:** Keep bookmark tree discovery and Markdown rendering in a focused `src/bookmark/bar-export.ts` module with unit tests. The bookmarks Vue page owns browser API calls, file download, Vault authorization, and user feedback, while `BookmarkList.vue` only renders buttons and emits actions.

**Tech Stack:** Vue 3 `<script setup>`, WXT browser bookmarks API, File System Access API, Vitest, TypeScript.

---

### Task 1: Bookmark Bar Export Formatter

**Files:**
- Create: `src/bookmark/bar-export.ts`
- Test: `tests/bookmark/bar-export.test.ts`

- [ ] **Step 1: Write failing tests for bookmark bar discovery and Markdown rendering**

Create `tests/bookmark/bar-export.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildBookmarksBarMarkdown,
  findBookmarksBarNode,
  sanitizeMarkdownFilename,
  splitBookmarksBarForObsidian,
} from '../../src/bookmark/bar-export'
import type { BookmarkNode } from '../../src/composables/useBookmarkTree'

const bookmarksBar: BookmarkNode = {
  id: '1',
  title: '书签栏',
  children: [
    { id: '10', parentId: '1', title: 'Root Link', url: 'https://root.example' },
    {
      id: '20',
      parentId: '1',
      title: '技术/工具',
      children: [
        { id: '21', parentId: '20', title: 'Vue [Docs]', url: 'https://vuejs.org' },
        {
          id: '22',
          parentId: '20',
          title: '子目录',
          children: [
            { id: '23', parentId: '22', title: '', url: 'https://empty-title.example' },
          ],
        },
      ],
    },
    {
      id: '30',
      parentId: '1',
      title: '资料',
      children: [
        { id: '31', parentId: '30', title: 'MDN', url: 'https://developer.mozilla.org' },
      ],
    },
  ],
}

describe('findBookmarksBarNode', () => {
  it('finds the chrome bookmark bar by id', () => {
    const root: BookmarkNode = { id: '0', title: '', children: [bookmarksBar] }
    expect(findBookmarksBarNode([root])?.id).toBe('1')
  })

  it('falls back to localized bookmark bar titles', () => {
    const localized: BookmarkNode = { ...bookmarksBar, id: 'toolbar_____', title: 'Bookmarks Bar' }
    const root: BookmarkNode = { id: '0', title: '', children: [localized] }
    expect(findBookmarksBarNode([root])?.id).toBe('toolbar_____')
  })
})

describe('buildBookmarksBarMarkdown', () => {
  it('renders one complete markdown document with nested folder headings', () => {
    const markdown = buildBookmarksBarMarkdown(bookmarksBar, '2026-05-13')
    expect(markdown).toContain('# 书签栏')
    expect(markdown).toContain('_导出时间：2026-05-13_')
    expect(markdown).toContain('- [Root Link](https://root.example)')
    expect(markdown).toContain('## 技术/工具')
    expect(markdown).toContain('- [Vue \\[Docs\\]](https://vuejs.org)')
    expect(markdown).toContain('### 子目录')
    expect(markdown).toContain('- [https://empty-title.example](https://empty-title.example)')
  })
})

describe('splitBookmarksBarForObsidian', () => {
  it('splits output by first-level bookmarks bar folders', () => {
    const files = splitBookmarksBarForObsidian(bookmarksBar, '2026-05-13')
    expect(files.map(f => f.filename)).toEqual(['书签栏.md', '技术_工具.md', '资料.md'])
    expect(files[0].content).toContain('- [Root Link](https://root.example)')
    expect(files[1].content).toContain('# 技术/工具')
    expect(files[1].content).toContain('## 子目录')
    expect(files[2].content).toContain('- [MDN](https://developer.mozilla.org)')
  })
})

describe('sanitizeMarkdownFilename', () => {
  it('removes characters unsafe for filenames', () => {
    expect(sanitizeMarkdownFilename('技术/工具:前端*资料')).toBe('技术_工具_前端_资料.md')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run tests/bookmark/bar-export.test.ts
```

Expected: FAIL because `src/bookmark/bar-export.ts` does not exist.

- [ ] **Step 3: Implement the export formatter module**

Create `src/bookmark/bar-export.ts` with:

```ts
import { getDir } from '../filesystem/save'
import type { BookmarkNode } from '../composables/useBookmarkTree'

export interface ObsidianBookmarkExportFile {
  filename: string
  content: string
}

const BOOKMARKS_BAR_TITLES = new Set(['书签栏', 'Bookmarks Bar'])

function isFolder(node: BookmarkNode): boolean {
  return !node.url
}

function childrenOf(node: BookmarkNode): BookmarkNode[] {
  return node.children ?? []
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\s+/g, ' ').trim()
}

function renderBookmark(node: BookmarkNode): string {
  const url = node.url ?? ''
  const title = escapeMarkdownLinkText(node.title || url)
  return `- [${title}](${url})`
}

function renderNodes(nodes: BookmarkNode[], headingLevel: number): string[] {
  const lines: string[] = []
  for (const node of nodes) {
    if (node.url) {
      lines.push(renderBookmark(node))
      continue
    }

    const title = node.title.trim() || '未命名文件夹'
    lines.push('', `${'#'.repeat(Math.min(headingLevel, 6))} ${title}`, '')
    lines.push(...renderNodes(childrenOf(node), headingLevel + 1))
  }
  return lines
}

export function findBookmarksBarNode(roots: BookmarkNode[]): BookmarkNode | null {
  const root = roots[0]
  const candidates = root?.children ?? roots
  return candidates.find(node => node.id === '1' && isFolder(node))
    ?? candidates.find(node => isFolder(node) && BOOKMARKS_BAR_TITLES.has(node.title))
    ?? null
}

export function buildBookmarksBarMarkdown(bookmarksBar: BookmarkNode, date: string): string {
  const lines = [
    '# 书签栏',
    '',
    `_导出时间：${date}_`,
    '',
    ...renderNodes(childrenOf(bookmarksBar), 2),
  ]
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

export function sanitizeMarkdownFilename(title: string): string {
  const basename = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\\.+$/, '')
    || '未命名'
  return `${basename}.md`
}

export function splitBookmarksBarForObsidian(bookmarksBar: BookmarkNode, date: string): ObsidianBookmarkExportFile[] {
  const files: ObsidianBookmarkExportFile[] = []
  const rootBookmarks = childrenOf(bookmarksBar).filter(node => !!node.url)
  if (rootBookmarks.length > 0) {
    files.push({
      filename: '书签栏.md',
      content: [
        '# 书签栏',
        '',
        `_导出时间：${date}_`,
        '',
        ...renderNodes(rootBookmarks, 2),
      ].join('\n').trimEnd() + '\n',
    })
  }

  for (const node of childrenOf(bookmarksBar)) {
    if (!isFolder(node)) continue
    files.push({
      filename: sanitizeMarkdownFilename(node.title),
      content: [
        `# ${node.title.trim() || '未命名文件夹'}`,
        '',
        `_导出时间：${date}_`,
        '',
        ...renderNodes(childrenOf(node), 2),
      ].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
    })
  }
  return files
}

export async function exportBookmarksBarToObsidian(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  files: ObsidianBookmarkExportFile[],
): Promise<void> {
  const dirHandle = await getDir(vaultHandle, subDir.trim() || 'Bookmarks')
  for (const file of files) {
    const fileHandle = await dirHandle.getFileHandle(file.filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(file.content)
    await writable.close()
  }
}
```

- [ ] **Step 4: Run formatter tests**

Run:

```bash
pnpm vitest run tests/bookmark/bar-export.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit formatter work**

Run:

```bash
git add src/bookmark/bar-export.ts tests/bookmark/bar-export.test.ts
git commit -m "feat: add bookmarks bar export formatter"
```

### Task 2: Bookmarks Page Export Actions

**Files:**
- Modify: `entrypoints/bookmarks/components/BookmarkList.vue`
- Modify: `entrypoints/bookmarks/App.vue`

- [ ] **Step 1: Add export button events to BookmarkList**

Modify `entrypoints/bookmarks/components/BookmarkList.vue` so props and emits include export state:

```ts
const props = defineProps<{
  bookmarks: BookmarkNode[]
  processedIds: Set<string>
  folderTitle: string
  isExporting?: boolean
}>()

const emit = defineEmits<{
  deleteBookmark: [id: string]
  openBookmark: [url: string]
  exportMarkdown: []
  exportObsidian: []
}>()
```

Update the header template:

```vue
<div class="list-header">
  <h2 class="folder-title">{{ folderTitle || '请选择文件夹' }}</h2>
  <span class="count" v-if="bookmarks.length > 0">{{ bookmarks.length }} 条</span>
  <div class="export-actions">
    <button class="export-btn" :disabled="props.isExporting" @click="emit('exportMarkdown')">
      {{ props.isExporting ? '导出中...' : '导出书签栏 MD' }}
    </button>
    <button class="export-btn" :disabled="props.isExporting" @click="emit('exportObsidian')">
      导出到 Obsidian
    </button>
  </div>
</div>
```

Add scoped CSS:

```css
.export-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.export-btn {
  border: 1px solid #d7d0ea;
  background: #fff;
  color: #5f3db5;
  border-radius: 4px;
  padding: 5px 9px;
  font-size: 12px;
  cursor: pointer;
}
.export-btn:hover:not(:disabled) { background: #f6f2ff; border-color: #bca9ef; }
.export-btn:disabled { cursor: not-allowed; color: #aaa; border-color: #ddd; background: #f7f7f7; }
```

- [ ] **Step 2: Wire App.vue export handlers**

Modify `entrypoints/bookmarks/App.vue` imports:

```ts
import { onMounted, computed, ref } from 'vue'
import {
  buildBookmarksBarMarkdown,
  exportBookmarksBarToObsidian,
  findBookmarksBarNode,
  splitBookmarksBarForObsidian,
} from '../../src/bookmark/bar-export'
import { useVaultStore } from '../../src/composables/useVaultStore'
```

Add state and helpers:

```ts
const vault = useVaultStore()
const isExporting = ref(false)
const successMessage = ref<string | null>(null)

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function setSuccess(message: string) {
  successMessage.value = message
  window.setTimeout(() => {
    if (successMessage.value === message) successMessage.value = null
  }, 3000)
}

async function getBookmarksBarOrThrow() {
  const roots = await browser.bookmarks.getTree()
  const bookmarksBar = findBookmarksBarNode(roots)
  if (!bookmarksBar) throw new Error('未找到浏览器书签栏')
  return bookmarksBar
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function handleExportMarkdown() {
  isExporting.value = true
  try {
    const date = todayString()
    const bookmarksBar = await getBookmarksBarOrThrow()
    downloadMarkdown(`bookmarks-bar-${date}.md`, buildBookmarksBarMarkdown(bookmarksBar, date))
    setSuccess('已导出书签栏 Markdown')
  } catch (e) {
    setError(e)
  } finally {
    isExporting.value = false
  }
}

async function handleExportObsidian() {
  isExporting.value = true
  try {
    await vault.init()
    if (!vault.isAuthorized.value) {
      if (vault.needsReauth.value) {
        await vault.reauthorize()
      } else {
        await vault.authorize()
      }
    }
    if (!vault.handle.value) throw new Error('未授权 Obsidian Vault')

    const date = todayString()
    const bookmarksBar = await getBookmarksBarOrThrow()
    const files = splitBookmarksBarForObsidian(bookmarksBar, date)
    await exportBookmarksBarToObsidian(vault.handle.value, 'Bookmarks', files)
    setSuccess(`已导出 ${files.length} 个 Markdown 文件到 Obsidian`)
  } catch (e) {
    setError(e)
  } finally {
    isExporting.value = false
  }
}
```

Pass props and listeners to `BookmarkList`:

```vue
<BookmarkList
  :bookmarks="tree.selectedBookmarks.value"
  :processed-ids="tree.processedIds.value"
  :folder-title="selectedFolderTitle"
  :is-exporting="isExporting"
  @delete-bookmark="(id) => tree.deleteBookmark(id).catch(setError)"
  @open-bookmark="handleOpenBookmark"
  @export-markdown="handleExportMarkdown"
  @export-obsidian="handleExportObsidian"
/>
```

Add success message:

```vue
<div v-if="successMessage" class="global-success">{{ successMessage }}</div>
```

Add CSS:

```css
.global-success {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: #e6f4ea;
  color: #2e7d32;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid #c8e6c9;
  z-index: 100;
}
```

- [ ] **Step 3: Run typecheck/build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Commit UI wiring**

Run:

```bash
git add entrypoints/bookmarks/App.vue entrypoints/bookmarks/components/BookmarkList.vue
git commit -m "feat: add bookmarks bar export actions"
```

### Task 3: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused bookmark export tests**

Run:

```bash
pnpm vitest run tests/bookmark/bar-export.test.ts tests/bookmark/export.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Check git state**

Run:

```bash
git status --short
```

Expected: no uncommitted implementation changes.

---

## Self-Review

- Spec coverage: The plan covers full Markdown export, Obsidian split-by-first-level-folder export, root direct bookmarks, button placement, status feedback, and formatter tests.
- Placeholder scan: No `TBD`, `TODO`, or open-ended implementation placeholders remain.
- Type consistency: Shared formatter functions use `BookmarkNode` from the existing composable and are consumed from `App.vue` with the WXT bookmarks API return shape.
