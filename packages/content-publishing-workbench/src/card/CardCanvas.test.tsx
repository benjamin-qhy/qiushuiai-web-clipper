import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PagePlan } from '../layout/types'
import { CARD_THEMES, getCardTheme } from './themes'
import { buildDisplayPages, CardCanvas } from './CardCanvas'

afterEach(cleanup)

const contentPages: PagePlan[] = [
  { index: 0, blocks: [{ id: 'p-1', type: 'paragraph', children: [{ type: 'mark', children: [{ type: 'text', value: '重点' }] }] }] },
  { index: 1, blocks: [{ id: 'p-2', type: 'paragraph', children: [{ type: 'text', value: '第二页' }] }] },
]

describe('card themes and display pages', () => {
  it('exposes exactly the six approved theme IDs and labels', () => {
    expect(CARD_THEMES.map(theme => [theme.id, theme.label])).toEqual([
      ['basic', '基础'], ['tech', '科技'], ['minimal', '简约'],
      ['border', '边框'], ['journal', '手帐'], ['soft', '柔和'],
    ])
    expect(getCardTheme('minimal').label).toBe('简约')
  })

  it('adds an optional cover without mutating the shared content page plan', () => {
    const withoutCover = buildDisplayPages(contentPages, false)
    const withCover = buildDisplayPages(contentPages, true)

    expect(withoutCover.map(page => page.index)).toEqual([0, 1])
    expect(withCover.map(page => [page.kind, page.index])).toEqual([
      ['cover', 0], ['content', 1], ['content', 2],
    ])
    expect(withCover[1].kind === 'content' && withCover[1].plan).toBe(contentPages[0])
    expect(contentPages.map(page => page.index)).toEqual([0, 1])
  })

  it('renders fixed-size themed card semantics, highlights, and page numbers', () => {
    render(<CardCanvas
      page={{ kind: 'content', index: 0, plan: contentPages[0] }}
      pageCount={2}
      themeId="tech"
      title="测试标题"
    />)

    const card = screen.getByRole('article', { name: '测试标题 第 1 页，共 2 页' })
    expect(card.classList.contains('xhs-card--tech')).toBe(true)
    expect(card.getAttribute('data-card-page')).toBe('1')
    expect(card.querySelector('mark')?.textContent).toBe('重点')
    expect(card.textContent).toContain('1 / 2')
  })
})
