import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CardThemeId } from '../types'
import { CardPreview } from './CardPreview'

const { planPagesMock } = vi.hoisted(() => ({
  planPagesMock: vi.fn(async () => Array.from({ length: 4 }, (_, index) => ({ index, blocks: [] }))),
}))
const { renderCardToPngMock, exportCardsToZipMock, downloadArtifactMock } = vi.hoisted(() => ({
  renderCardToPngMock: vi.fn(async (_node?: HTMLElement, _renderer?: unknown, _signal?: AbortSignal) =>
    new Blob(['png'], { type: 'image/png' })),
  exportCardsToZipMock: vi.fn(async ({ pages, renderPage }: {
    pages: Array<{ index: number }>
    renderPage(page: { index: number }): Promise<HTMLElement>
  }) => {
    for (const page of pages) await renderPage(page)
    return { blob: new Blob(['zip'], { type: 'application/zip' }), fileName: '文章标题.zip' }
  }),
  downloadArtifactMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../layout/planPages', () => ({ planPages: planPagesMock }))
vi.mock('../layout/MeasureStage', async () => {
  const React = await import('react')
  return {
    CARD_GEOMETRY: { width: 1242, height: 1656, contentWidth: 1018, contentHeight: 1376 },
    MeasureStage: React.forwardRef(function MeasureStageMock(_props, ref) {
      React.useImperativeHandle(ref, () => ({ measure: async () => 100, clearCache: vi.fn(), cancelPending: vi.fn() }))
      return <div data-testid="measure-stage" />
    }),
  }
})
vi.mock('../export/exportCards', () => ({
  buildPageFileName: (title: string, index: number) => `${title}-${String(index + 1).padStart(2, '0')}.png`,
  renderCardToPng: renderCardToPngMock,
  exportCardsToZip: exportCardsToZipMock,
}))

class ResizeObserverMock {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 500 } } as unknown as ResizeObserverEntry], this)
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock))
afterAll(() => vi.unstubAllGlobals())
afterEach(() => {
  cleanup()
  planPagesMock.mockClear()
  renderCardToPngMock.mockClear()
  exportCardsToZipMock.mockClear()
  downloadArtifactMock.mockClear()
  downloadArtifactMock.mockResolvedValue(undefined)
})

function Harness({ initialPage = 0 }: { initialPage?: number }) {
  const [themeId, setThemeId] = useState<CardThemeId>('minimal')
  const [coverEnabled, setCoverEnabled] = useState(false)
  const [currentPage, setCurrentPage] = useState(initialPage)
  return <CardPreview
    markdown="# 标题\n\n正文"
    title="文章标题"
    meta={{ title: '文章标题', source: 'https://example.com', created: '2026-09-14' }}
    themeId={themeId}
    coverEnabled={coverEnabled}
    currentPage={currentPage}
    onDownload={downloadArtifactMock}
    onThemeChange={setThemeId}
    onCoverChange={enabled => { setCoverEnabled(enabled); setCurrentPage(0) }}
    onPageChange={setCurrentPage}
  />
}

