import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SemanticBlockView } from './MarkdownEditor'
import type { SemanticBlock } from '../markdown/parse'

afterEach(cleanup)

describe('SemanticBlockView', () => {
  it('suppresses the repeated marker for a continued list item', () => {
    const block: SemanticBlock = {
      id: 'continued-list',
      type: 'list',
      ordered: true,
      start: 2,
      continuedFromPrevious: true,
      items: [[{ id: 'text', type: 'paragraph', children: [{ type: 'text', value: '续页内容' }] }]],
    }
    const view = render(<SemanticBlockView block={block} />)

    expect(view.container.querySelector('ol')?.className).toBe('xhs-card__continued-list')
    expect(view.container.querySelector('li')?.textContent).toBe('续页内容')
  })
})
