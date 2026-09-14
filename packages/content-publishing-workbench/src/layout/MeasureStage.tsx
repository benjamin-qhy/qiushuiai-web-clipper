import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { SemanticBlock } from '../markdown/parse'
import { SemanticBlockView } from '../components/MarkdownEditor'

export const CARD_GEOMETRY = {
  width: 1242,
  height: 1656,
  contentWidth: 1018,
  contentHeight: 1376,
} as const

export interface CardGeometry {
  width: number
  height: number
  contentWidth: number
  contentHeight: number
}

export interface MeasureStageHandle {
  measure(blocks: SemanticBlock[]): Promise<number>
  clearCache(): void
}

interface MeasureStageProps {
  themeId: string
  renderBlock?(block: SemanticBlock): ReactNode
  geometry?: CardGeometry
}

interface PendingMeasure {
  resolve(height: number): void
  reject(error: unknown): void
}

const nextFrame = () => new Promise<void>(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else globalThis.setTimeout(resolve, 0)
})

const defaultRenderBlock = (block: SemanticBlock) => <SemanticBlockView block={block} />
const rendererIds = new WeakMap<NonNullable<MeasureStageProps['renderBlock']>, number>()
let rendererSequence = 0

function rendererId(renderer: NonNullable<MeasureStageProps['renderBlock']>): number {
  const existing = rendererIds.get(renderer)
  if (existing !== undefined) return existing
  const id = rendererSequence++
  rendererIds.set(renderer, id)
  return id
}

interface MeasureRequest {
  blocks: SemanticBlock[]
  geometry: CardGeometry
  key: string
  nonce: number
  renderBlock(block: SemanticBlock): ReactNode
  themeId: string
}

export const MeasureStage = forwardRef<MeasureStageHandle, MeasureStageProps>(function MeasureStage({
  themeId,
  renderBlock = defaultRenderBlock,
  geometry = CARD_GEOMETRY,
}, ref) {
  const [request, setRequest] = useState<MeasureRequest | null>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<PendingMeasure | null>(null)
  const cacheRef = useRef(new Map<string, number>())
  const nonceRef = useRef(0)

  useImperativeHandle(ref, () => ({
    measure(nextBlocks) {
      const key = JSON.stringify([themeId, geometry, rendererId(renderBlock), nextBlocks])
      const cached = cacheRef.current.get(key)
      if (cached !== undefined) return Promise.resolve(cached)
      if (pendingRef.current) return Promise.reject(new Error('MeasureStage accepts one measurement at a time'))

      setRequest({
        blocks: nextBlocks,
        geometry: { ...geometry },
        key,
        nonce: nonceRef.current++,
        renderBlock,
        themeId,
      })
      return new Promise<number>((resolve, reject) => {
        pendingRef.current = { resolve, reject }
      })
    },
    clearCache() {
      cacheRef.current.clear()
    },
  }), [geometry, renderBlock, themeId])

  useEffect(() => () => {
    pendingRef.current?.reject(new Error('MeasureStage was unmounted during measurement'))
    pendingRef.current = null
  }, [])

  useLayoutEffect(() => {
    if (!request || !pendingRef.current) return
    let cancelled = false
    const pending = pendingRef.current
    const requestKey = request.key

    async function measure() {
      try {
        await document.fonts?.ready
        await nextFrame()
        await nextFrame()
        if (cancelled || !targetRef.current) return
        const height = targetRef.current.getBoundingClientRect().height
        cacheRef.current.set(requestKey, height)
        pendingRef.current = null
        pending.resolve(height)
      } catch (error) {
        pendingRef.current = null
        pending.reject(error)
      }
    }
    void measure()
    return () => { cancelled = true }
  }, [request])

  return <div
    aria-hidden="true"
    className={`xhs-card xhs-card--${request?.themeId ?? themeId} publishing-workbench__measure-stage`}
    style={{ width: request?.geometry.width ?? geometry.width, height: request?.geometry.height ?? geometry.height }}
  >
    <div className="xhs-card__content" style={{ width: request?.geometry.contentWidth ?? geometry.contentWidth }}>
      <div ref={targetRef} className="xhs-card__content-stack">
        {request?.blocks.map(block => <div className="xhs-card__block" key={block.id}>{request.renderBlock(block)}</div>)}
      </div>
    </div>
  </div>
})
