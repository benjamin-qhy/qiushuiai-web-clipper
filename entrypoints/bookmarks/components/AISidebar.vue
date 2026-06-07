<!-- entrypoints/bookmarks/components/AISidebar.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { browser } from 'wxt/browser'
import { useBookmarkProcess } from '../../../src/composables/useBookmarkProcess'
import { useVaultStore } from '../../../src/composables/useVaultStore'
import { getAllBookmarkRecords, type BookmarkRecord } from '../../../src/storage/bookmarks'
import { getSettings } from '../../../src/storage/settings'
import { exportBookmarksToVault } from '../../../src/bookmark/export'

const processor = useBookmarkProcess()
const vault = useVaultStore()

const exportState = ref<'idle' | 'exporting' | 'done' | 'error'>('idle')
const exportError = ref('')

onMounted(() => vault.init())

async function handleExport() {
  if (exportState.value === 'exporting') return
  exportState.value = 'exporting'
  exportError.value = ''
  try {
    if (!vault.isAuthorized.value) {
      if (vault.needsReauth.value) {
        await vault.reauthorize()
      } else {
        await vault.authorize()
      }
    }
    if (!vault.handle.value) throw new Error('未选择 Obsidian vault')
    const settings = await getSettings()
    const recordList = await getAllBookmarkRecords()
    const records = new Map<string, BookmarkRecord>(recordList.map(r => [r.id, r]))
    await exportBookmarksToVault(vault.handle.value, settings.bookmarkSubDir, records)
    exportState.value = 'done'
    setTimeout(() => { exportState.value = 'idle' }, 3000)
  } catch (e) {
    exportState.value = 'error'
    exportError.value = e instanceof Error ? e.message : String(e)
    setTimeout(() => { exportState.value = 'idle' }, 4000)
  }
}

const sidebarWidth = ref(320)
let dragStartX = 0
let dragStartWidth = 0

function onDragStart(e: MouseEvent) {
  dragStartX = e.clientX
  dragStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onDragMove(e: MouseEvent) {
  const delta = dragStartX - e.clientX
  sidebarWidth.value = Math.min(600, Math.max(240, dragStartWidth + delta))
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

function openSettings() {
  browser.tabs.create({ url: '/options.html' })
}
</script>

<template>
  <aside class="sidebar" :style="{ width: `${sidebarWidth}px` }">
    <div class="drag-handle" @mousedown="onDragStart" />

    <div class="sidebar-header">
      <span class="sidebar-title">AI 整理</span>
      <button class="btn-icon" title="设置" @click="openSettings">⚙</button>
    </div>

    <!-- Action -->
    <div class="action-area">
      <button
        class="btn-process"
        :disabled="processor.state.value === 'processing'"
        @click="processor.start()"
      >
        <span v-if="processor.state.value === 'processing' && !processor.isMoving.value">
          整理中… {{ processor.progress.value.done }}/{{ processor.progress.value.total }}
        </span>
        <span v-else>▶ 整理「待整理」文件夹</span>
      </button>
      <button
        v-if="processor.state.value === 'processing'"
        class="btn-process btn-stop"
        @click="processor.stop()"
      >
        ■ 停止整理
      </button>
      <button
        v-else
        class="btn-process btn-reprocess"
        @click="processor.startAll()"
      >
        <span v-if="processor.isMoving.value">
          搬移中… {{ processor.moveProgress.value.done }}/{{ processor.moveProgress.value.total }}
        </span>
        <span v-else>↺ 重新整理所有书签</span>
      </button>
      <button
        class="btn-process btn-export"
        :disabled="exportState === 'exporting'"
        @click="handleExport"
      >
        <span v-if="exportState === 'exporting'">导出中…</span>
        <span v-else-if="exportState === 'done'">✓ 导出完成</span>
        <span v-else-if="exportState === 'error'" :title="exportError">✕ 导出失败</span>
        <span v-else>↑ 导出到 Obsidian</span>
      </button>
    </div>

    <!-- Current item indicator -->
    <div v-if="processor.currentItem.value" class="current-item">
      <span class="current-index">{{ processor.currentItem.value.index }}/{{ processor.currentItem.value.total }}</span>
      <span class="current-phase">{{ processor.currentItem.value.phase }}</span>
      <span class="current-url">{{ processor.currentItem.value.url }}</span>
    </div>

    <!-- Log -->
    <div class="log-area">
      <div v-if="processor.log.value.length === 0" class="log-empty">
        <span v-if="processor.state.value === 'idle'">点击上方按钮开始整理</span>
        <span v-else-if="processor.state.value === 'processing'">正在处理…</span>
        <span v-else-if="processor.state.value === 'error'">出错，请检查配置</span>
      </div>

      <div
        v-for="(entry, i) in processor.log.value"
        :key="i"
        class="log-entry"
        :class="entry.status"
      >
        <span class="log-status">
          <span v-if="entry.status === 'ok'">✓</span>
          <span v-else-if="entry.status === 'warning'">✗</span>
          <span v-else>⊘</span>
        </span>
        <span class="log-time">{{ entry.time }}</span>
        <span class="log-body">
          <template v-if="entry.status !== 'error'">
            <a class="log-title" :href="entry.url" target="_blank" :title="entry.url">{{ entry.title }}</a>
            <span class="log-arrow">→</span>
            <span class="log-folder">{{ entry.folder }}</span>
            <span v-if="entry.warning" class="log-warning">（{{ entry.warning }}）</span>
          </template>
          <template v-else>
            <span class="log-title error-title">{{ entry.title }}</span>
            <span class="log-error">{{ entry.error }}</span>
          </template>
        </span>
      </div>

      <div v-if="processor.state.value === 'done' && processor.log.value.length > 0" class="log-summary">
        完成：共 {{ processor.progress.value.total }} 条，
        成功 {{ processor.log.value.filter(e => e.status === 'ok').length }} 条
        <template v-if="processor.log.value.filter(e => e.status === 'warning').length > 0">
          ，警告 {{ processor.log.value.filter(e => e.status === 'warning').length }} 条
        </template>
        <template v-if="processor.log.value.filter(e => e.status === 'error').length > 0">
          ，失败 {{ processor.log.value.filter(e => e.status === 'error').length }} 条
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  flex-shrink: 0;
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
}
.drag-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.drag-handle:hover { background: var(--color-border); }

/* Header */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg);
}
.sidebar-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.5px;
}
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 26px;
  color: var(--color-text-muted);
  padding: 0 3px;
  line-height: 1;
}
.btn-icon:hover { color: var(--color-accent); }

