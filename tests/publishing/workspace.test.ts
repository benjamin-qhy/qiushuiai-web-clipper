import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PublishingWorkspace from '../../MultiPost-Extension/src/haiqiai/PublishingWorkspace'

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('local publishing workspace', () => {
  it('opens without navigating to an external service or offering premature publishing', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const fetch = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('open', open)
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root!.render(createElement(PublishingWorkspace)))

    expect(container.querySelector('h1')?.textContent).toBe('发布工作台')
    expect(container.textContent).toContain('尚未连接发布服务')
    expect(container.querySelector('a[href="/options.html"]')?.textContent).toBe('剪藏设置')
    expect(container.querySelector('input[type=\"url\"]')).not.toBeNull()
    expect(container.querySelector<HTMLButtonElement>('button[type=\"submit\"]')?.disabled).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
})
