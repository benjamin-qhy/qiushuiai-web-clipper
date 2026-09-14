import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayPage } from '../card/CardCanvas'
import {
  assertPngBlob,
  buildPageFileName,
  createStreamingZipSink,
  exportCardsToZip,
  renderCardToPng,
  safeExportTitle,
  type SequentialZipSink,
} from './exportCards'

function pngBlob(width = 1242, height = 1656): Blob {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return new Blob([bytes], { type: 'image/png' })
}

function cardNode({ overflow = false, cover = false } = {}): HTMLElement {
  const node = document.createElement('article')
  node.getBoundingClientRect = () => ({ width: 1242, height: 1656 } as DOMRect)
  const content = document.createElement('div')
  content.className = cover ? 'xhs-card__cover-content' : 'xhs-card__content'
  Object.defineProperties(content, {
    clientHeight: { value: 1376 },
    scrollHeight: { value: overflow ? 1378 : 1376 },
  })
  node.append(content)
  return node
}

const pages: DisplayPage[] = Array.from({ length: 3 }, (_, index) => ({
  kind: 'content',
  index,
  plan: { index, blocks: [] },
}))

describe('card export', () => {
  it('creates UTF-8 byte-bounded, cross-platform safe names with page digits', () => {
    expect(safeExportTitle('  A/B:*?  ')).toBe('A-B')
    expect(safeExportTitle('...')).toBe('xiaohongshu-cards')
    expect(safeExportTitle('CON')).toBe('_CON')
    expect(new TextEncoder().encode(safeExportTitle('中'.repeat(100))).byteLength).toBeLessThanOrEqual(180)
    expect(buildPageFileName('A/B', 0, 3)).toBe('A-B-01.png')
    expect(buildPageFileName('标题', 100, 101)).toBe('标题-101.png')
  })

  it('validates only the PNG header slice, MIME, and exact dimensions', async () => {
    const valid = pngBlob()
    const fullRead = vi.spyOn(valid, 'arrayBuffer')
    await expect(assertPngBlob(valid)).resolves.toBeUndefined()
    expect(fullRead).not.toHaveBeenCalled()
    await expect(assertPngBlob(new Blob(['not png'], { type: 'image/png' }))).rejects.toThrow('PNG 文件头')
    await expect(assertPngBlob(pngBlob(100, 100))).rejects.toThrow('1242×1656')
  })

  it('waits for export readiness and rejects content or cover overflow', async () => {
    const renderer = vi.fn(async () => pngBlob())
    await expect(renderCardToPng(cardNode(), renderer)).resolves.toBeInstanceOf(Blob)
    expect(renderer).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      width: 1242,
      height: 1656,
      canvasWidth: 1242,
      canvasHeight: 1656,
      pixelRatio: 1,
    }))

    await expect(renderCardToPng(cardNode({ overflow: true }), renderer)).rejects.toThrow('垂直溢出')
    await expect(renderCardToPng(cardNode({ overflow: true, cover: true }), renderer)).rejects.toThrow('垂直溢出')
  })

  it('renders and appends every page strictly in sequence', async () => {
    const events: string[] = []
    let active = 0
    let maxActive = 0
    const renderPage = vi.fn(async (page: DisplayPage) => {
      events.push(`mount-${page.index}`)
      const node = cardNode()
      node.dataset.page = String(page.index)
      return node
    })
    const renderToPng = vi.fn(async (node: HTMLElement) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      events.push(`png-${node.dataset.page}`)
      await Promise.resolve()
      active -= 1
      return pngBlob()
    })
    const files: string[] = []
    const sink: SequentialZipSink = {
      async append(name) { files.push(name); events.push(`zip-${files.length - 1}`) },
      async close() { return new Blob(['zip'], { type: 'application/zip' }) },
    }

    const result = await exportCardsToZip({ pages, title: '测试/文章', renderPage, renderToPng, sink })

    expect(maxActive).toBe(1)
    expect(events).toEqual([
      'mount-0', 'png-0', 'zip-0',
      'mount-1', 'png-1', 'zip-1',
      'mount-2', 'png-2', 'zip-2',
    ])
    expect(files).toEqual(['测试-文章-01.png', '测试-文章-02.png', '测试-文章-03.png'])
    expect(result.fileName).toBe('测试-文章.zip')
    expect(result.blob.type).toBe('application/zip')
  })

  it('creates a readable streaming ZIP with Unicode file names', async () => {
    const sink = createStreamingZipSink()
    await sink.append('中文-01.png', pngBlob())
    await sink.append('中文-02.png', pngBlob())
    const zip = await sink.close()
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))

    expect(Object.keys(files)).toEqual(['中文-01.png', '中文-02.png'])
    expect(files['中文-01.png']).toEqual(new Uint8Array(await pngBlob().arrayBuffer()))
  })

  it('stops before the next page when export is aborted', async () => {
    const controller = new AbortController()
    const renderPage = vi.fn(async () => cardNode())
    const sink: SequentialZipSink = {
      async append() { controller.abort(new DOMException('导出已取消', 'AbortError')) },
      close: vi.fn(async () => new Blob(['zip'], { type: 'application/zip' })),
    }

    await expect(exportCardsToZip({
      pages,
      title: '文章',
      renderPage,
      renderToPng: async () => pngBlob(),
      sink,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(renderPage).toHaveBeenCalledOnce()
    expect(sink.close).not.toHaveBeenCalled()
  })

  it('rejects immediately when PNG rendering is aborted', async () => {
    const controller = new AbortController()
    const renderer = vi.fn(() => new Promise<Blob | null>(() => {}))
    const result = renderCardToPng(cardNode(), renderer, controller.signal)

    controller.abort(new DOMException('导出已取消', 'AbortError'))

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})
