import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser } from 'wxt/browser'
import type { MessageRequest, MessageResponse, DocContent } from '../src/types'
import { scrollAndCollectBlocks } from '../src/extractor/collect'

export default defineContentScript({
  matches: ['*://*.feishu.cn/docx/*', '*://*.feishu.cn/wiki/*'],

  main() {
    browser.runtime.onMessage.addListener(
      (message: MessageRequest, _sender: unknown, sendResponse: (r: MessageResponse) => void) => {
        if (message.type === 'EXTRACT_DOC') {
          extractDoc().then(sendResponse).catch(err =>
            sendResponse({ ok: false, error: String(err) })
          )
          return true
        }
        if (message.type === 'DOWNLOAD_IMAGE') {
          downloadImage(message.url).then(sendResponse).catch(err =>
            sendResponse({ ok: false, error: String(err) })
          )
          return true
        }
      }
    )
  },
})

async function extractDoc(): Promise<MessageResponse> {
  const { container, blocks, description } = await scrollAndCollectBlocks()
  if (!container) {
    return { ok: false, error: '找不到飞书文档内容容器，请确认当前页面是飞书文档。' }
  }

  const titleBlock = blocks.find(b => b.type === 'page')
  const title = titleBlock?.spans?.map(s => s.text).join('') ??
    document.title.replace(' - 飞书文档', '').trim()

  const author = extractMeta('author') ?? extractMeta('feishu:creator')
  const published = extractMeta('article:published_time') ??
    extractMeta('feishu:create_time')

  const data: DocContent = {
    title,
    source: location.href,
    author: author ?? undefined,
    published: published ? published.slice(0, 10) : undefined,
    created: new Date().toISOString().slice(0, 10),
    description: description || undefined,
    blocks: blocks.filter(b => b.type !== 'page'),
  }

  return { ok: true, data }
}

async function downloadImage(url: string): Promise<MessageResponse> {
  if (url.startsWith('blob:')) return { ok: false, error: 'blob URL not downloadable' }
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { ok: true, base64, mimeType: blob.type || 'image/jpeg' }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

function extractMeta(name: string): string | null {
  return (
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
    null
  )
}
