import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buildDisplayPages, CardCanvas } from '../card/CardCanvas'
import { CARD_THEMES } from '../card/themes'
import { CARD_GEOMETRY, MeasureStage, type MeasureStageHandle } from '../layout/MeasureStage'
import { planPages } from '../layout/planPages'
import type { PagePlan } from '../layout/types'
import { parseCardMarkdown } from '../markdown/parse'
import type { CardThemeId, SourceSnapshot } from '../types'
import { Button } from './ui/button'

interface CardPreviewProps {
  markdown: string
  title: string
  meta: SourceSnapshot['meta']
  themeId: CardThemeId
  coverEnabled: boolean
  currentPage: number
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

  const pages = buildDisplayPages(contentPages, coverEnabled)
  const safePage = pages.length ? Math.min(currentPage, pages.length - 1) : 0
  const virtualPages = pages.filter(page => Math.abs(page.index - safePage) <= 1)

  useEffect(() => {
    if (plannedMarkdown === markdown && safePage !== currentPage) onPageChange(safePage)
  }, [currentPage, markdown, onPageChange, plannedMarkdown, safePage])

  return <div className="publishing-workbench__card-builder">
    <MeasureStage ref={measureRef} themeId="layout" />

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

    <div className="publishing-workbench__card-actions">
      <Button
        size="sm"
        variant={coverEnabled ? 'default' : 'outline'}
        aria-pressed={coverEnabled}
        onClick={() => onCoverChange(!coverEnabled)}
      >{coverEnabled ? '移除封面' : '添加封面'}</Button>
      <span>{planning ? '正在排版…' : paginationError ? '排版失败' : pages.length ? `共 ${pages.length} 张` : '暂无可预览内容'}</span>
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
      <div className="publishing-workbench__thumbnails" aria-label="页面缩略图">
        {pages.map(page => <button
          key={page.index}
          type="button"
          aria-label={`第 ${page.index + 1} 页${page.kind === 'cover' ? '，封面' : ''}`}
          aria-current={page.index === safePage ? 'page' : undefined}
          className={`publishing-workbench__thumbnail xhs-card--${themeId}`}
          onClick={() => onPageChange(page.index)}
        ><span>{page.kind === 'cover' ? '封' : page.index + 1}</span></button>)}
      </div>
    </> : null}
  </div>
}
