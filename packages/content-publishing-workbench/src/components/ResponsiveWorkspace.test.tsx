import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PUBLISHER_LAYOUT, type PublisherLayout } from '../types'
import { applyPanelLayout, ResponsiveWorkspace } from './ResponsiveWorkspace'

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  private elements = new Set<Element>()

  constructor(private callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this)
  }

  observe(element: Element) { this.elements.add(element) }
  unobserve(element: Element) { this.elements.delete(element) }
  disconnect() { this.elements.clear() }

  static setWorkspaceWidth(width: number) {
    const workspace = document.querySelector('.publishing-workbench__workspace')!
    const observer = ResizeObserverMock.instances.find(instance => instance.elements.has(workspace))!
    observer.callback([{ target: workspace, contentRect: { width } } as unknown as ResizeObserverEntry], observer)
  }
}

const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 300 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 })
})
afterAll(() => {
  vi.unstubAllGlobals()
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
})
afterEach(() => {
  cleanup()
  ResizeObserverMock.instances = []
})

function Harness({
  onChange = vi.fn(),
  initialLayout = DEFAULT_PUBLISHER_LAYOUT,
}: {
  onChange?: (layout: PublisherLayout) => void
  initialLayout?: PublisherLayout
}) {
  const [layout, setLayout] = useState(() => structuredClone(initialLayout))
  return <ResponsiveWorkspace
    layout={layout}
    onLayoutChange={next => { setLayout(next); onChange(next) }}
    panes={{ source: <div>原文内容</div>, composer: <div>创作内容</div>, output: <div>成品内容</div> }}
  />
}

describe('ResponsiveWorkspace', () => {
  it('shows three resizable regions and saves keyboard resizing on wide containers', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    expect(screen.getByText('原文内容')).not.toBeNull()
    expect(screen.getByText('创作内容')).not.toBeNull()
    expect(screen.getByText('成品内容')).not.toBeNull()
    const separators = screen.getAllByRole('separator')
    expect(separators).toHaveLength(2)
    fireEvent.keyDown(separators[0], { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith({
      sizes: [35, 30, 35],
      visible: { source: true, composer: true, output: true },
      activePane: 'composer',
    })
  })

  it('maps a resize result back to all persisted pane sizes', () => {
    expect(applyPanelLayout([30, 35, 35], ['source', 'output'], { source: 40, output: 60 }))
      .toEqual([26, 35, 39])
  })

  it('mounts the panel group with restored widths', () => {
    render(<Harness initialLayout={{
      sizes: [45, 25, 30],
      visible: { source: true, composer: true, output: true },
      activePane: 'source',
    }} />)

    expect(screen.getByTestId('source').style.flex).toBe('45 1 0px')
    expect(screen.getByTestId('composer').style.flex).toBe('25 1 0px')
    expect(screen.getByTestId('output').style.flex).toBe('30 1 0px')
  })

  it('applies reset widths while all three panes remain mounted', async () => {
    render(<Harness initialLayout={{
      sizes: [45, 25, 30],
      visible: { source: true, composer: true, output: true },
      activePane: 'source',
    }} />)

    fireEvent.click(screen.getByRole('button', { name: '重置布局' }))

    await waitFor(() => expect(screen.getByTestId('source').style.flex).toBe('30 1 0px'))
    expect(screen.getByTestId('composer').style.flex).toBe('35 1 0px')
    expect(screen.getByTestId('output').style.flex).toBe('35 1 0px')
  })

  it('can hide, restore, and reset panes while keeping at least one visible', () => {
    render(<Harness />)

    const sourceToggle = screen.getByRole('button', { name: '隐藏原文' })
    expect(sourceToggle.textContent).toBe('')
    expect(sourceToggle.closest('[data-slot="button-group"]')).not.toBeNull()
    fireEvent.click(sourceToggle)
    expect(screen.queryByText('原文内容')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '显示原文' }))
    expect(screen.getByText('原文内容')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '隐藏原文' }))
    fireEvent.click(screen.getByRole('button', { name: '隐藏创作' }))
    expect((screen.getByRole('button', { name: '隐藏成品' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '重置布局' }))
    expect(screen.getByText('原文内容')).not.toBeNull()
    expect(screen.getByText('创作内容')).not.toBeNull()
  })

  it('shows the active pane plus its neighbor on medium containers', () => {
    render(<Harness />)
    act(() => ResizeObserverMock.setWorkspaceWidth(800))

    expect(screen.queryByText('原文内容')).toBeNull()
    expect(screen.getByText('创作内容')).not.toBeNull()
    expect(screen.getByText('成品内容')).not.toBeNull()
    expect(screen.getAllByRole('separator')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '切换到原文' }))
    expect(screen.getByText('原文内容')).not.toBeNull()
    expect(screen.getByText('创作内容')).not.toBeNull()
    expect(screen.queryByText('成品内容')).toBeNull()
  })

  it('uses tabs to switch the single visible pane on narrow containers', () => {
    render(<Harness />)
    act(() => ResizeObserverMock.setWorkspaceWidth(600))

    expect(screen.getByText('创作内容')).not.toBeNull()
    expect(screen.queryByText('原文内容')).toBeNull()
    fireEvent.mouseDown(screen.getByRole('tab', { name: '成品' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('成品内容')).not.toBeNull()
    expect(screen.queryByText('创作内容')).toBeNull()
  })
})