/* Action */
.action-area {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.btn-process {
  width: 100%;
  padding: 10px 16px;
  background: var(--color-dark);
  color: #fff;
  border: none;
  border-radius: 2px;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-ui);
  cursor: pointer;
  text-align: center;
  letter-spacing: 0.3px;
}
.btn-process + .btn-process { margin-top: 8px; }
.btn-reprocess {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.btn-reprocess:hover:not(:disabled) { background: var(--color-border-light); opacity: 1; }
.btn-stop {
  background: var(--color-surface);
  color: #c62828;
  border: 1px solid #c62828;
}
.btn-stop:hover { background: #fff5f5; opacity: 1; }
.btn-export {
  background: var(--color-surface);
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
}
.btn-export:hover:not(:disabled) { background: #fff8f0; opacity: 1; }
.btn-process:hover { opacity: 0.85; }
.btn-process:disabled { opacity: 0.5; cursor: not-allowed; }

/* Current item */
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
.current-index {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}
.current-phase {
  font-size: 14px;
  color: var(--color-text-muted);
}
.current-url {
  font-size: 14px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Log */
.log-area {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0 16px;
}
.log-empty {
  padding: 32px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted);
}
.log-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 16px;
  font-size: 14px;
  line-height: 1.5;
  border-bottom: 1px solid var(--color-border-light);
}
.log-status {
  flex-shrink: 0;
  font-size: 14px;
  width: 14px;
}
.log-entry.ok .log-status { color: #2e7d32; }
.log-entry.warning .log-status { color: #e65100; }
.log-entry.error .log-status { color: #c62828; }
.log-entry:last-of-type { border-bottom: none; }
.log-time {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}
.log-body {
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 0;
}
.log-title {
  color: var(--color-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
  flex-shrink: 0;
}
a.log-title {
  text-decoration: none;
}
a.log-title:hover { color: var(--color-accent); text-decoration: underline; }
.error-title { color: var(--color-text-secondary); }
.log-arrow {
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.log-folder {
  color: var(--color-accent);
  font-weight: 600;
  white-space: nowrap;
}
.log-warning {
  color: #e65100;
  font-size: 14px;
}
.log-error {
  color: #c62828;
  font-size: 14px;
  word-break: break-word;
}
.log-summary {
  padding: 10px 16px 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
</style>
