import { browser } from 'wxt/browser'
import { isDouyinFavoritesPage } from '../src/douyin/collect'

import { registerPublishingConnection } from '../MultiPost-Extension/src/haiqiai/connection'

const sidePanel = browser.sidePanel as typeof browser.sidePanel | undefined

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
    if (!import.meta.env.FIREFOX) registerPublishingConnection()
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
  },
})
