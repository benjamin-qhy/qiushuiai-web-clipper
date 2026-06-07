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

const BAR_TITLES = new Set(['书签栏', 'Bookmarks bar', 'Bookmarks Bar'])

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

async function findBookmarksBar(): Promise<BookmarkNode | null> {
  const roots = await browser.bookmarks.getTree()
  const children = roots[0]?.children ?? []
  return children.find(n => !n.url && BAR_TITLES.has(n.title)) ?? children[0] ?? null
}

async function findOrCreateInbox(inboxName: string, barId: string): Promise<BookmarkNode> {
  const results = await browser.bookmarks.search({ title: inboxName })
  const existing = results.find((r: BookmarkNode) => !r.url)
  if (existing) return existing
  return await browser.bookmarks.create({ parentId: barId, title: inboxName })
}

function collectBookmarks(nodes: BookmarkNode[], excludeId: string): BookmarkNode[] {
  const result: BookmarkNode[] = []
  for (const node of nodes) {
    if (node.id === excludeId) continue
    if (node.url) result.push(node)
    else result.push(...collectBookmarks(node.children ?? [], excludeId))
  }
  return result
}

export function useBookmarkProcess() {
  const state = ref<'idle' | 'processing' | 'done' | 'error'>('idle')
  const log = ref<LogEntry[]>([])
  const progress = ref({ done: 0, total: 0 })
  const currentItem = ref<CurrentItem | null>(null)
  const moveProgress = ref({ done: 0, total: 0 })
  const isMoving = ref(false)
  let stopRequested = false

  function stop() {
    stopRequested = true
  }

  async function processInbox(
    inboxId: string,
    barId: string,
    inboxName: string,
    bookmarkSystemPrompt: string,
    aiProvider: ReturnType<typeof createAIProvider>,
  ): Promise<void> {
    const children = await browser.bookmarks.getChildren(inboxId)
    const bookmarks = children.filter((c: BookmarkNode) => !!c.url)
    progress.value = { done: 0, total: bookmarks.length }

    if (bookmarks.length === 0) return

    for (let i = 0; i < bookmarks.length; i++) {
      if (stopRequested) break
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

      console.log('[bookmark] 页面信息', { url: bm.url, ...meta })

      try {
        currentItem.value = { ...currentItem.value, phase: 'AI 整理中…' }
        const { folderPath, title, summary, tags } = await processBookmark(
          bm.id,
          meta,
          bm.url,
          bm.title ?? '',
          barId,
          inboxName,
          bookmarkSystemPrompt,
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
  }

  async function start(): Promise<void> {
    if (state.value === 'processing') return

    stopRequested = false
    state.value = 'processing'
    log.value = []
    progress.value = { done: 0, total: 0 }
    currentItem.value = null

    try {
      const settings = await getSettings()

      const bar = await findBookmarksBar()
      if (!bar) {
        state.value = 'error'
        log.value.unshift({
          time: nowTime(),
          title: '未找到书签栏',
          url: '',
          folder: '',
          status: 'error',
          error: '无法找到书签栏，请检查浏览器书签',
        })
        return
      }

      const inbox = await findOrCreateInbox(settings.bookmarkInboxFolder, bar.id)
      const aiProvider = createAIProvider(settings.aiConfig)
      await processInbox(inbox.id, inbox.parentId ?? bar.id, settings.bookmarkInboxFolder, settings.bookmarkSystemPrompt, aiProvider)

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

  async function startAll(): Promise<void> {
    if (state.value === 'processing') return

    stopRequested = false
    state.value = 'processing'
    log.value = []
    progress.value = { done: 0, total: 0 }
    moveProgress.value = { done: 0, total: 0 }
    currentItem.value = null
    isMoving.value = false

    try {
      const settings = await getSettings()

      const bar = await findBookmarksBar()
      if (!bar) {
        state.value = 'error'
        log.value.unshift({
          time: nowTime(),
          title: '未找到书签栏',
          url: '',
          folder: '',
          status: 'error',
          error: '无法找到书签栏，请检查浏览器书签',
        })
        return
      }

      const inbox = await findOrCreateInbox(settings.bookmarkInboxFolder, bar.id)
      const barSubtree = await browser.bookmarks.getSubTree(bar.id)
      const toMove = collectBookmarks(barSubtree[0]?.children ?? [], inbox.id)

      if (toMove.length > 0) {
        isMoving.value = true
        moveProgress.value = { done: 0, total: toMove.length }
        for (const bm of toMove) {
          await browser.bookmarks.move(bm.id, { parentId: inbox.id })
          moveProgress.value.done++
        }
        isMoving.value = false
      }

      const aiProvider = createAIProvider(settings.aiConfig)
      await processInbox(inbox.id, inbox.parentId ?? bar.id, settings.bookmarkInboxFolder, settings.bookmarkSystemPrompt, aiProvider)

      state.value = 'done'
      currentItem.value = null
    } catch (e) {
      state.value = 'error'
      isMoving.value = false
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

  return { state, log, progress, currentItem, moveProgress, isMoving, start, startAll, stop }
}
