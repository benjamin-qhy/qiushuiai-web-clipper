<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { browser } from 'wxt/browser'
import { buildFavoriteItems, finalizePrefixProgress, type DouyinFavoriteItemView } from '../../src/douyin/importFlow'
import { collectFavoriteItemsFromPage, isDouyinFavoritesPage, normalizeDouyinWorkUrl } from '../../src/douyin/collect'
import { getDouyinImportState, saveDouyinImportState, type DouyinImportState } from '../../src/storage/douyinImports'
import { getSettings } from '../../src/storage/settings'
import { saveLinkNote } from '../../src/getnote/api'

type ViewState = 'checking' | 'ready' | 'saving' | 'invalid-page' | 'load-error'

const viewState = ref<ViewState>('checking')
const errorMessage = ref('')
const items = ref<DouyinFavoriteItemView[]>([])
const importState = ref<DouyinImportState>({
  lastImportedUrl: '',
  importedUrlSet: [],
})
const pageUrl = ref('')
const tabId = ref<number | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const selectedCount = computed(() =>
  items.value.filter((item) => item.selected && item.status === 'idle').length,
)

const importedCount = computed(() => importState.value.importedUrlSet.length)
const allSelectableChecked = computed(
  () => items.value.length > 0 && items.value.every((item) => item.status !== 'idle' || item.selected),
)
const selectableCount = computed(() => items.value.filter((item) => item.status === 'idle').length)

function toggleSelectAll(checked: boolean): void {
  items.value = items.value.map((item) =>
    item.status === 'idle' ? { ...item, selected: checked } : item,
  )
}

async function loadItems(): Promise<void> {
  if (tabId.value === null) {
    throw new Error('未找到标签页')
  }

  const tab = await browser.tabs.get(tabId.value)
  if (!tab.url || !isDouyinFavoritesPage(tab.url)) {
    viewState.value = 'invalid-page'
    items.value = []
    return
  }

  pageUrl.value = tab.url
  importState.value = await getDouyinImportState()

  const results = await browser.scripting.executeScript({
    target: { tabId: tabId.value },
    func: collectFavoriteItemsFromPage,
  })

  const rawItems = Array.isArray(results[0]?.result) ? results[0].result : []
  const normalizedItems = rawItems.map((item) => ({
    ...item,
    url: normalizeDouyinWorkUrl(item.url, tab.url!),
  }))

  items.value = buildFavoriteItems(
    normalizedItems,
    new Set(importState.value.importedUrlSet),
    importState.value.lastImportedUrl,
  )

  viewState.value = 'ready'
}

async function pollNewItems(): Promise<void> {
  if (tabId.value === null || viewState.value === 'saving') return

  const results = await browser.scripting.executeScript({
    target: { tabId: tabId.value },
    func: collectFavoriteItemsFromPage,
  })

  const rawItems = Array.isArray(results[0]?.result) ? results[0].result : []
  const tab = await browser.tabs.get(tabId.value)
  const normalizedItems = rawItems.map((item) => ({
    ...item,
    url: normalizeDouyinWorkUrl(item.url, tab.url!),
  }))

  const existingIds = new Set(items.value.map((i) => i.videoId))
  const freshRaws = normalizedItems.filter((item) => !existingIds.has(item.videoId))

  // 截止点已在现有列表中，新抓到的都在截止点之后，全部默认不选中
  const cutoffSeen =
    !!importState.value.lastImportedUrl && existingIds.has(importState.value.lastImportedUrl)
  const newItems = buildFavoriteItems(
    freshRaws,
    new Set(importState.value.importedUrlSet),
    cutoffSeen ? (freshRaws[0]?.videoId ?? '') : importState.value.lastImportedUrl,
  )

  if (newItems.length > 0) {
    items.value = [...items.value, ...newItems]
  }
}

function startPolling(): void {
  if (pollTimer !== null) return
  pollTimer = setInterval(() => {
    pollNewItems().catch(() => {})
  }, 2000)
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function handleRefresh(): Promise<void> {
  stopPolling()
  errorMessage.value = ''
  viewState.value = 'checking'
  try {
    await loadItems()
    if (viewState.value as string === 'ready') startPolling()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    viewState.value = 'load-error'
  }
}

async function handleSaveAll(): Promise<void> {
  if (selectedCount.value === 0) return

  const settings = await getSettings()
  const clientId = settings.getNote.clientId.trim()
  const authToken = settings.getNote.authToken.trim()
  const intervalMs = Math.max(0, (settings.getNote.batchIntervalSeconds ?? 3)) * 1000

  if (!clientId || !authToken) {
    errorMessage.value = '请先在设置中填写 Get 笔记的 X-Client-ID 和 Authorization'
    return
  }

  errorMessage.value = ''
  viewState.value = 'saving'

  const successPrefix: string[] = []
  const pendingItems = items.value.filter((item) => item.selected && item.status === 'idle')

  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i]
    item.status = 'saving'

    try {
      await saveLinkNote({
        clientId,
        authToken,
        linkUrl: item.normalizedUrl,
      })
      item.status = 'success'
      successPrefix.push(item.videoId)
      if (intervalMs > 0 && i < pendingItems.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    } catch (error) {
      item.status = 'error'
      item.errorMessage = error instanceof Error ? error.message : String(error)
      errorMessage.value = item.errorMessage
      break
    }
  }

  if (successPrefix.length > 0) {
    const next = finalizePrefixProgress(importState.value.importedUrlSet, successPrefix)
    importState.value = {
      ...next,
      lastImportAt: new Date().toISOString(),
    }
    await saveDouyinImportState(importState.value)
  }

  viewState.value = 'ready'
}

