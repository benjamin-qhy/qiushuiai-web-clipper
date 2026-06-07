import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser } from 'wxt/browser'
import type { MessageRequest, MessageResponse, DocContent } from '../src/types'
import { scrollAndCollectKdocsBlocks } from '../src/extractor/kdocs/collect'

export default defineContentScript({
  matches: ['*://*.kdocs.cn/l/*'],

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
  const { container, blocks } = await scrollAndCollectKdocsBlocks()
  if (!container) {
    return { ok: false, error: '找不到金山文档内容容器，请确认当前页面是金山文档。' }
  }

  const titleBlock = blocks.find(b => b.type === 'page')
  const title = titleBlock?.spans?.map(s => s.text).join('').trim() ||
    document.title.replace(/\s*[-–]\s*金山文档.*$/i, '').trim()

  const author = extractAuthor()
  const published = extractPublished()

  const data: DocContent = {
    title,
    source: location.href,
    author: author ?? undefined,
    published: published ?? undefined,
    created: new Date().toISOString().slice(0, 10),
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

function extractAuthor(): string | null {
  return document.querySelector('.title-foot-info-name')?.textContent?.trim() ?? null
}

function extractPublished(): string | null {
  const timeEl = document.querySelector('.title-foot-info-update-time')
  if (!timeEl) return null

  const spans = [...timeEl.querySelectorAll('span')]
  const dateSpan = spans.find(s => /^\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(s.textContent?.trim() ?? ''))
  if (!dateSpan) return null

  const raw = dateSpan.textContent!.trim()
  const year = new Date().getFullYear()
  const parsed = new Date(`${year}-${raw.slice(0, 5)}`)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}