describe('CardPreview', () => {
  it('switches among six styles without recalculating the page plan', async () => {
    render(<Harness />)
    expect(await screen.findByText('共 4 张')).not.toBeNull()
    expect(screen.getByLabelText('卡片样式').querySelectorAll('button')).toHaveLength(6)

    for (const label of ['基础', '科技', '边框', '手帐', '柔和', '简约']) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true')
    }
    expect(document.querySelector('.xhs-card[data-card-theme="minimal"]')).not.toBeNull()
    expect(planPagesMock).toHaveBeenCalledOnce()
  })

  it('adds a cover only when requested and keeps all content pages', async () => {
    render(<Harness />)
    await screen.findByText('共 4 张')

    fireEvent.click(screen.getByRole('button', { name: '添加封面' }))

    expect(await screen.findByText('共 5 张')).not.toBeNull()
    expect(screen.getByRole('button', { name: '第 1 页，封面' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '第 5 页' })).not.toBeNull()
    expect(planPagesMock).toHaveBeenCalledOnce()
  })

  it('mounts only the current page and its neighbors while all thumbnails remain available', async () => {
    render(<Harness />)
    await screen.findByText('共 4 张')
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => expect(document.querySelectorAll('[data-card-page]')).toHaveLength(3))
    expect(screen.getByLabelText('页面缩略图').querySelectorAll('button')).toHaveLength(4)
    expect(document.querySelector('.publishing-workbench__page-controls span')?.textContent).toBe('2 / 4')
  })

  it('preserves a restored page until asynchronous pagination completes', async () => {
    let resolvePages!: (pages: { index: number; blocks: [] }[]) => void
    planPagesMock.mockReturnValueOnce(new Promise(resolve => { resolvePages = resolve }))
    render(<Harness initialPage={3} />)

    resolvePages(Array.from({ length: 4 }, (_, index) => ({ index, blocks: [] })))

    await screen.findByText('共 4 张')
    expect(document.querySelector('.publishing-workbench__page-controls span')?.textContent).toBe('4 / 4')
  })

  it('shows a pagination failure and can retry it', async () => {
    planPagesMock.mockRejectedValueOnce(new Error('measurement failed'))
    render(<Harness initialPage={3} />)

    expect((await screen.findByRole('alert')).textContent).toContain('卡片排版失败，请重试。')
    expect(screen.queryByText('等待创作稿')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '重新排版' }))

    expect(await screen.findByText('共 4 张')).not.toBeNull()
    expect(document.querySelector('.publishing-workbench__page-controls span')?.textContent).toBe('4 / 4')
    expect(planPagesMock).toHaveBeenCalledTimes(2)
  })

  it('downloads the current PNG and renders all ZIP pages in order', async () => {
    render(<Harness />)
    await screen.findByText('共 4 张')

    fireEvent.click(screen.getByRole('button', { name: '保存当前页' }))
    await waitFor(() => expect(downloadArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      blob: expect.any(Blob), fileName: '文章标题-01.png',
      signal: expect.any(AbortSignal),
    })))

    fireEvent.click(screen.getByRole('button', { name: '保存全部' }))
    await waitFor(() => expect(downloadArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      blob: expect.any(Blob), fileName: '文章标题.zip',
      signal: expect.any(AbortSignal),
    })))
    expect(exportCardsToZipMock).toHaveBeenCalledWith(expect.objectContaining({
      pages: expect.arrayContaining([expect.objectContaining({ index: 0 }), expect.objectContaining({ index: 3 })]),
      title: '文章标题',
    }))
  })

  it('warns above twenty pages without truncating export input', async () => {
    planPagesMock.mockResolvedValueOnce(Array.from({ length: 21 }, (_, index) => ({ index, blocks: [] })))
    render(<Harness />)

    expect(await screen.findByRole('status')).toHaveProperty('textContent', '共 21 页，全部导出会逐页处理，可能需要较长时间。')
    fireEvent.click(screen.getByRole('button', { name: '保存全部' }))
    await waitFor(() => expect(exportCardsToZipMock.mock.calls[0]?.[0].pages).toHaveLength(21))
  })

  it('cancels an in-flight export on unmount without downloading', async () => {
    let abortObserved = false
    renderCardToPngMock.mockImplementationOnce((_node, _renderer, signal) => new Promise((_, reject) => {
      if (!signal) throw new Error('missing abort signal')
      signal.addEventListener('abort', () => {
        abortObserved = true
        reject(signal.reason)
      }, { once: true })
    }))
    const view = render(<Harness />)
    await screen.findByText('共 4 张')

    fireEvent.click(screen.getByRole('button', { name: '保存当前页' }))
    await waitFor(() => expect(renderCardToPngMock).toHaveBeenCalledOnce())
    view.unmount()

    await waitFor(() => expect(abortObserved).toBe(true))
    expect(downloadArtifactMock).not.toHaveBeenCalled()
  })
})
