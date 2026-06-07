import { describe, it, expect } from 'vitest'
import {
  buildFolderPaths,
  buildFolderPathMap,
  buildProcessPrompt,
  parseProcessResult,
} from '../../src/bookmark/classify'
import type { PageMeta } from '../../src/bookmark/meta'

const makeNode = (id: string, title: string, parentId: string, children: object[] = []) => ({
  id, title, parentId, index: 0, dateAdded: 0, children,
})

const sampleTree = [
  makeNode('1', '书签栏', '0', [
    makeNode('2', '工作', '1', [
      makeNode('3', '前端', '2', []),
    ]),
    makeNode('4', '学习', '1', []),
    { id: '5', title: 'React 官网', url: 'https://react.dev', parentId: '1', index: 2, dateAdded: 0 },
  ]),
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tree = sampleTree as any

describe('buildFolderPaths', () => {
  it('returns flat list of folder paths', () => {
    const paths = buildFolderPaths(tree)
    expect(paths).toContain('书签栏')
    expect(paths).toContain('书签栏/工作')
    expect(paths).toContain('书签栏/工作/前端')
    expect(paths).toContain('书签栏/学习')
  })

  it('skips bookmark nodes (nodes with url)', () => {
    const paths = buildFolderPaths(tree)
    expect(paths).not.toContain('书签栏/React 官网')
  })
})

describe('buildFolderPaths with descriptions', () => {
  it('appends description to path when provided', () => {
    // node id '3' is '书签栏/工作/前端'
    const paths = buildFolderPaths(tree, { '3': '前端框架和工具' })
    expect(paths).toContain('书签栏/工作/前端 — 前端框架和工具')
  })

  it('does not append when description is empty string', () => {
    const paths = buildFolderPaths(tree, { '3': '' })
    expect(paths).toContain('书签栏/工作/前端')
    expect(paths.some(p => p.includes(' — '))).toBe(false)
  })

  it('does not append when node id has no entry in descriptions', () => {
    const paths = buildFolderPaths(tree, {})
    expect(paths.some(p => p.includes(' — '))).toBe(false)
  })

  it('existing tests still pass without descriptions argument', () => {
    const paths = buildFolderPaths(tree)
    expect(paths).toContain('书签栏/工作/前端')
  })
})

describe('buildFolderPathMap', () => {
  it('maps path to folder id', () => {
    const map = buildFolderPathMap(tree)
    expect(map.get('书签栏/工作/前端')).toBe('3')
    expect(map.get('书签栏/学习')).toBe('4')
  })

  it('does not include bookmark nodes', () => {
    const map = buildFolderPathMap(tree)
    expect(map.has('书签栏/React 官网')).toBe(false)
  })
})

describe('buildProcessPrompt', () => {
  const meta: PageMeta = { title: 'React', keywords: 'frontend,hooks', description: 'A JS library' }

  it('puts user system prompt and folder list in system part', () => {
    const { system } = buildProcessPrompt(meta, 'https://react.dev', ['书签栏/前端'], '自定义指令')
    expect(system).toContain('自定义指令')
    expect(system).toContain('书签栏/前端')
    expect(system).toContain('"folder"')
    expect(system).toContain('"title"')
    expect(system).toContain('"summary"')
    expect(system).toContain('"tags"')
  })

  it('puts meta info in user part', () => {
    const { user } = buildProcessPrompt(meta, 'https://react.dev', [], '指令')
    expect(user).toContain('React')
    expect(user).toContain('https://react.dev')
    expect(user).toContain('frontend,hooks')
  })
})

describe('parseProcessResult', () => {
  it('parses all fields from valid JSON', () => {
    const raw = JSON.stringify({
      folder: '书签栏/工作/前端',
      title: 'React - 前端框架',
      summary: '这是一个用于构建用户界面的 JavaScript 库。',
      tags: ['前端', 'React'],
    })
    const result = parseProcessResult(raw, '原标题')
    expect(result.folder).toBe('书签栏/工作/前端')
    expect(result.title).toBe('React - 前端框架')
    expect(result.summary).toBe('这是一个用于构建用户界面的 JavaScript 库。')
    expect(result.tags).toEqual(['前端', 'React'])
  })

  it('falls back to 其他 and fallbackTitle on invalid JSON', () => {
    const result = parseProcessResult('not json', '原标题')
    expect(result.folder).toBe('其他')
    expect(result.title).toBe('原标题')
    expect(result.summary).toBe('')
    expect(result.tags).toEqual([])
  })

  it('falls back to 其他 when folder is empty string', () => {
    const result = parseProcessResult('{"folder":"","title":"T","summary":"S","tags":[]}', '原')
    expect(result.folder).toBe('其他')
  })

  it('falls back to fallbackTitle when title is empty', () => {
    const result = parseProcessResult('{"folder":"F","title":"","summary":"S","tags":[]}', '原标题')
    expect(result.title).toBe('原标题')
  })

  it('filters non-string values from tags array', () => {
    const raw = JSON.stringify({ folder: 'F', title: 'T', summary: 'S', tags: ['a', 1, null, 'b'] })
    const result = parseProcessResult(raw, '原')
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('returns empty tags when tags field is missing', () => {
    const raw = JSON.stringify({ folder: 'F', title: 'T', summary: 'S' })
    const result = parseProcessResult(raw, '原')
    expect(result.tags).toEqual([])
  })
})
