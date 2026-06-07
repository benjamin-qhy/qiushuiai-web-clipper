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

const creatingIn = ref<string | null>(null)
const newFolderTitle = ref('')
const editingId = ref<string | null>(null)
const editingTitle = ref('')

function startCreate(parentId: string) {
  creatingIn.value = parentId
  newFolderTitle.value = ''
}

function confirmCreate(parentId: string) {
  if (creatingIn.value !== parentId) return

  const title = newFolderTitle.value.trim()
  creatingIn.value = null
  newFolderTitle.value = ''

  if (title) {
    emit('createFolder', parentId, title)
  }
}

function startRename(node: FolderNode) {
  editingId.value = node.id
  editingTitle.value = node.title
}

function confirmRename(id: string) {
  if (editingId.value !== id) return

  const title = editingTitle.value.trim()
  editingId.value = null
  editingTitle.value = ''

  if (title) {
    emit('renameFolder', id, title)
  }
}

function onDragOver(e: DragEvent, folderId: string) {
  e.preventDefault()
  emit('dragOver', folderId)
}

function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Element | null
  if (related && (e.currentTarget as Element).contains(related)) return
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
            autofocus
            @keyup.enter="confirmRename(node.id)"
            @keyup.escape="editingId = null"
            @blur="confirmRename(node.id)"
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
      <div v-if="creatingIn === node.id" class="folder-row new-folder-row">
        <input
          class="inline-input"
          v-model="newFolderTitle"
          autofocus
          placeholder="文件夹名称"
          @keyup.enter="confirmCreate(node.id)"
          @keyup.escape="creatingIn = null"
          @blur="confirmCreate(node.id)"
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
        @create-folder="(parentId, title) => emit('createFolder', parentId, title)"
        @rename-folder="(id, title) => emit('renameFolder', id, title)"
        @delete-folder="(id) => emit('deleteFolder', id)"
        @move-folder="(folderId, targetId) => emit('moveFolder', folderId, targetId)"
        @move-bookmark="(bmId, folderId) => emit('moveBookmark', bmId, folderId)"
        @drag-over="(id) => emit('dragOver', id)"
      />
    </li>
  </ul>
</template>

<style scoped>
.folder-list { list-style: none; margin: 0; padding: 0; }
.folder-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  cursor: pointer;
  user-select: none;
  position: relative;
}
.folder-row:hover { background: var(--color-border-light); }
.folder-row.selected {
  background: var(--color-dark);
  color: #fff;
}
.folder-row.selected .folder-name { color: #fff; }
.folder-row.selected .expand-btn { color: rgba(255,255,255,0.6); }
.folder-row.selected .inline-input {
  background: #fff;
  color: var(--color-text);
  border-bottom-color: var(--color-accent);
}
.folder-row.drag-over {
  background: #fff3e0;
  outline: 1px solid var(--color-accent);
}
.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-muted);
  width: 14px;
  flex-shrink: 0;
  padding: 0;
}
.folder-name {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-actions {
  display: none;
  gap: 1px;
  align-items: center;
}
.folder-row:hover .folder-actions { display: flex; }
.folder-row.selected .folder-actions { display: flex; }
.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-muted);
  padding: 1px 4px;
  border-radius: 2px;
}
.folder-row.selected .action-btn { color: rgba(255,255,255,0.6); }
.folder-row.selected .action-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.action-btn:hover { background: var(--color-border); color: var(--color-text); }
.action-btn.danger:hover { background: #fce8e6; color: #c62828; }
.new-folder-row { padding-left: 30px; }
.inline-input {
  flex: 1;
  font-size: 14px;
  border: 1px solid var(--color-accent);
  padding: 1px 4px;
  outline: none;
  background: #fff;
  font-family: var(--font-ui);
  color: var(--color-text);
  border-radius: 2px;
  min-width: 0;
}
</style>
