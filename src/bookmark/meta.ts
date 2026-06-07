import { browser } from 'wxt/browser'
import type { MessageResponse, DocContent, Block } from '../types'

export interface PageMeta {
  title: string
  keywords: string
  description: string
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .filter(b => b.spans?.length)
    .map(b => b.spans!.map(s => s.text).join(''))
    .join(' ')
}

function extractDescription(doc: DocContent): string {
  if (doc.description) return doc.description
  const body = doc.markdown ?? blocksToText(doc.blocks)
  return body.slice(0, 500)
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false

    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener)
      if (!resolved) reject(new Error('页面加载超时'))
    }, timeoutMs)

    function listener(id: number, changeInfo: { status?: string }) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer)
        browser.tabs.onUpdated.removeListener(listener)
        resolved = true
        resolve()
      }
    }
    browser.tabs.onUpdated.addListener(listener)

    browser.tabs.get(tabId).then(t => {
      if (t.status === 'complete' && !resolved) {
        clearTimeout(timer)
        browser.tabs.onUpdated.removeListener(listener)
        resolved = true
        resolve()
      }
    }).catch(() => {})
  })
}

export async function fetchPageMeta(url: string, timeoutMs = 30000): Promise<PageMeta> {
  const tab = await browser.tabs.create({ url, active: false })
  if (tab.id === undefined) throw new Error('无法获取标签页 ID')
  const tabId = tab.id

  try {
    await waitForTabComplete(tabId, timeoutMs)

    try {
      const response = await browser.tabs.sendMessage(tabId, { type: 'EXTRACT_DOC' }) as MessageResponse
      if (response.ok && 'data' in response) {
        const doc = response.data as DocContent
        return {
          title: doc.title || '',
          keywords: '',
          description: extractDescription(doc),
        }
      }
    } catch {
      // content script 未响应，降级读 meta 标签
    }

    // 降级：读 meta 标签
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
          document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ?? ''
        return {
          title: document.title,
          keywords: getMeta('keywords'),
          description: getMeta('og:description') || getMeta('twitter:description') || getMeta('description'),
        }
      },
    })
    const raw = results[0]?.result as { title: string; keywords: string; description: string } | undefined
    return raw ?? { title: '', keywords: '', description: '' }
  } finally {
    await browser.tabs.remove(tabId)
  }
}
