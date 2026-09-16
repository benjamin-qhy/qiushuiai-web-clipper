import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Archive, ChevronLeft, ChevronRight, Download, FilePlus2 } from 'lucide-react'
import { buildDisplayPages, CardCanvas, type DisplayPage } from '../card/CardCanvas'
import { CARD_THEMES } from '../card/themes'
import {
  buildPageFileName,
  exportCardsToZip,
  renderCardToPng,
} from '../export/exportCards'
import { CARD_GEOMETRY, MeasureStage, type MeasureStageHandle } from '../layout/MeasureStage'
import { planPages } from '../layout/planPages'
import type { PagePlan } from '../layout/types'
import { parseCardMarkdown } from '../markdown/parse'
import type { CardThemeId, DownloadArtifact, SourceSnapshot } from '../types'
import { Button } from './ui/button'
import { ButtonGroup } from './ui/button-group'

interface CardPreviewProps {
  markdown: string
  title: string
  meta: SourceSnapshot['meta']
  themeId: CardThemeId
  coverEnabled: boolean
  currentPage: number
  onDownload(artifact: DownloadArtifact): Promise<void>
  onThemeChange(themeId: CardThemeId): void
  onCoverChange(enabled: boolean): void
  onPageChange(page: number): void
}

export function CardPreview({
  markdown,
  title,
  meta,
  themeId,
  coverEnabled,
  currentPage,
  onDownload,
  onThemeChange,
  onCoverChange,
  onPageChange,
}: CardPreviewProps) {
  const measureRef = useRef<MeasureStageHandle>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const blocks = useMemo(() => parseCardMarkdown(markdown), [markdown])
  const [contentPages, setContentPages] = useState<PagePlan[]>([])
  const [plannedMarkdown, setPlannedMarkdown] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [paginationError, setPaginationError] = useState(false)
  const [planAttempt, setPlanAttempt] = useState(0)
  const [scale, setScale] = useState(0.28)
  const [exporting, setExporting] = useState<'current' | 'all' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportRender, setExportRender] = useState<{
    page: DisplayPage
    token: number
    themeId: CardThemeId
    pageCount: number
  } | null>(null)
  const exportHostRef = useRef<HTMLDivElement>(null)
  const exportSequenceRef = useRef(0)
  const mountedRef = useRef(true)
  const exportAbortRef = useRef<AbortController | null>(null)
  const exportPendingRef = useRef<{
    token: number
    resolve(node: HTMLElement): void
    reject(error: Error): void
  } | null>(null)

  useEffect(() => {
    const stage = measureRef.current
    if (!stage) return
    let cancelled = false
    setContentPages([])
    setPlannedMarkdown(null)
    setPaginationError(false)
    setPlanning(true)
    stage.clearCache()
    planPages(blocks, {
      contentHeight: CARD_GEOMETRY.contentHeight,
      measure: nextBlocks => stage.measure(nextBlocks),
    }).then(pages => {
      if (!cancelled) {
        setContentPages(pages)
        setPlannedMarkdown(markdown)
      }
    }).catch(() => {
      if (!cancelled) setPaginationError(true)
    }).finally(() => {
      if (!cancelled) setPlanning(false)
    })
    return () => {
      cancelled = true
      stage.cancelPending()
    }
  }, [blocks, markdown, planAttempt])

  useEffect(() => {
    const element = previewRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const resize = (width: number) => setScale(Math.min(1, Math.max(0.12, (width - 32) / CARD_GEOMETRY.width)))
    resize(element.clientWidth)
    const observer = new ResizeObserver(entries => resize(entries[0]?.contentRect.width ?? element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const pending = exportPendingRef.current
    if (!exportRender || !pending || pending.token !== exportRender.token) return
    const node = exportHostRef.current?.querySelector<HTMLElement>('.xhs-card')
    if (!node) {
      pending.reject(new Error('导出画布挂载失败'))
    } else {
      pending.resolve(node)
    }
    exportPendingRef.current = null
  }, [exportRender])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      exportAbortRef.current?.abort(new DOMException('导出已取消', 'AbortError'))
      exportPendingRef.current?.reject(new DOMException('导出已取消', 'AbortError'))
      exportPendingRef.current = null
    }
  }, [])

  const pages = buildDisplayPages(contentPages, coverEnabled)
  const safePage = pages.length ? Math.min(currentPage, pages.length - 1) : 0
  const virtualPages = pages.filter(page => Math.abs(page.index - safePage) <= 1)

  useEffect(() => {
    if (plannedMarkdown === markdown && safePage !== currentPage) onPageChange(safePage)
  }, [currentPage, markdown, onPageChange, plannedMarkdown, safePage])

  function mountExportPage(page: DisplayPage, signal: AbortSignal): Promise<HTMLElement> {
    if (!mountedRef.current || signal.aborted) {
      return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException('导出已取消', 'AbortError'))
    }
    exportPendingRef.current?.reject(new Error('新的导出任务已开始'))
    const token = exportSequenceRef.current++
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (exportPendingRef.current?.token === token) exportPendingRef.current = null
        reject(signal.reason instanceof Error ? signal.reason : new DOMException('导出已取消', 'AbortError'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      exportPendingRef.current = {
        token,
        resolve(node) {
          signal.removeEventListener('abort', onAbort)
          resolve(node)
        },
        reject(error) {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      }
      setExportRender({ page, token, themeId, pageCount: pages.length })
    })
  }

  function beginExport(kind: 'current' | 'all'): AbortController {
    exportAbortRef.current?.abort(new DOMException('新的导出任务已开始', 'AbortError'))
    const controller = new AbortController()
    exportAbortRef.current = controller
    setExporting(kind)
    setExportError(null)
    return controller
  }

  function finishExport(controller: AbortController): void {
    if (exportAbortRef.current === controller) exportAbortRef.current = null
    if (!mountedRef.current) return
    setExportRender(null)
    setExporting(null)
  }

  function reportExportError(error: unknown, signal: AbortSignal, fallback: string): void {
    if (!mountedRef.current || signal.aborted) return
    setExportError(error instanceof Error ? error.message : fallback)
  }

  async function saveCurrentPage() {
    const page = pages[safePage]
    if (!page || exporting) return
    const controller = beginExport('current')
    try {
      const node = await mountExportPage(page, controller.signal)
      const blob = await renderCardToPng(node, undefined, controller.signal)
      if (controller.signal.aborted) return
      await onDownload({
        blob,
        fileName: buildPageFileName(title, page.index, pages.length),
        signal: controller.signal,
      })
    } catch (error) {
      reportExportError(error, controller.signal, 'PNG 导出失败')
    } finally {
      finishExport(controller)
    }
  }

  async function saveAllPages() {
    if (!pages.length || exporting) return
    const controller = beginExport('all')
    try {
      const result = await exportCardsToZip({
        pages,
        title,
        renderPage: page => mountExportPage(page, controller.signal),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      await onDownload({ ...result, signal: controller.signal })
    } catch (error) {
      reportExportError(error, controller.signal, 'ZIP 导出失败')
    } finally {
      finishExport(controller)
    }
  }

  return <div className="publishing-workbench__card-builder">
    <MeasureStage ref={measureRef} themeId="layout" />

    <div className="publishing-workbench__pane-header">
      <h2 id="output-pane-title">发布成品</h2>
      <div className="publishing-workbench__output-heading-actions">
        <span>{planning ? '正在排版…' : paginationError ? '排版失败' : pages.length ? `共 ${pages.length} 张` : '暂无内容'}</span>
        <ButtonGroup aria-label="成品操作">
          <Button
            size="icon-sm"
            variant={coverEnabled ? 'default' : 'outline'}
            aria-label={coverEnabled ? '移除封面' : '添加封面'}
            aria-pressed={coverEnabled}
            title={coverEnabled ? '移除封面' : '添加封面'}
            onClick={() => onCoverChange(!coverEnabled)}
          ><FilePlus2 aria-hidden="true" /></Button>
          <Button size="icon-sm" variant="outline" aria-label="保存当前页" title="保存当前页"
            disabled={!pages.length || Boolean(exporting)} onClick={() => void saveCurrentPage()}>
            <Download aria-hidden="true" />
          </Button>
          <Button size="icon-sm" aria-label="保存全部" title="保存全部"
            disabled={!pages.length || Boolean(exporting)} onClick={() => void saveAllPages()}>
            <Archive aria-hidden="true" />
          </Button>
        </ButtonGroup>
      </div>
    </div>

    <div className="publishing-workbench__card-builder-body">
      <div className="publishing-workbench__theme-picker" aria-label="卡片样式">
        {CARD_THEMES.map(theme => <button
          key={theme.id}
          type="button"
          className="publishing-workbench__theme-option"
          data-theme={theme.id}
          data-selected={theme.id === themeId || undefined}
          aria-pressed={theme.id === themeId}
          title={theme.description}
          onClick={() => onThemeChange(theme.id)}
        >
          <span className={`publishing-workbench__theme-swatch xhs-card--${theme.id}`} aria-hidden="true" />
          <span>{theme.label}</span>
        </button>)}
      </div>

      {paginationError ? <div className="publishing-workbench__pagination-error" role="alert">
        <span>卡片排版失败，请重试。</span>
        <Button size="sm" variant="outline" onClick={() => setPlanAttempt(attempt => attempt + 1)}>重新排版</Button>
      </div> : null}

      <div ref={previewRef} className="publishing-workbench__card-viewport">
        {pages.length ? virtualPages.map(page => <div
          key={`${page.kind}-${page.index}`}
          className="publishing-workbench__card-stage"
          data-current={page.index === safePage || undefined}
          aria-hidden={page.index !== safePage}
          style={{ height: CARD_GEOMETRY.height * scale }}
        >
          <div className="publishing-workbench__card-scale" style={{ transform: `translateX(-50%) scale(${scale})` }}>
            <CardCanvas page={page} pageCount={pages.length} themeId={themeId} title={title} meta={meta} />
          </div>
        </div>) : <div className="publishing-workbench__output-placeholder">
          <p>{paginationError ? '无法预览卡片' : '等待创作稿'}</p>
          <span>{paginationError ? '重新排版后将在这里恢复预览。' : '生成或输入 Markdown 后，这里会自动分页。'}</span>
        </div>}
      </div>

      {pages.length ? <>
        <div className="publishing-workbench__page-controls">
          <Button size="icon-sm" variant="outline" aria-label="上一页" disabled={safePage === 0}
            onClick={() => onPageChange(safePage - 1)}><ChevronLeft aria-hidden="true" /></Button>
          <span>{safePage + 1} / {pages.length}</span>
          <Button size="icon-sm" variant="outline" aria-label="下一页" disabled={safePage === pages.length - 1}
            onClick={() => onPageChange(safePage + 1)}><ChevronRight aria-hidden="true" /></Button>
        </div>
        {pages.length > 20 ? <p className="publishing-workbench__export-warning" role="status">
          共 {pages.length} 页，全部导出会逐页处理，可能需要较长时间。
        </p> : null}
        {exportError ? <p className="publishing-workbench__error" role="alert">{exportError}</p> : null}
      </> : null}
    </div>

    {exportRender ? <div className="publishing-workbench__export-stage" aria-hidden="true" ref={exportHostRef}>
      <CardCanvas page={exportRender.page} pageCount={exportRender.pageCount} themeId={exportRender.themeId} title={title} meta={meta} />
    </div> : null}
  </div>
}
