# Bookmark Manager UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将书签管理页面改造为三栏布局：左侧可展开/折叠的文件夹树（支持增删改拖拽）、中间书签列表（favicon + AI处理状态 + 删除/拖拽移动）、右侧 AI 整理侧边栏（含配置入口和未配置提示）。

**Architecture:** 新增 `src/composables/useBookmarkTree.ts` 集中管理所有 Chrome bookmarks API 调用和状态；新增三个子组件（FolderTree / BookmarkList / AISidebar）各司其职；`entrypoints/bookmarks/App.vue` 全量重写为三栏布局，通过 props/emits 连接各组件。不需要新增单元测试（Chrome extension API 无法在 jsdom 中测试）。

**Tech Stack:** Vue 3 Composition API, TypeScript, WXT (`browser` from `wxt/browser`), HTML5 原生拖拽 API, `chrome.bookmarks.*`, IndexedDB (`getAllBookmarkRecords`)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/composables/useBookmarkTree.ts` | 新建 | 所有书签状态 + Chrome API 调用 |
| `entrypoints/bookmarks/components/FolderTree.vue` | 新建 | 左侧文件夹树渲染 + CRUD + 拖拽目标 |
| `entrypoints/bookmarks/components/BookmarkList.vue` | 新建 | 中间书签列表 + 拖拽源 + 删除 |
| `entrypoints/bookmarks/components/AISidebar.vue` | 新建 | 右侧 AI 面板（从现有 App.vue 提取并扩展）|
| `entrypoints/bookmarks/App.vue` | 全量重写 | 三栏布局，组合上述三个组件 |

---

## Task 1: useBookmarkTree composable

**Files:**
- Create: `src/composables/useBookmarkTree.ts`

- [ ] **Step 1: 创建文件，定义类型**

```typescript
// src/composables/useBookmarkTree.ts
import { ref } from 'vue'
import { browser } from 'wxt/browser'
import { getSettings } from '../storage/settings'
import { getAllBookmarkRecords } from '../storage/bookmarks'
import type { Browser } from 'wxt/browser'

export type BookmarkNode = Browser.bookmarks.BookmarkTreeNode

