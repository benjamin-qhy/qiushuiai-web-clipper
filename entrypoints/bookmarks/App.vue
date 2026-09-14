<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { browser } from 'wxt/browser'
import { useBookmarkTree } from '../../src/composables/useBookmarkTree'
import { useBookmarkSearch } from '../../src/composables/useBookmarkSearch'
import { sortBookmarks, type BookmarkSortMode } from '../../src/bookmark/sort'
import { getSettings } from '../../src/storage/settings'
import { getAvailableModelSelection } from '../../src/ai/catalog'
import { getFolderDescriptions, setFolderDescription } from '../../src/storage/folderDescriptions'
import FolderTree from './components/FolderTree.vue'
import BookmarkList from './components/BookmarkList.vue'
import AISidebar from './components/AISidebar.vue'
import type { FolderNode } from '../../src/composables/useBookmarkTree'

const version = browser.runtime.getManifest().version
const tree = useBookmarkTree()
const bookmarkSearch = useBookmarkSearch()
const aiAvailable = ref(false)
const folderDescription = ref('')
const sortMode = ref<BookmarkSortMode>('original')

async function loadDescription(folderId: string) {
  const descs = await getFolderDescriptions()
  folderDescription.value = descs[folderId] ?? ''
}

async function saveDescription() {
  if (!tree.selectedFolderId.value) return
  await setFolderDescription(tree.selectedFolderId.value, folderDescription.value)
}

onMounted(async () => {
  await tree.loadTree()
  if (tree.folderTree.value.length > 0) {
    await handleSelect(tree.folderTree.value[0].id).catch(setError)
  }
  const settings = await getSettings()
  aiAvailable.value = !!getAvailableModelSelection(settings)?.platform.apiKey.trim()
})

function findTitle(nodes: FolderNode[], id: string): string {
  for (const n of nodes) {
    if (n.id === id) return n.title
    const found = findTitle(n.children, id)
    if (found) return found
  }
  return ''
}

const selectedFolderTitle = computed(() =>
  tree.selectedFolderId.value ? findTitle(tree.folderTree.value, tree.selectedFolderId.value) : ''
)

const displayedBookmarks = computed(() => {
  const bookmarks = bookmarkSearch.isSearchActive.value
    ? bookmarkSearch.searchResults.value
    : tree.selectedBookmarks.value
  return sortBookmarks(bookmarks, sortMode.value)
})

async function handleSelect(folderId: string) {
  await tree.selectFolder(folderId).catch(setError)
  await loadDescription(folderId).catch(setError)
}

function handleOpenBookmark(url: string) {
  browser.tabs.create({ url })
}

function setError(e: unknown) {
  tree.error.value = e instanceof Error ? e.message : String(e)
}

async function handleSearch(query: string) {
  await bookmarkSearch.search(query).catch(setError)
}

async function handleAISearch(query: string) {
  await bookmarkSearch.aiSearch(query, tree.recordsMap.value).catch(setError)
}

function handleClearSearch() {
  bookmarkSearch.clear()
}
</script>

<template>
  <div class="layout">
    <div class="pane-left">
      <div class="pane-header">
        <div class="pane-title">书签</div>
        <span class="pane-version">v{{ version }}</span>
      </div>
      <div class="pane-body">
        <FolderTree
          :nodes="tree.folderTree.value"
          :selected-id="tree.selectedFolderId.value"
          :drag-over-id="tree.dragOverFolderId.value"
          @select="handleSelect"
          @toggle-expand="(id) => tree.toggleExpand(id).catch(setError)"
          @create-folder="(parentId, title) => tree.createFolder(parentId, title).catch(setError)"
          @rename-folder="(id, title) => tree.renameFolder(id, title).catch(setError)"
          @delete-folder="(id) => tree.deleteFolder(id).catch(setError)"
          @move-folder="(folderId, targetId) => tree.moveFolder(folderId, targetId).catch(setError)"
          @move-bookmark="(bmId, folderId) => tree.moveBookmark(bmId, folderId).catch(setError)"
          @drag-over="(id) => { tree.dragOverFolderId.value = id }"
        />
      </div>
      <div v-if="tree.selectedFolderId.value" class="pane-desc">
        <div class="pane-desc-label">文件夹说明</div>
        <textarea
          class="pane-desc-input"
          v-model="folderDescription"
          placeholder="描述这个文件夹放哪类网址，AI 整理时会参考"
          rows="3"
          @blur="saveDescription"
        />
      </div>
    </div>

    <div class="pane-main">
      <BookmarkList
        :bookmarks="displayedBookmarks"
        :processed-ids="tree.processedIds.value"
        :records="tree.recordsMap.value"
        :folder-title="selectedFolderTitle"
        :folder-stats="tree.selectedFolderStats.value"
        :ai-available="aiAvailable"
        :is-search-active="bookmarkSearch.isSearchActive.value"
        :is-searching="bookmarkSearch.isSearching.value"
        :search-query="bookmarkSearch.searchQuery.value"
        :search-error="bookmarkSearch.searchError.value"
        :sort-mode="sortMode"
        @delete-bookmark="(id) => tree.deleteBookmark(id).catch(setError)"
        @open-bookmark="handleOpenBookmark"
        @search="handleSearch"
        @ai-search="handleAISearch"
        @clear-search="handleClearSearch"
        @change-sort="(mode) => { sortMode = mode }"
      />
    </div>

    <AISidebar />
  </div>

  <div v-if="tree.error.value" class="global-error">{{ tree.error.value }}</div>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-ui); background: var(--color-base); }
</style>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-bg);
}
.pane-left {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
}
.pane-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.pane-version {
  font-size: 11px;
  color: var(--color-text-muted);
}
.pane-brand {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 2px;
}
.pane-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.3px;
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
  background: var(--color-bg);
}
.pane-desc {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  padding: 10px 12px;
  background: var(--color-surface);
}
.pane-desc-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 5px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.pane-desc-input {
  width: 100%;
  resize: none;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 5px 7px;
  outline: none;
  line-height: 1.5;
  box-sizing: border-box;
}
.pane-desc-input:focus {
  border-color: var(--color-accent);
}
.global-error {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: #fce8e6;
  color: #c62828;
  padding: 8px 16px;
  border-radius: 2px;
  font-size: 14px;
  border: 1px solid #f5c6c6;
  z-index: 100;
}
</style>
