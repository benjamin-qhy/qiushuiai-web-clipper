export type BookmarkSortMode = 'original' | 'domain'

interface BookmarkLike {
  title?: string
  url?: string
}

export function sortBookmarks<T extends BookmarkLike>(bookmarks: T[], mode: BookmarkSortMode): T[] {
  const items = [...bookmarks]
  if (mode === 'original') return items

  return items.sort((a, b) => {
    const domainCompare = compareText(domainKey(a.url), domainKey(b.url))
    if (domainCompare !== 0) return domainCompare

    const titleCompare = compareText((a.title ?? '').toLowerCase(), (b.title ?? '').toLowerCase())
    if (titleCompare !== 0) return titleCompare

    return compareText((a.url ?? '').toLowerCase(), (b.url ?? '').toLowerCase())
  })
}

function domainKey(url?: string): string {
  if (!url) return '\uffff'

  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return '\uffff'
  }
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b)
}