export interface FolderNode {
  id: string
  title: string
  parentId?: string
  children: FolderNode[]
  expanded: boolean
}
```

- [ ] **Step 2: 实现 composable 主体（状态 + loadTree）**

```typescript
export function useBookmarkTree() {
  const folderTree = ref<FolderNode[]>([])
  const selectedFolderId = ref<string | null>(null)
  const selectedBookmarks = ref<BookmarkNode[]>([])
  const processedIds = ref<Set<string>>(new Set())
  const dragOverFolderId = ref<string | null>(null)
  const expandedIds = ref<Set<string>>(new Set())

  function buildFolderTree(nodes: BookmarkNode[]): FolderNode[] {
    return nodes
      .filter(n => !n.url)
      .map(n => ({
        id: n.id,
        title: n.title,
        parentId: n.parentId,
        children: buildFolderTree(n.children ?? []),
        expanded: expandedIds.value.has(n.id),
      }))
  }

  async function loadTree() {
    const roots = await browser.bookmarks.getTree()
    // roots[0] is the invisible root; its children are Bookmarks Bar, Other Bookmarks, etc.
    folderTree.value = buildFolderTree(roots[0].children ?? [])

    const records = await getAllBookmarkRecords()
    processedIds.value = new Set(records.map(r => r.id))
  }

  async function selectFolder(folderId: string) {
    selectedFolderId.value = folderId
    const children = await browser.bookmarks.getChildren(folderId)
    selectedBookmarks.value = children.filter(n => !!n.url)
  }

  function toggleExpand(folderId: string) {
    if (expandedIds.value.has(folderId)) {
      expandedIds.value.delete(folderId)
    } else {
      expandedIds.value.add(folderId)
    }
    // Rebuild tree to reflect new expanded state
    loadTree()
  }
```

- [ ] **Step 3: 实现文件夹 CRUD 方法**

```typescript
  async function createFolder(parentId: string, title: string): Promise<void> {
    await browser.bookmarks.create({ parentId, title })
    await loadTree()
  }

  async function renameFolder(id: string, title: string): Promise<void> {
    await browser.bookmarks.update(id, { title })
    await loadTree()
  }

  async function deleteFolder(folderId: string): Promise<void> {
    // 1. Find 待整理 folder
    const settings = await getSettings()
    const inboxName = settings.bookmarkInboxFolder
    const results = await browser.bookmarks.search({ title: inboxName })
    const inbox = results.find(r => !r.url)
    if (!inbox) throw new Error(`找不到"${inboxName}"文件夹，请先创建它`)

    // 2. Collect all bookmark nodes in this folder subtree
    const subtree = await browser.bookmarks.getSubTree(folderId)
    const bookmarkNodes: BookmarkNode[] = []
    function collect(nodes: BookmarkNode[]) {
      for (const n of nodes) {
        if (n.url) bookmarkNodes.push(n)
        if (n.children) collect(n.children)
      }
    }
    collect(subtree[0].children ?? [])

    // 3. Move each bookmark to inbox
    for (const bm of bookmarkNodes) {
      await browser.bookmarks.move(bm.id, { parentId: inbox.id })
    }

    // 4. Remove the now-empty folder tree
    await browser.bookmarks.removeTree(folderId)
    await loadTree()

    // If deleted folder was selected, clear selection
    if (selectedFolderId.value === folderId) {
      selectedFolderId.value = null
      selectedBookmarks.value = []
    }
  }

  async function moveFolder(folderId: string, targetParentId: string): Promise<void> {
    await browser.bookmarks.move(folderId, { parentId: targetParentId })
    await loadTree()
  }
```

- [ ] **Step 4: 实现书签操作方法，关闭 composable**

```typescript
  async function deleteBookmark(id: string): Promise<void> {
    await browser.bookmarks.remove(id)
    if (selectedFolderId.value) {
      await selectFolder(selectedFolderId.value)
    }
  }

  async function moveBookmark(bookmarkId: string, targetFolderId: string): Promise<void> {
    await browser.bookmarks.move(bookmarkId, { parentId: targetFolderId })
    if (selectedFolderId.value) {
      await selectFolder(selectedFolderId.value)
    }
  }

  return {
    folderTree,
    selectedFolderId,
    selectedBookmarks,
    processedIds,
    dragOverFolderId,
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
}
```

- [ ] **Step 5: 运行测试确认无回归**

```bash
cd /Users/benjamin/work/ai-code/qiushui/qiushui-web-clipper && npx vitest run
```

Expected: 93 passed

- [ ] **Step 6: Commit**

```bash
git add src/composables/useBookmarkTree.ts
git commit -m "feat: add useBookmarkTree composable"
```

---

## Task 2: FolderTree 组件

**Files:**
- Create: `entrypoints/bookmarks/components/FolderTree.vue`

文件夹树组件。渲染可展开/折叠的树形结构，支持：
- 点击箭头展开/折叠子层
- 点击文件夹名称选中（触发 `select` emit）
- hover 时显示操作按钮：➕（新建子文件夹）、✎（重命名）、✕（删除）
- 新建/重命名时内联输入框
- 拖拽目标（接收 bookmark 或 folder drop）

- [ ] **Step 1: 创建 components 目录，写组件 script**

```typescript
// entrypoints/bookmarks/components/FolderTree.vue
<script setup lang="ts">
import { ref } from 'vue'
import type { FolderNode } from '../../../src/composables/useBookmarkTree'

const props = defineProps<{
  nodes: FolderNode[]
  selectedId: string | null
  dragOverId: string | null
  depth?: number
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleExpand: [id: string]
  createFolder: [parentId: string, title: string]
  renameFolder: [id: string, title: string]
  deleteFolder: [id: string]
  moveFolder: [folderId: string, targetParentId: string]
  moveBookmark: [bookmarkId: string, targetFolderId: string]
  dragOver: [folderId: string | null]
}>()

const depth = props.depth ?? 0

// Inline editing state
const creatingIn = ref<string | null>(null)  // parentId being created in
const newFolderTitle = ref('')
const editingId = ref<string | null>(null)
const editingTitle = ref('')

function startCreate(parentId: string) {
  creatingIn.value = parentId
  newFolderTitle.value = ''
}

function confirmCreate(parentId: string) {
  if (newFolderTitle.value.trim()) {
    emit('createFolder', parentId, newFolderTitle.value.trim())
  }
  creatingIn.value = null
}

function startRename(node: FolderNode) {
  editingId.value = node.id
  editingTitle.value = node.title
}

function confirmRename(id: string) {
  if (editingTitle.value.trim() && editingTitle.value.trim() !== '') {
    emit('renameFolder', id, editingTitle.value.trim())
  }
  editingId.value = null
}

function onDragOver(e: DragEvent, folderId: string) {
  e.preventDefault()
  emit('dragOver', folderId)
}

function onDragLeave() {
  emit('dragOver', null)
}

function onDrop(e: DragEvent, targetFolderId: string) {
  e.preventDefault()
  emit('dragOver', null)
  const type = e.dataTransfer?.getData('type')
  const id = e.dataTransfer?.getData('id')
  if (!id) return
  if (type === 'bookmark') {
    emit('moveBookmark', id, targetFolderId)
  } else if (type === 'folder') {
    if (id !== targetFolderId) {
      emit('moveFolder', id, targetFolderId)
    }
  }
}

function onFolderDragStart(e: DragEvent, folderId: string) {
  e.dataTransfer?.setData('type', 'folder')
  e.dataTransfer?.setData('id', folderId)
}
</script>
```

- [ ] **Step 2: 写 template**

```html
<template>
  <ul class="folder-list" :style="{ paddingLeft: depth > 0 ? '16px' : '0' }">
    <li
      v-for="node in nodes"
      :key="node.id"
      class="folder-item"
    >
      <div
        class="folder-row"
        :class="{
          selected: selectedId === node.id,
          'drag-over': dragOverId === node.id,
        }"
        draggable="true"
        @dragstart="onFolderDragStart($event, node.id)"
        @dragover="onDragOver($event, node.id)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, node.id)"
        @click="emit('select', node.id)"
      >
        <button
          class="expand-btn"
          @click.stop="emit('toggleExpand', node.id)"
        >
          {{ node.children.length > 0 ? (node.expanded ? '▾' : '▸') : '·' }}
        </button>

        <template v-if="editingId === node.id">
          <input
            class="inline-input"
            v-model="editingTitle"
            @keyup.enter="confirmRename(node.id)"
            @keyup.escape="editingId = null"
            @blur="confirmRename(node.id)"
            autofocus
            @click.stop
          />
        </template>
        <span v-else class="folder-name">{{ node.title }}</span>

        <div class="folder-actions" @click.stop>
          <button class="action-btn" title="新建子文件夹" @click="startCreate(node.id)">＋</button>
          <button class="action-btn" title="重命名" @click="startRename(node)">✎</button>
          <button class="action-btn danger" title="删除（书签移入待整理）" @click="emit('deleteFolder', node.id)">✕</button>
        </div>
      </div>

      <!-- Inline new folder input -->
      <div v-if="creatingIn === node.id" class="folder-row" style="padding-left: 32px">
        <input
          class="inline-input"
          v-model="newFolderTitle"
          placeholder="文件夹名称"
          @keyup.enter="confirmCreate(node.id)"
          @keyup.escape="creatingIn = null"
          @blur="confirmCreate(node.id)"
          autofocus
        />
      </div>

      <!-- Recursive children -->
      <FolderTree
        v-if="node.expanded && node.children.length > 0"
        :nodes="node.children"
        :selected-id="selectedId"
        :drag-over-id="dragOverId"
        :depth="depth + 1"
        @select="emit('select', $event)"
        @toggle-expand="emit('toggleExpand', $event)"
        @create-folder="emit('createFolder', $event[0], $event[1])"
        @rename-folder="emit('renameFolder', $event[0], $event[1])"
        @delete-folder="emit('deleteFolder', $event)"
        @move-folder="emit('moveFolder', $event[0], $event[1])"
        @move-bookmark="emit('moveBookmark', $event[0], $event[1])"
        @drag-over="emit('dragOver', $event)"
      />
    </li>
  </ul>
