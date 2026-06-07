import type { DouyinFavoriteItemRaw } from './collect'

export type DouyinFavoriteItemStatus = 'idle' | 'skipped' | 'saving' | 'success' | 'error'

export interface DouyinFavoriteItemView extends DouyinFavoriteItemRaw {
  normalizedUrl: string
  selected: boolean
  status: DouyinFavoriteItemStatus
  errorMessage?: string
}

export function buildFavoriteItems(
  raws: DouyinFavoriteItemRaw[],
  importedVideoIds: Set<string>,
  lastImportedId = '',
): DouyinFavoriteItemView[] {
  const cutoffIdx = lastImportedId ? raws.findIndex((r) => r.videoId === lastImportedId) : -1
  return raws.map((raw, i) => {
    const imported = importedVideoIds.has(raw.videoId)
    const pastCutoff = cutoffIdx >= 0 && i >= cutoffIdx
    return {
      ...raw,
      normalizedUrl: raw.url,
      selected: !imported && !pastCutoff,
      status: imported ? 'skipped' : 'idle',
    }
  })
}

export function finalizePrefixProgress(
  importedIds: string[],
  successPrefix: string[],
): { importedUrlSet: string[]; lastImportedUrl: string } {
  const next = new Set(importedIds)
  for (const id of successPrefix) {
    next.add(id)
  }

  return {
    importedUrlSet: Array.from(next),
    lastImportedUrl: successPrefix[successPrefix.length - 1] ?? '',
  }
}
