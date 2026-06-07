import { describe, expect, it } from 'vitest'
import { sortBookmarks, type BookmarkSortMode } from '../../src/bookmark/sort'

interface BookmarkLike {
  id: string
  title?: string
  url?: string
}

describe('sortBookmarks', () => {
  const bookmarks: BookmarkLike[] = [
    { id: '1', title: 'Zeta', url: 'https://zeta.example/path' },
    { id: '2', title: 'Docs', url: 'https://beta.example/docs' },
    { id: '3', title: 'Alpha', url: 'https://beta.example/alpha' },
    { id: '4', title: 'Broken', url: 'not a valid url' },
  ]

  it('keeps original order in original mode', () => {
    const result = sortBookmarks(bookmarks, 'original')
    expect(result.map(bm => bm.id)).toEqual(['1', '2', '3', '4'])
  })

  it('sorts by domain, then title, then url', () => {
    const result = sortBookmarks(bookmarks, 'domain')
    expect(result.map(bm => bm.id)).toEqual(['3', '2', '1', '4'])
  })

  it('returns a new array for both sort modes', () => {
    const modes: BookmarkSortMode[] = ['original', 'domain']

    for (const mode of modes) {
      expect(sortBookmarks(bookmarks, mode)).not.toBe(bookmarks)
    }
  })
})
