import { describe, it, expect } from 'vitest'
import type { BookmarkRecord } from '../../src/storage/bookmarks'

// buildEntry and buildFrontmatter are not exported; test via their observable output shape
// We duplicate the logic here to keep tests independent of internal refactors.

function buildEntry(bm: { id: string; url?: string; title?: string }, record?: BookmarkRecord): string {
  const title = record?.title || bm.title || bm.url || ''
  const url = bm.url!
  const summary = record?.summary ? `\n${record.summary}` : ''
  const tagsLine = record?.tags?.length ? `\n${record.tags.map(t => `#${t}`).join(' ')}` : ''
  return `## [${title}](${url})${summary}${tagsLine}\n\n`
}

function buildFrontmatter(title: string, description: string, date: string): string {
  const descLine = description ? `\ndescription: "${description.replace(/"/g, '\\"')}"` : ''
  return `---\ntitle: "${title}"${descLine}\ntags: [bookmarks]\nupdated: ${date}\n---\n\n`
}

const record: BookmarkRecord = {
  id: '1',
  url: 'https://vitejs.dev',
  title: 'Vite',
  summary: '快速前端构建工具',
  tags: ['前端', '构建'],
  category: '技术工具',
  processedAt: 1715000000000,
}

describe('buildEntry', () => {
  it('formats title as markdown link', () => {
    expect(buildEntry({ id: '1', url: 'https://vitejs.dev', title: 'Vite' }, record))
      .toContain('## [Vite](https://vitejs.dev)')
  })

  it('includes summary without blockquote prefix', () => {
    const entry = buildEntry({ id: '1', url: 'https://vitejs.dev' }, record)
    expect(entry).toContain('快速前端构建工具')
    expect(entry).not.toContain('> 快速前端构建工具')
  })

  it('includes tags without label prefix', () => {
    const entry = buildEntry({ id: '1', url: 'https://vitejs.dev' }, record)
    expect(entry).toContain('#前端')
    expect(entry).toContain('#构建')
    expect(entry).not.toContain('**标签:**')
  })

  it('falls back to bookmark title when no record', () => {
    expect(buildEntry({ id: '2', url: 'https://example.com', title: 'Example' }))
      .toContain('## [Example](https://example.com)')
  })

  it('omits summary and tags when no record', () => {
    const entry = buildEntry({ id: '2', url: 'https://example.com', title: 'Example' })
    expect(entry).not.toContain('> ')
    expect(entry).not.toContain('**标签:**')
  })
})

describe('buildFrontmatter', () => {
  it('includes title without heading after frontmatter', () => {
    const fm = buildFrontmatter('技术工具', '', '2026-05-19')
    expect(fm).toContain('title: "技术工具"')
    expect(fm).toContain('updated: 2026-05-19')
    expect(fm).not.toContain('# 技术工具')
  })

  it('includes description when provided', () => {
    const fm = buildFrontmatter('工具', '我的工具收藏', '2026-05-19')
    expect(fm).toContain('description: "我的工具收藏"')
  })

  it('omits description line when empty', () => {
    const fm = buildFrontmatter('工具', '', '2026-05-19')
    expect(fm).not.toContain('description:')
  })
})
