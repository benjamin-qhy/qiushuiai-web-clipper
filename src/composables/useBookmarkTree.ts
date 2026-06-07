// src/composables/useBookmarkTree.ts
import { ref } from 'vue'
import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import { getSettings } from '../storage/settings'
import { getAllBookmarkRecords } from '../storage/bookmarks'
import type { BookmarkRecord } from '../storage/bookmarks'

const BAR_TITLES = new Set(['书签栏', 'Bookmarks bar', 'Bookmarks Bar'])

export type BookmarkNode = Browser.bookmarks.BookmarkTreeNode
export interface BookmarkListItem extends BookmarkNode {
  folderPath: string
}

export interface FolderNode {
  id: string
  title: string
  parentId?: string
  children: FolderNode[]
  expanded: boolean
}

export interface SelectedFolderStats {
  directBookmarkCount: number
  recursiveBookmarkCount: number
  childFolderCount: number
}

export function useBookmarkTree() {
  const folderTree = ref<FolderNode[]>([])
  const selectedFolderId = ref<string | null>(null)
  const selectedBookmarks = ref<BookmarkListItem[]>([])
  const selectedFolderStats = ref<SelectedFolderStats>({
    directBookmarkCount: 0,
    recursiveBookmarkCount: 0,
    childFolderCount: 0,
  })
  const processedIds = ref<Set<string>>(new Set())
  const recordsMap = ref<Map<string, BookmarkRecord>>(new Map())
  const dragOverFolderId = ref<string | null>(null)
  const expandedIds = ref<Set<string>>(new Set())
  const error = ref<string | null>(null)
  const creatingFolderKeys = new Set<string>()
  const folderPathById = ref<Map<string, string>>(new Map())

  function buildFolderPathById(nodes: BookmarkNode[], ancestors: string[] = []): Map<string, string> {
    const map = new Map<string, string>()
    const ignoredTitles = new Set(['书签栏', 'Bookmarks Bar'])

    function visit(node: BookmarkNode, parentTitles: string[]) {
      if (node.url) return

      const nextTitles = ignoredTitles.has(node.title)
        ? parentTitles
        : node.title
          ? [...parentTitles, node.title]
          : parentTitles

      map.set(node.id, nextTitles.join('/'))

      for (const child of node.children ?? []) {
        visit(child, nextTitles)
      }
    }

    for (const node of nodes) {
      visit(node, ancestors)
    }

    return map
  }

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
    try {
      const roots = await browser.bookmarks.getTree()
      if (roots.length === 0) return
      // roots[0] is the invisible root; its children are Bookmarks Bar, Other Bookmarks, etc.
      const allChildren = roots[0].children ?? []
      const bar = allChildren.find(n => !n.url && BAR_TITLES.has(n.title)) ?? allChildren[0]
      if (bar && !expandedIds.value.has(bar.id)) expandedIds.value.add(bar.id)
      const barNodes = bar ? [bar] : []
      folderTree.value = buildFolderTree(barNodes)
      folderPathById.value = buildFolderPathById(barNodes)

      const records = await getAllBookmarkRecords()
      processedIds.value = new Set(records.map(r => r.id))
      recordsMap.value = new Map(records.map(r => [r.id, r]))
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function selectFolder(folderId: string) {
    selectedFolderId.value = folderId
    const subtree = await browser.bookmarks.getSubTree(folderId)
    const rootChildren = subtree[0]?.children ?? []
    const bookmarks: BookmarkListItem[] = []

    function collectBookmarks(nodes: BookmarkNode[]) {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            ...node,
            folderPath: folderPathById.value.get(node.parentId ?? '') ?? '',
          })
        }
        if (node.children) collectBookmarks(node.children)
      }
    }

    collectBookmarks(rootChildren)
    selectedBookmarks.value = bookmarks
    selectedFolderStats.value = {
      directBookmarkCount: rootChildren.filter(node => !!node.url).length,
      recursiveBookmarkCount: bookmarks.length,
      childFolderCount: rootChildren.filter(node => !node.url).length,
    }
  }

  async function toggleExpand(folderId: string) {
    const next = new Set(expandedIds.value)
    if (next.has(folderId)) {
      next.delete(folderId)
    } else {
      next.add(folderId)
    }
    expandedIds.value = next
    await loadTree()
  }

  async function createFolder(parentId: string, title: string): Promise<void> {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) return

    const key = `${parentId}\u0000${normalizedTitle}`
    if (creatingFolderKeys.has(key)) return
    creatingFolderKeys.add(key)

    try {
      const siblings = await browser.bookmarks.getChildren(parentId)
      const existingFolder = siblings.find(n => !n.url && n.title === normalizedTitle)
      if (!existingFolder) {
        await browser.bookmarks.create({ parentId, title: normalizedTitle })
      }
      await loadTree().catch(() => {})
    } finally {
      creatingFolderKeys.delete(key)
    }
  }

  async function renameFolder(id: string, title: string): Promise<void> {
    await browser.bookmarks.update(id, { title })
    await loadTree().catch(() => {})
  }

  async function deleteFolder(folderId: string): Promise<void> {
    // 1. Find 待整理 folder
    const settings = await getSettings()
    const inboxName = settings.bookmarkInboxFolder
    const results = await browser.bookmarks.search({ title: inboxName })
    const inbox = results.find(r => !r.url)

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

    // 3. Move each bookmark to inbox (if inbox exists), otherwise just delete them
    if (inbox) {
      for (const bm of bookmarkNodes) {
        await browser.bookmarks.move(bm.id, { parentId: inbox.id })
      }
    }

    // 4. Remove the folder tree (removeTree handles non-empty folders too)
    await browser.bookmarks.removeTree(folderId)
    await loadTree().catch(() => {})

    // If deleted folder was selected, clear selection
    if (selectedFolderId.value === folderId) {
      selectedFolderId.value = null
      selectedBookmarks.value = []
      selectedFolderStats.value = {
        directBookmarkCount: 0,
        recursiveBookmarkCount: 0,
        childFolderCount: 0,
      }
    }
  }

  async function moveFolder(folderId: string, targetParentId: string): Promise<void> {
    await browser.bookmarks.move(folderId, { parentId: targetParentId })
    await loadTree().catch(() => {})
  }

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
    selectedFolderStats,
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
}
