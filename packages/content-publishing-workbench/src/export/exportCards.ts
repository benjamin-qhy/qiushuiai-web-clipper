import { Zip, ZipPassThrough } from 'fflate'
import { toBlob as domToBlob } from 'html-to-image'
import type { DisplayPage } from '../card/CardCanvas'
import { CARD_GEOMETRY } from '../layout/MeasureStage'

interface PngRenderOptions {
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
  pixelRatio: number
  cacheBust: boolean
}

type PngRenderer = (node: HTMLElement, options: PngRenderOptions) => Promise<Blob | null>

export interface SequentialZipSink {
  append(name: string, data: Blob, signal?: AbortSignal): Promise<void>
  close(): Promise<Blob>
}

interface ExportCardsToZipOptions {
  pages: DisplayPage[]
  title: string
  renderPage(page: DisplayPage): Promise<HTMLElement>
  renderToPng?: (node: HTMLElement, signal?: AbortSignal) => Promise<Blob>
  sink?: SequentialZipSink
  signal?: AbortSignal
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const MAX_TITLE_BYTES = 180
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  let result = ''
  let byteLength = 0
  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength
    if (byteLength + characterBytes > maxBytes) break
    result += character
    byteLength += characterBytes
  }
  return result
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('导出已取消', 'AbortError')
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      try {
        throwIfAborted(signal)
      } catch (error) {
        reject(error)
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export function safeExportTitle(title: string): string {
  let safe = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[ .-]+|[ .-]+$/g, '')
  safe = truncateUtf8(safe, MAX_TITLE_BYTES).replace(/[ .-]+$/g, '')
  if (!safe) return 'xiaohongshu-cards'
  return WINDOWS_RESERVED_NAME.test(safe) ? `_${safe}` : safe
}

export function buildPageFileName(title: string, pageIndex: number, pageCount: number): string {
  const digits = Math.max(2, String(pageCount).length)
  return `${safeExportTitle(title)}-${String(pageIndex + 1).padStart(digits, '0')}.png`
}

export async function waitForExportAssets(node: HTMLElement, signal?: AbortSignal): Promise<void> {
  if (document.fonts?.ready) await raceWithAbort(document.fonts.ready.then(() => undefined), signal)
  const images = Array.from(node.querySelectorAll('img'))
  await raceWithAbort(Promise.all(images.map(async image => {
    if (typeof image.decode === 'function') {
      await image.decode()
      return
    }
    if (image.complete && image.naturalWidth > 0) return
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error('卡片图片加载失败')), { once: true })
    })
  })).then(() => undefined), signal)
}

export function assertCardNode(node: HTMLElement): void {
  const bounds = node.getBoundingClientRect()
  if (Math.round(bounds.width) !== CARD_GEOMETRY.width || Math.round(bounds.height) !== CARD_GEOMETRY.height) {
    throw new Error(`卡片尺寸必须为 ${CARD_GEOMETRY.width}×${CARD_GEOMETRY.height}`)
  }
  for (const selector of ['.xhs-card__content', '.xhs-card__cover-content']) {
    const content = node.querySelector<HTMLElement>(selector)
    if (content && content.scrollHeight > content.clientHeight + 1) {
      throw new Error('卡片内容存在垂直溢出，请重新排版')
    }
  }
}

export async function assertPngBlob(blob: Blob, signal?: AbortSignal): Promise<void> {
  if (blob.type !== 'image/png') throw new Error('导出结果不是 PNG')
  const bytes = new Uint8Array(await raceWithAbort(blob.slice(0, 24).arrayBuffer(), signal))
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('PNG 文件头无效')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width !== CARD_GEOMETRY.width || height !== CARD_GEOMETRY.height) {
    throw new Error(`PNG 尺寸必须为 ${CARD_GEOMETRY.width}×${CARD_GEOMETRY.height}`)
  }
}

export async function renderCardToPng(
  node: HTMLElement,
  renderer: PngRenderer = domToBlob,
  signal?: AbortSignal,
): Promise<Blob> {
  await waitForExportAssets(node, signal)
  assertCardNode(node)
  const blob = await raceWithAbort(renderer(node, {
    width: CARD_GEOMETRY.width,
    height: CARD_GEOMETRY.height,
    canvasWidth: CARD_GEOMETRY.width,
    canvasHeight: CARD_GEOMETRY.height,
    pixelRatio: 1,
    cacheBust: true,
  }), signal)
  if (!blob) throw new Error('PNG 生成失败')
  await assertPngBlob(blob, signal)
  return blob
}

export function createStreamingZipSink(): SequentialZipSink {
  const chunks: ArrayBuffer[] = []
  let settled = false
  let resolveBlob!: (blob: Blob) => void
  let rejectBlob!: (error: Error) => void
  const completion = new Promise<Blob>((resolve, reject) => {
    resolveBlob = resolve
    rejectBlob = reject
  })
  const zip = new Zip((error, data, final) => {
    if (settled) return
    if (error) {
      settled = true
      rejectBlob(error)
      return
    }
    if (data?.length) chunks.push(Uint8Array.from(data).buffer)
    if (final) {
      settled = true
      resolveBlob(new Blob(chunks, { type: 'application/zip' }))
    }
  })

  return {
    async append(name, blob, signal) {
      const entry = new ZipPassThrough(name)
      zip.add(entry)
      const bytes = await raceWithAbort(blob.arrayBuffer(), signal)
      throwIfAborted(signal)
      entry.push(new Uint8Array(bytes), true)
    },
    async close() {
      zip.end()
      return completion
    },
  }
}

export async function exportCardsToZip({
  pages,
  title,
  renderPage,
  renderToPng,
  sink = createStreamingZipSink(),
  signal,
}: ExportCardsToZipOptions): Promise<{ blob: Blob; fileName: string }> {
  const safeTitle = safeExportTitle(title)
  const render = renderToPng ?? ((node, renderSignal) => renderCardToPng(node, domToBlob, renderSignal))
  for (const page of pages) {
    throwIfAborted(signal)
    const node = await renderPage(page)
    throwIfAborted(signal)
    const blob = await render(node, signal)
    throwIfAborted(signal)
    await sink.append(buildPageFileName(safeTitle, page.index, pages.length), blob, signal)
  }
  throwIfAborted(signal)
  const blob = await sink.close()
  throwIfAborted(signal)
  if (blob.type !== 'application/zip') throw new Error('ZIP 生成失败')
  return { blob, fileName: `${safeTitle}.zip` }
}
