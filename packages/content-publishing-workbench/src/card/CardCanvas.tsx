import type { PagePlan } from '../layout/types'
import { SemanticBlockView } from '../components/MarkdownEditor'
import type { CardThemeId, SourceSnapshot } from '../types'

export type DisplayPage =
  | { kind: 'cover'; index: number }
  | { kind: 'content'; index: number; plan: PagePlan }

interface CardCanvasProps {
  page: DisplayPage
  pageCount: number
  themeId: CardThemeId
  title: string
  meta?: SourceSnapshot['meta']
}

export function CardCanvas({ page, pageCount, themeId, title, meta }: CardCanvasProps) {
  return <article
    className={`xhs-card xhs-card--${themeId} ${page.kind === 'cover' ? 'xhs-card--cover' : ''}`}
    data-card-page={page.index + 1}
    data-card-theme={themeId}
    aria-label={`${title} 第 ${page.index + 1} 页，共 ${pageCount} 页`}
  >
    <div className="xhs-card__ornament" aria-hidden="true" />
    {page.kind === 'cover'
      ? <div className="xhs-card__cover-content">
          <p className="xhs-card__kicker">CONTENT NOTE</p>
          <h2>{title}</h2>
          <div className="xhs-card__cover-rule" />
          <p>{meta?.author || sourceLabel(meta?.source)}</p>
        </div>
      : <div className="xhs-card__content">
          <div className="xhs-card__content-stack">
            {page.plan.blocks.map(block => <div className="xhs-card__block" key={block.id}>
              <SemanticBlockView block={block} />
            </div>)}
          </div>
        </div>}
    <footer className="xhs-card__footer">
      <span>{page.kind === 'cover' ? '封面' : 'QIUSHUI · NOTE'}</span>
      <span>{page.index + 1} / {pageCount}</span>
    </footer>
  </article>
}

function sourceLabel(source?: string): string {
  if (!source) return 'QIUSHUI · NOTE'
  try {
    return new URL(source).hostname
  } catch {
    return source
  }
}

export function buildDisplayPages(contentPages: PagePlan[], coverEnabled: boolean): DisplayPage[] {
  const offset = coverEnabled ? 1 : 0
  return [
    ...(coverEnabled ? [{ kind: 'cover' as const, index: 0 }] : []),
    ...contentPages.map(plan => ({ kind: 'content' as const, index: plan.index + offset, plan })),
  ]
}
