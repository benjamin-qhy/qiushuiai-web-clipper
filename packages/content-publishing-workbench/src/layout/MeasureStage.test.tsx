import { act, cleanup, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MeasureStage, CARD_GEOMETRY, type MeasureStageHandle } from './MeasureStage'
import type { SemanticBlock } from '../markdown/parse'

const block: SemanticBlock = {
  id: 'paragraph', type: 'paragraph', children: [{ type: 'text', value: '正文' }],
}
const originalAnimationFrame = globalThis.requestAnimationFrame
const originalRect = HTMLElement.prototype.getBoundingClientRect

beforeAll(() => {
  globalThis.requestAnimationFrame = callback => {
    callback(0)
    return 1
  }
  HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
    width: CARD_GEOMETRY.contentWidth,
    height: 42,
    top: 0,
    right: CARD_GEOMETRY.contentWidth,
    bottom: 42,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }))
})

afterEach(cleanup)

afterAll(() => {
  globalThis.requestAnimationFrame = originalAnimationFrame
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

describe('MeasureStage', () => {
  it('measures at fixed card geometry and caches matching content', async () => {
    const ref = createRef<MeasureStageHandle>()
    const view = render(<MeasureStage ref={ref} themeId="minimal" />)
    const stage = view.container.querySelector('.publishing-workbench__measure-stage') as HTMLElement
    expect(stage.style.width).toBe('1242px')
    expect(stage.style.height).toBe('1656px')

    let first!: Promise<number>
    await act(async () => {
      first = ref.current!.measure([block])
    })
    await expect(first).resolves.toBe(42)
    const calls = vi.mocked(HTMLElement.prototype.getBoundingClientRect).mock.calls.length
    await expect(ref.current!.measure([block])).resolves.toBe(42)
    expect(vi.mocked(HTMLElement.prototype.getBoundingClientRect)).toHaveBeenCalledTimes(calls)
  })
})
