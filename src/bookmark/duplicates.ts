interface MinimalBookmark {
  id: string
  title?: string
  url?: string
  dateAdded?: number
}

export function deduplicateByUrl(bookmarks: MinimalBookmark[]): {
  keep: MinimalBookmark[]
  remove: MinimalBookmark[]
} {
  const byUrl = new Map<string, MinimalBookmark>()
  const remove: MinimalBookmark[] = []

  for (const bm of bookmarks) {
    if (!bm.url) continue
    const existing = byUrl.get(bm.url)
    if (!existing) {
      byUrl.set(bm.url, bm)
    } else {
      const keepExisting = (existing.dateAdded ?? 0) <= (bm.dateAdded ?? 0)
      if (keepExisting) {
        remove.push(bm)
      } else {
        remove.push(existing)
        byUrl.set(bm.url, bm)
      }
    }
  }

  return { keep: Array.from(byUrl.values()), remove }
}

export async function isDeadLink(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    // Only treat explicit "not found" / "gone" as dead links.
    // Network errors, timeouts, CORS failures, server errors etc. are NOT dead links.
    return res.status === 404 || res.status === 410
  } catch {
    // Network error / timeout / CORS — cannot determine, assume alive
    return false
  }
}
