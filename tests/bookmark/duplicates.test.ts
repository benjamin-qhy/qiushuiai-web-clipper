import { describe, it, expect, vi } from 'vitest'
import { deduplicateByUrl, isDeadLink } from '../../src/bookmark/duplicates'

describe('deduplicateByUrl', () => {
  it('keeps earliest bookmark when URL duplicates', () => {
    const bookmarks = [
      { id: '1', url: 'https://example.com', dateAdded: 200 },
      { id: '2', url: 'https://example.com', dateAdded: 100 },
      { id: '3', url: 'https://other.com', dateAdded: 300 },
    ]
    const { keep, remove } = deduplicateByUrl(bookmarks)
    expect(keep.map(b => b.id)).toContain('2')
    expect(remove.map(b => b.id)).toContain('1')
    expect(keep).toHaveLength(2)
    expect(remove).toHaveLength(1)
  })

  it('keeps single bookmark with no duplicates', () => {
    const bookmarks = [{ id: '1', url: 'https://a.com', dateAdded: 100 }]
    const { keep, remove } = deduplicateByUrl(bookmarks)
    expect(keep).toHaveLength(1)
    expect(remove).toHaveLength(0)
  })

  it('handles bookmarks without url', () => {
    const bookmarks = [{ id: '1', url: undefined as unknown as string, dateAdded: 100 }]
    const { keep, remove } = deduplicateByUrl(bookmarks)
    expect(keep).toHaveLength(0)
    expect(remove).toHaveLength(0)
  })
})

describe('isDeadLink', () => {
  it('returns false when fetch throws (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    expect(await isDeadLink('https://dead.example.com')).toBe(false)
  })

  it('returns true when status >= 400', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 404 } as Response)
    expect(await isDeadLink('https://notfound.example.com')).toBe(true)
  })

  it('returns false when status 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 } as Response)
    expect(await isDeadLink('https://ok.example.com')).toBe(false)
  })
})
