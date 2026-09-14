import { browser } from 'wxt/browser'
import { getSettings } from '../src/storage/settings'
import type { ProcessingStatus } from '../src/storage/bookmarks'
import { createDefaultAIProvider } from '../src/ai/index'
import { fetchPageMeta } from '../src/bookmark/meta'
import { processBookmark } from '../src/bookmark/classify'
import { isDouyinFavoritesPage } from '../src/douyin/collect'
import type { Browser } from 'wxt/browser'

type BookmarkTreeNode = Browser.bookmarks.BookmarkTreeNode
const sidePanel = browser.sidePanel as typeof browser.sidePanel | undefined

let processingStatus: ProcessingStatus = {
  state: 'idle',
  total: 0,
  processed: 0,
  lastRunAt: null,
}

export function getProcessingStatus(): ProcessingStatus {
  return processingStatus
}

async function triggerProcessing(): Promise<void> {
  if (processingStatus.state === 'running') return

  processingStatus = {
    state: 'running',
    total: 0,
    processed: 0,
    lastRunAt: null,
  }

  try {
    const settings = await getSettings()
    const inboxFolderName = settings.bookmarkInboxFolder

    const searchResults = await browser.bookmarks.search({ title: inboxFolderName })
    const inboxFolder = searchResults.find((r: BookmarkTreeNode) => !r.url)
    if (!inboxFolder || !inboxFolder.parentId) {
      processingStatus = { ...processingStatus, state: 'done', lastRunAt: Date.now() }
      return
    }

    const parentId = inboxFolder.parentId

    const children = await browser.bookmarks.getChildren(inboxFolder.id)
    const bookmarks = children.filter((c: BookmarkTreeNode) => !!c.url)

    processingStatus.total = bookmarks.length

    const aiProvider = createDefaultAIProvider(settings)

    for (const bm of bookmarks) {
      if (!bm.url) continue
      try {
        let meta = await fetchPageMeta(bm.url).catch(() => ({ title: bm.title ?? '', keywords: '', description: '' }))
        if (!meta.title) meta = { title: bm.title ?? '', keywords: '', description: '' }

        await processBookmark(bm.id, meta, bm.url, bm.title ?? '', parentId, settings.bookmarkInboxFolder, settings.bookmarkSystemPrompt, aiProvider)
        processingStatus.processed++
      } catch {
        // Skip failed bookmark and continue with the rest
      }
    }

    processingStatus = { ...processingStatus, state: 'done', lastRunAt: Date.now() }
  } catch (err) {
    processingStatus = {
      ...processingStatus,
      state: 'error',
      lastRunAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function handleMessage(msg: { type: string; url?: string }): Promise<unknown> {
  if (msg.type === 'PROCESS_BOOKMARKS') {
    triggerProcessing()
    return { ok: true }
  }

  if (msg.type === 'GET_PROCESSING_STATUS') {
    return getProcessingStatus()
  }

  return undefined
}

async function syncTabAction(tabId: number, url?: string): Promise<void> {
  const popup = url && isDouyinFavoritesPage(url) ? '' : 'popup.html'
  await browser.action.setPopup({ tabId, popup })

  if (!sidePanel) return

  if (url && isDouyinFavoritesPage(url)) {
    await sidePanel.setOptions({
      tabId,
      enabled: true,
      path: `douyin-sidepanel.html?tabId=${tabId}`,
    })
    return
  }

  await sidePanel.setOptions({
    tabId,
    enabled: false,
  })
}

async function syncActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  await syncTabAction(tab.id, tab.url)
}

export default defineBackground({
  main() {
    if (sidePanel) {
      sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => null)
      sidePanel.setOptions({ enabled: false }).catch(() => null)
    }

    browser.action.onClicked.addListener((tab) => {
      if (!tab.id || !tab.url) return
      if (isDouyinFavoritesPage(tab.url) && sidePanel) {
        sidePanel.open({ tabId: tab.id }).catch(() => null)
      }
    })

    browser.runtime.onInstalled.addListener(() => {
      syncActiveTab().catch(() => null)
    })

    browser.runtime.onStartup.addListener(() => {
      syncActiveTab().catch(() => null)
    })

    browser.tabs.onActivated.addListener(({ tabId }) => {
      browser.tabs.get(tabId).then((tab) => syncTabAction(tabId, tab.url)).catch(() => null)
    })

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const nextUrl = typeof changeInfo.url === 'string' ? changeInfo.url : tab.url
      if (!nextUrl) return
      syncTabAction(tabId, nextUrl).catch(() => null)
    })

    browser.runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
      if (!msg || typeof (msg as { type?: unknown }).type !== 'string') {
        sendResponse(undefined)
        return true
      }
      handleMessage(msg as { type: string; url?: string }).then(sendResponse)
      return true
    })
  },
})
