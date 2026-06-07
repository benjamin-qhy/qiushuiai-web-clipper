<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BookmarkListItem, SelectedFolderStats } from '../../../src/composables/useBookmarkTree'
import type { BookmarkRecord } from '../../../src/storage/bookmarks'
import type { BookmarkSortMode } from '../../../src/bookmark/sort'

const props = defineProps<{
  bookmarks: BookmarkListItem[]
  processedIds: Set<string>
  records?: Map<string, BookmarkRecord>
  folderTitle: string
  folderStats: SelectedFolderStats
  aiAvailable?: boolean
  isSearchActive?: boolean
  isSearching?: boolean
  searchQuery?: string
  searchError?: string | null
  sortMode: BookmarkSortMode
}>()

const emit = defineEmits<{
  deleteBookmark: [id: string]
  openBookmark: [url: string]
  search: [query: string]
  aiSearch: [query: string]
  clearSearch: []
  changeSort: [mode: BookmarkSortMode]
}>()

const localQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined

// Sync external searchQuery back to localQuery (e.g., when cleared from parent)
watch(() => props.searchQuery, val => {
  if (val !== undefined && val !== localQuery.value) {
    localQuery.value = val
  }
})

function onQueryInput() {
  clearTimeout(debounceTimer)
  if (!localQuery.value.trim()) {
    emit('clearSearch')
    return
  }
  debounceTimer = setTimeout(() => {
    emit('search', localQuery.value)
  }, 300)
}

function onSearchSubmit() {
  clearTimeout(debounceTimer)
  if (localQuery.value.trim()) {
    emit('search', localQuery.value)
  }
}

function onAISearch() {
  clearTimeout(debounceTimer)
  if (localQuery.value.trim()) {
    console.log('[bookmark-ai-search] click', {
      time: new Date().toISOString(),
      query: localQuery.value,
    })
    emit('aiSearch', localQuery.value)
  }
}

function onEscape() {
  clearTimeout(debounceTimer)
  localQuery.value = ''
  emit('clearSearch')
}

function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}

function faviconUrl(url: string): string {
  const domain = getDomain(url)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
}

function onFaviconError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='2' fill='%23ddd'/></svg>`
}

function onDragStart(e: DragEvent, bookmarkId: string) {
  e.dataTransfer?.setData('type', 'bookmark')
  e.dataTransfer?.setData('id', bookmarkId)
}
</script>

<template>
  <div class="list-panel">
    <div class="list-header">
      <div class="header-left">
        <h2 class="folder-title">
          <template v-if="isSearchActive">
            <span v-if="isSearching">搜索中…</span>
            <span v-else>搜索结果</span>
          </template>
          <template v-else>{{ folderTitle || '请选择文件夹' }}</template>
        </h2>
        <span class="count" v-if="!isSearching && bookmarks.length > 0">
          {{ bookmarks.length }} 条
          <template v-if="!isSearchActive && folderStats.childFolderCount > 0">
            （含子文件夹，直接 {{ folderStats.directBookmarkCount }} 条）
          </template>
        </span>
      </div>
      <div class="header-search">
        <select
          class="sort-select"
          :value="sortMode"
          @change="emit('changeSort', ($event.target as HTMLSelectElement).value as BookmarkSortMode)"
        >
          <option value="original">原始</option>
          <option value="domain">域名</option>
        </select>
        <input
          v-model="localQuery"
          class="search-input"
          :class="{ active: isSearchActive }"
          placeholder="搜索书签…"
          @input="onQueryInput"
          @keydown.enter.prevent="onSearchSubmit"
          @keydown.escape="onEscape"
        />
        <button
          v-if="aiAvailable"
          class="btn-ai"
          :disabled="isSearching || !localQuery.trim()"
          title="AI 语义搜索"
          @click="onAISearch"
        >AI搜索</button>
      </div>
    </div>

    <div v-if="searchError" class="search-error">{{ searchError }}</div>

    <div v-if="isSearchActive && !isSearching && bookmarks.length === 0" class="empty-hint">
      未找到匹配的书签
    </div>
    <div v-else-if="!isSearchActive && !folderTitle" class="empty-hint">← 点击左侧文件夹查看书签</div>
    <div v-else-if="!isSearchActive && bookmarks.length === 0 && folderTitle" class="empty-hint">此文件夹暂无书签</div>

    <ul v-else-if="bookmarks.length > 0" class="bookmark-list">
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
          <span v-if="props.records?.get(bm.id)?.summary" class="bm-summary">
            {{ props.records?.get(bm.id)?.summary }}
          </span>
          <span
            v-if="bm.folderPath || props.records?.get(bm.id)?.tags?.length"
            class="bm-tags"
          >
            <span v-if="bm.folderPath" class="bm-tag bm-folder-path">{{ bm.folderPath }}</span>
            <span v-for="tag in props.records?.get(bm.id)?.tags" :key="tag" class="bm-tag">{{ tag }}</span>
          </span>
        </div>
        <span v-if="processedIds.has(bm.id)" class="badge-processed">已整理</span>
        <button class="delete-btn" title="删除" @click.stop="emit('deleteBookmark', bm.id)">✕</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.list-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.folder-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-size: 14px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Search bar */
.header-search {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.sort-select {
  padding: 5px 8px;
  font-size: 12px;
  font-family: var(--font-ui);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
}
.sort-select:focus { border-color: var(--color-accent); }
.search-input {
  width: 160px;
  padding: 5px 8px;
  font-size: 13px;
  font-family: var(--font-ui);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  transition: width 0.15s, border-color 0.15s;
}
.search-input::placeholder { color: var(--color-text-muted); }
.search-input:focus { border-color: var(--color-accent); width: 220px; }
.search-input.active { border-color: var(--color-accent); width: 220px; }
.btn-ai {
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-ui);
  background: var(--color-dark);
  color: #fff;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.btn-ai:hover:not(:disabled) { opacity: 0.8; }
.btn-ai:disabled { opacity: 0.4; cursor: not-allowed; }
.search-error {
  padding: 6px 18px;
  font-size: 13px;
  color: #c62828;
  background: #fce8e6;
  border-bottom: 1px solid #f5c6c6;
  flex-shrink: 0;
}
.empty-hint {
  padding: 48px 18px;
  color: var(--color-text-muted);
  font-size: 14px;
  text-align: center;
}
.bookmark-list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.bookmark-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  cursor: grab;
  border-bottom: 1px solid var(--color-border-light);
}
.bookmark-item:hover { background: var(--color-surface); }
.bookmark-item:active { cursor: grabbing; }
.favicon { flex-shrink: 0; border-radius: 2px; opacity: 0.85; }
.bm-content { flex: 1; min-width: 0; cursor: pointer; }
.bm-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}
.bm-url {
  display: block;
  font-size: 14px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.bm-content:hover .bm-title { color: var(--color-accent); }
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
.bm-folder-path {
  color: var(--color-text-secondary);
}
.badge-processed {
  flex-shrink: 0;
  font-size: 14px;
  padding: 1px 6px;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  border-radius: 2px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-muted);
  padding: 2px 6px;
  border-radius: 2px;
  flex-shrink: 0;
}
.delete-btn:hover { background: #fce8e6; color: #c62828; }
</style>