onMounted(async () => {
  const rawTabId = new URLSearchParams(location.search).get('tabId')
  const parsed = Number(rawTabId)
  tabId.value = Number.isFinite(parsed) ? parsed : null

  try {
    await loadItems()
    if (viewState.value === 'ready') startPolling()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    viewState.value = 'load-error'
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="panel">
    <div class="panel-top">
      <div class="toolbar">
        <label class="toolbar-left">
          <input
            type="checkbox"
            class="toolbar-checkbox"
            :checked="allSelectableChecked"
            :disabled="selectableCount === 0 || viewState === 'saving'"
            @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
          />
          <span class="toolbar-title">作品</span>
        </label>
        <div class="toolbar-right">
          <button class="icon-button" title="刷新" @click="handleRefresh">刷新</button>
          <button class="primary" :disabled="selectedCount === 0 || viewState === 'saving'" @click="handleSaveAll">
            {{ viewState === 'saving' ? '保存中…' : '保存到Get笔记' }}
          </button>
        </div>
      </div>

      <div class="meta-row">
        <p class="meta">已选 {{ selectedCount }} / {{ selectableCount }}</p>
        <p class="meta">已导入 {{ importedCount }} 条</p>
      </div>

      <div v-if="viewState === 'ready' && items.length === 0" class="empty">未抓取到可导入的收藏作品。</div>
      <div v-else-if="viewState === 'checking'" class="empty">正在读取当前页面…</div>
      <div v-else-if="viewState === 'invalid-page'" class="empty">当前页不是抖音收藏页。</div>
      <div v-else-if="viewState === 'load-error'" class="empty">
        <p>读取收藏列表失败。</p>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      </div>

      <p v-if="errorMessage && viewState !== 'load-error'" class="error footer-error">{{ errorMessage }}</p>
    </div>

    <ul v-if="(viewState === 'ready' || viewState === 'saving') && items.length > 0" class="items">
      <li v-for="item in items" :key="item.normalizedUrl" class="item">
        <div class="item-main">
          <input
            v-model="item.selected"
            type="checkbox"
            class="item-checkbox"
            :disabled="item.status === 'saving' || item.status === 'skipped'"
          />
          <div class="item-text">
            <div class="item-title-row">
              <a class="item-title" :href="item.normalizedUrl" target="_blank" rel="noreferrer">
                {{ item.title || item.normalizedUrl }}
              </a>
              <span v-if="item.likesText" class="item-likes">{{ item.likesText }}</span>
            </div>
            <div v-if="item.status !== 'idle'" class="item-status-row">
              <span class="item-status" :data-status="item.status">
                <template v-if="item.status === 'skipped'">已导入</template>
                <template v-else-if="item.status === 'saving'">保存中…</template>
                <template v-else-if="item.status === 'success'">已保存</template>
                <template v-else-if="item.status === 'error'">失败</template>
              </span>
            </div>
            <div v-if="item.errorMessage" class="item-error">{{ item.errorMessage }}</div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.panel {
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  overflow: hidden;
}

.panel-top {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-bg);
  padding: 16px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--color-border);
}

.page-url,
.meta,
.item-likes {
  font-size: 12px;
  color: var(--color-text-muted);
  word-break: break-all;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-left {
  min-width: 0;
}

.toolbar-checkbox,
.item-checkbox {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 600;
}

.icon-button {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.items {
  list-style: none;
  margin: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
}

.item {
  padding: 12px 0;
}

.item-main {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.item-text {
  min-width: 0;
  flex: 1;
}

.item-title {
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
  text-decoration: none;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.item-status {
  font-size: 12px;
  text-transform: uppercase;
}

.item-status-row {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.item-status[data-status='success'] {
  color: #2e7d32;
}

.item-status[data-status='error'] {
  color: #c62828;
}

.item-status[data-status='skipped'] {
  color: var(--color-text-muted);
  background: var(--color-border);
  padding: 1px 6px;
  border-radius: 3px;
}

.item-error,
.error {
  color: #c62828;
  font-size: 12px;
}

.empty {
  padding: 24px 16px;
  color: var(--color-text-muted);
}

.primary,
.secondary {
  border: none;
  border-radius: 3px;
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
}

.primary {
  background: var(--color-accent);
  color: #fff;
}

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary {
  background: var(--color-dark);
  color: #fff;
}

.footer-meta,
.footer-error {
  font-size: 12px;
}
</style>