</template>
```

**注意**：递归使用 `FolderTree` 自身时，Vue 单文件组件中需要用组件名 `FolderTree` 调用自身（Vue 3 SFC 支持）。

- [ ] **Step 3: 写样式**

```html
<style scoped>
.folder-list { list-style: none; margin: 0; padding: 0; }
.folder-item { }
.folder-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  position: relative;
}
.folder-row:hover { background: #f5f5f5; }
.folder-row.selected { background: #ede9f7; }
.folder-row.drag-over { background: #d4e4ff; outline: 2px solid #1a73e8; }
.expand-btn {
  background: none; border: none; cursor: pointer;
  font-size: 11px; color: #888; width: 16px; flex-shrink: 0; padding: 0;
}
.folder-name { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-actions {
  display: none;
  gap: 2px;
  align-items: center;
}
.folder-row:hover .folder-actions { display: flex; }
.action-btn {
  background: none; border: none; cursor: pointer;
  font-size: 12px; color: #888; padding: 1px 4px; border-radius: 3px;
}
.action-btn:hover { background: #e0e0e0; color: #333; }
.action-btn.danger:hover { background: #fce8e6; color: #c62828; }
.inline-input {
  flex: 1; font-size: 13px; border: 1px solid #6e4dc4;
  border-radius: 3px; padding: 1px 4px; outline: none;
}
</style>
```

- [ ] **Step 4: 运行测试**

```bash
cd /Users/benjamin/work/ai-code/qiushui/qiushui-web-clipper && npx vitest run
```

Expected: 93 passed

- [ ] **Step 5: Commit**

```bash
git add entrypoints/bookmarks/components/FolderTree.vue
git commit -m "feat: add FolderTree component"
```

---

## Task 3: BookmarkList 组件

**Files:**
- Create: `entrypoints/bookmarks/components/BookmarkList.vue`

中间书签列表组件。每条书签显示 favicon + 标题 + URL + AI处理标记，支持点击打开、删除、拖拽到左侧文件夹。

- [ ] **Step 1: 写组件 script**

```typescript
// entrypoints/bookmarks/components/BookmarkList.vue
<script setup lang="ts">
import type { BookmarkNode } from '../../../src/composables/useBookmarkTree'

const props = defineProps<{
  bookmarks: BookmarkNode[]
  processedIds: Set<string>
  folderTitle: string
}>()

const emit = defineEmits<{
  deleteBookmark: [id: string]
  openBookmark: [url: string]
}>()

function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}

function faviconUrl(url: string): string {
  const domain = getDomain(url)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
}

function onFaviconError(e: Event) {
  const img = e.target as HTMLImageElement
  // Fallback to a generic bookmark icon (inline SVG data URL)
  img.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='2' fill='%23ddd'/></svg>`
}

function onDragStart(e: DragEvent, bookmarkId: string) {
  e.dataTransfer?.setData('type', 'bookmark')
  e.dataTransfer?.setData('id', bookmarkId)
}
</script>
```

- [ ] **Step 2: 写 template**

```html
<template>
  <div class="list-panel">
    <div class="list-header">
      <h2 class="folder-title">{{ folderTitle || '请选择文件夹' }}</h2>
      <span class="count" v-if="bookmarks.length > 0">{{ bookmarks.length }} 条</span>
    </div>

    <div v-if="!folderTitle" class="empty-hint">← 点击左侧文件夹查看书签</div>

    <div v-else-if="bookmarks.length === 0" class="empty-hint">此文件夹暂无书签</div>

    <ul v-else class="bookmark-list">
      <li
        v-for="bm in bookmarks"
        :key="bm.id"
        class="bookmark-item"
        draggable="true"
        @dragstart="onDragStart($event, bm.id)"
      >
        <img
          :src="faviconUrl(bm.url!)"
          class="favicon"
          @error="onFaviconError"
          width="16"
          height="16"
        />
        <div class="bm-content" @click="emit('openBookmark', bm.url!)">
          <span class="bm-title">{{ bm.title || bm.url }}</span>
          <span class="bm-url">{{ bm.url }}</span>
        </div>
        <span v-if="processedIds.has(bm.id)" class="badge-processed">已整理</span>
        <button class="delete-btn" title="删除" @click.stop="emit('deleteBookmark', bm.id)">✕</button>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 3: 写样式**

```html
<style scoped>
.list-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.list-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #e0e0e0; flex-shrink: 0; }
.folder-title { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
.count { font-size: 12px; color: #888; }
.empty-hint { padding: 32px 16px; color: #aaa; font-size: 14px; text-align: center; }
.bookmark-list { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 8px 0; }
.bookmark-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: grab;
  border-bottom: 1px solid #f0f0f0;
}
.bookmark-item:hover { background: #f9f9f9; }
.bookmark-item:active { cursor: grabbing; }
.favicon { flex-shrink: 0; border-radius: 2px; }
.bm-content { flex: 1; min-width: 0; cursor: pointer; }
.bm-title { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #222; }
.bm-url { display: block; font-size: 11px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.bm-content:hover .bm-title { color: #6e4dc4; text-decoration: underline; }
.badge-processed { flex-shrink: 0; font-size: 11px; padding: 1px 6px; background: #e6f4ea; color: #2e7d32; border-radius: 10px; }
.delete-btn { background: none; border: none; cursor: pointer; font-size: 12px; color: #bbb; padding: 2px 6px; border-radius: 3px; flex-shrink: 0; }
.delete-btn:hover { background: #fce8e6; color: #c62828; }
</style>
```

- [ ] **Step 4: 运行测试**

```bash
cd /Users/benjamin/work/ai-code/qiushui/qiushui-web-clipper && npx vitest run
```

Expected: 93 passed

- [ ] **Step 5: Commit**

```bash
git add entrypoints/bookmarks/components/BookmarkList.vue
git commit -m "feat: add BookmarkList component"
```

---

## Task 4: AISidebar 组件

**Files:**
- Create: `entrypoints/bookmarks/components/AISidebar.vue`

从现有 `App.vue` 提取 AI 整理逻辑，并新增：顶部配置图标（打开设置页）、AI未配置提示。

- [ ] **Step 1: 写组件 script**

```typescript
// entrypoints/bookmarks/components/AISidebar.vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { browser } from 'wxt/browser'
import { getAllBookmarkRecords } from '../../../src/storage/bookmarks'
import { exportCategoriesToVault } from '../../../src/bookmark/export'
import { getVaultHandle } from '../../../src/storage/vault'
import { getSettings } from '../../../src/storage/settings'
import type { ProcessingStatus } from '../../../src/storage/bookmarks'

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
const aiConfigured = ref(true)

onMounted(async () => {
  await refreshStatus()
  const settings = await getSettings()
  aiConfigured.value = !!settings.aiConfig.apiKey.trim()
})

async function refreshStatus() {
  const res = await browser.runtime.sendMessage({ type: 'GET_PROCESSING_STATUS' }) as ProcessingStatus
  if (res && res.state) status.value = res
}

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

function openSettings() {
  browser.runtime.openOptionsPage()
}

function formatDate(ts: number | null): string {
  if (!ts) return '从未'
  return new Date(ts).toLocaleString('zh-CN')
}

const canTrigger = computed(() => aiConfigured.value && !isTriggering.value && status.value.state !== 'running')
</script>
```

- [ ] **Step 2: 写 template**

```html
<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">AI 整理</span>
      <button class="btn-config" title="AI 设置" @click="openSettings">⚙</button>
    </div>

    <div v-if="!aiConfigured" class="ai-unconfigured">
      <p>尚未配置 AI API Key</p>
      <button class="btn-link" @click="openSettings">前往配置 →</button>
    </div>

    <div class="status-card">
      <div class="status-row">
        <span class="label">状态</span>
        <span :class="['badge', status.state]">
          {{ { idle: '空闲', running: '处理中', done: '完成', error: '错误' }[status.state] }}
        </span>
      </div>

      <div v-if="status.state === 'running'" class="progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: status.total ? `${(status.processed / status.total) * 100}%` : '0%' }" />
        </div>
        <span class="progress-text">{{ status.processed }} / {{ status.total }}</span>
      </div>

      <div v-if="status.duplicatesRemoved > 0" class="stat">✓ 去重 {{ status.duplicatesRemoved }} 条</div>
      <div v-if="status.deadLinksRemoved > 0" class="stat">✓ 死链 {{ status.deadLinksRemoved }} 条</div>
      <div v-if="status.error" class="error-msg">✗ {{ status.error }}</div>
      <div class="last-run">上次：{{ formatDate(status.lastRunAt) }}</div>
    </div>

    <div class="actions">
      <button class="btn-primary" :disabled="!canTrigger" @click="triggerProcessing">
        {{ isTriggering ? '触发中…' : '立即整理' }}
      </button>
      <button class="btn-secondary" :disabled="isExporting" @click="handleExport">
        {{ isExporting ? '导出中…' : '导出到 Obsidian' }}
      </button>
    </div>

    <p v-if="exportResult" class="success">✓ {{ exportResult }}</p>
    <p v-if="exportError" class="error-msg">✗ {{ exportError }}</p>
  </aside>
</template>
```

- [ ] **Step 3: 写样式**

```html
<style scoped>
.sidebar {
  width: 220px;
  flex-shrink: 0;
  border-left: 1px solid #e0e0e0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  background: #fafafa;
}
.sidebar-header { display: flex; align-items: center; justify-content: space-between; }
.sidebar-title { font-size: 14px; font-weight: 600; color: #333; }
.btn-config { background: none; border: none; cursor: pointer; font-size: 16px; color: #888; padding: 0; }
.btn-config:hover { color: #444; }
.ai-unconfigured {
  padding: 10px; background: #fff8e1; border: 1px solid #ffe082;
  border-radius: 6px; font-size: 12px; color: #795548;
}
.ai-unconfigured p { margin: 0 0 6px; }
.btn-link { background: none; border: none; cursor: pointer; font-size: 12px; color: #6e4dc4; padding: 0; text-decoration: underline; }
.status-card { padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; background: #fff; }
.status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.label { font-size: 12px; color: #555; }
.badge { padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
.badge.idle { background: #f0f0f0; color: #666; }
.badge.running { background: #e8f0fe; color: #1a73e8; }
.badge.done { background: #e6f4ea; color: #2e7d32; }
.badge.error { background: #fce8e6; color: #c62828; }
.progress { margin-bottom: 8px; }
.progress-bar { height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden; margin-bottom: 3px; }
.progress-fill { height: 100%; background: #6e4dc4; transition: width 0.3s; }
.progress-text { font-size: 11px; color: #666; }
.stat { font-size: 11px; color: #2e7d32; }
.last-run { font-size: 11px; color: #aaa; margin-top: 6px; }
.actions { display: flex; flex-direction: column; gap: 6px; }
.btn-primary {
  width: 100%; padding: 8px; background: #6e4dc4; color: #fff;
  border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  width: 100%; padding: 8px; background: #f5f5f5; color: #222;
  border: 1px solid #ccc; border-radius: 6px; font-size: 13px; cursor: pointer;
}
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.success { color: #2e7d32; font-size: 12px; margin: 0; }
.error-msg { color: #c62828; font-size: 12px; margin: 0; }
</style>
```

- [ ] **Step 4: 运行测试**

```bash
cd /Users/benjamin/work/ai-code/qiushui/qiushui-web-clipper && npx vitest run
```

Expected: 93 passed

- [ ] **Step 5: Commit**

```bash
git add entrypoints/bookmarks/components/AISidebar.vue
git commit -m "feat: add AISidebar component"
```

---

## Task 5: App.vue 全量重写为三栏布局

**Files:**
- Modify: `entrypoints/bookmarks/App.vue`

将现有的单列布局全量替换为三栏布局，组合 FolderTree + BookmarkList + AISidebar。

- [ ] **Step 1: 全量替换 App.vue**

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { browser } from 'wxt/browser'
import { useBookmarkTree } from '../../src/composables/useBookmarkTree'
import FolderTree from './components/FolderTree.vue'
import BookmarkList from './components/BookmarkList.vue'
import AISidebar from './components/AISidebar.vue'

const tree = useBookmarkTree()

onMounted(() => tree.loadTree())

const selectedFolderTitle = computed(() => {
  if (!tree.selectedFolderId.value) return ''
  function findTitle(nodes: ReturnType<typeof tree.folderTree.value>[number][]): string {
    for (const n of nodes) {
      if (n.id === tree.selectedFolderId.value) return n.title
      const found = findTitle(n.children)
      if (found) return found
    }
    return ''
  }
  return findTitle(tree.folderTree.value)
})

async function handleSelect(folderId: string) {
  await tree.selectFolder(folderId)
}

function handleOpenBookmark(url: string) {
  browser.tabs.create({ url })
}
</script>

<template>
  <div class="layout">
    <div class="pane-left">
      <div class="pane-header">书签文件夹</div>
      <div class="pane-body">
        <FolderTree
          :nodes="tree.folderTree.value"
          :selected-id="tree.selectedFolderId.value"
          :drag-over-id="tree.dragOverFolderId.value"
          @select="handleSelect"
          @toggle-expand="tree.toggleExpand"
          @create-folder="(parentId, title) => tree.createFolder(parentId, title)"
          @rename-folder="(id, title) => tree.renameFolder(id, title)"
          @delete-folder="tree.deleteFolder"
          @move-folder="(folderId, targetId) => tree.moveFolder(folderId, targetId)"
          @move-bookmark="(bmId, folderId) => tree.moveBookmark(bmId, folderId)"
          @drag-over="(id) => { tree.dragOverFolderId.value = id }"
        />
      </div>
    </div>

    <div class="pane-main">
      <BookmarkList
        :bookmarks="tree.selectedBookmarks.value"
        :processed-ids="tree.processedIds.value"
        :folder-title="selectedFolderTitle"
        @delete-bookmark="tree.deleteBookmark"
        @open-bookmark="handleOpenBookmark"
      />
    </div>

    <AISidebar />
  </div>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
</style>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  color: #222;
}
.pane-left {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pane-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}
.pane-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.pane-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: 构建**

```bash
cd /Users/benjamin/work/ai-code/qiushui/qiushui-web-clipper && npm run build 2>&1
```

Expected: 构建成功，无报错。

- [ ] **Step 3: 运行测试**

```bash
npx vitest run
```

Expected: 93 passed

- [ ] **Step 4: Commit**

```bash
git add entrypoints/bookmarks/App.vue
git commit -m "feat: redesign bookmarks page as three-pane layout"
```

---

## 验收标准

1. `npx vitest run` 全部通过
2. `npm run build` 无报错
3. 加载插件后打开书签页：
   - 左侧显示浏览器书签文件夹树，点击箭头可展开/折叠
   - 点击文件夹名称，中间显示该文件夹内书签（含 favicon + 是否已AI处理标记）
   - 可拖拽书签到左侧文件夹完成移动
   - 文件夹 hover 显示 ＋/✎/✕ 操作按钮
   - 删除文件夹时书签转移至"待整理"
   - 可拖拽文件夹到另一个文件夹实现移动
   - 右侧侧边栏显示 AI 整理功能，顶部有⚙配置图标
   - 未配置 API Key 时显示黄色提示
