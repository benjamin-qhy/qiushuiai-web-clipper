import { describe, it, expect } from 'vitest'
import { buildFrontmatter } from '../../src/converter/frontmatter'
import type { DocMeta } from '../../src/types'

describe('buildFrontmatter', () => {
  it('full metadata', () => {
    const meta: DocMeta = {
      title: '我的会议记录',
      source: 'https://xxx.feishu.cn/docx/abc123',
      author: '张三',
      published: '2026-04-01',
      created: '2026-05-08',
    }
    const result = buildFrontmatter(meta)
    expect(result).toContain('title: "我的会议记录"')
    expect(result).toContain('source: "https://xxx.feishu.cn/docx/abc123"')
    expect(result).toContain('- "[[张三]]"')
    expect(result).toContain('published: 2026-04-01')
    expect(result).toContain('created: 2026-05-08')
    expect(result).toContain('- "clippings"')
    expect(result).toMatch(/^---\n/)
    expect(result).toMatch(/\n---\n$/)
  })

  it('no author - author field is null/empty list', () => {
    const meta: DocMeta = {
      title: '无作者文档',
      source: 'https://feishu.cn/docx/xyz',
      created: '2026-05-08',
    }
    const result = buildFrontmatter(meta)
    expect(result).not.toContain('[[')
    expect(result).toContain('author:')
  })

  it('no published - published field is null', () => {
    const meta: DocMeta = {
      title: '测试',
      source: 'https://feishu.cn/docx/xyz',
      created: '2026-05-08',
    }
    const result = buildFrontmatter(meta)
    expect(result).toContain('published:')
  })
})
