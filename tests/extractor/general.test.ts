import { describe, expect, it, beforeEach } from 'vitest'
import { extractGeneral } from '../../src/extractor/general'

describe('extractGeneral', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.title = ''
    window.history.pushState({}, '', '/')
  })

  it('extracts article markdown, excludes nav and aside, and uses the current URL as source', () => {
    window.history.pushState({}, '', '/articles/basic')
    document.title = 'Basic Article'
    document.body.innerHTML = `
      <nav>Navigation that should not be clipped</nav>
      <main>
        <article>
          <h1>Basic Article</h1>
          <p>This is the <strong>primary article body</strong> that should become markdown.</p>
          <p>It links to <a href="https://example.com/x">an example</a>.</p>
          <p>It includes a second paragraph with useful content.</p>
        </article>
      </main>
      <aside>Sidebar promo that should not be clipped</aside>
    `

    const result = extractGeneral()

    expect(result.title).toBe('Basic Article')
    expect(result.source).toBe(window.location.href)
    expect(result.blocks).toEqual([])
    expect(result.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.markdown).toContain('This is the **primary article body**')
    expect(result.markdown).toContain('[an example](https://example.com/x)')
    expect(result.markdown).toContain('second paragraph')
    expect(result.markdown).not.toContain('<p>')
    expect(result.markdown).not.toContain('Navigation that should not be clipped')
    expect(result.markdown).not.toContain('Sidebar promo that should not be clipped')
  })

  it('returns a defined markdown string for very short content', () => {
    document.title = 'Tiny'
    document.body.innerHTML = '<main><article><p>Short.</p></article></main>'

    const result = extractGeneral()

    expect(result.title).toBe('Tiny')
    expect(result.markdown).toBeDefined()
    expect(typeof result.markdown).toBe('string')
  })

  it('keeps image references as remote URLs without downloading', () => {
    document.title = 'Image Article'
    document.body.innerHTML = `
      <main>
        <article>
          <h1>Image Article</h1>
          <p>Article with a remote image.</p>
          <img src="https://cdn.example.com/images/photo.jpg" alt="Remote photo">
        </article>
      </main>
    `

    const result = extractGeneral()

    expect(result.markdown).toContain('https://cdn.example.com/images/photo.jpg')
    expect(result.markdown).toContain('![Remote photo](https://cdn.example.com/images/photo.jpg)')
    expect(result.markdown).not.toContain('<img')
    expect(result.markdown).not.toContain('data:')
    expect(result.markdown).not.toContain('base64')
  })
})
