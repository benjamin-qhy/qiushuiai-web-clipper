import { blocksToMarkdown } from '../converter/blocks'
import type { DocContent } from '../types'
import type { SourceSnapshot } from './types'

export function createSourceSnapshot(doc: DocContent): SourceSnapshot {
  const meta: SourceSnapshot['meta'] = {
    title: doc.title,
    source: doc.source,
    created: doc.created,
  }

  if (doc.author !== undefined) meta.author = doc.author
  if (doc.published !== undefined) meta.published = doc.published
  if (doc.tags !== undefined) meta.tags = [...doc.tags]

  return {
    id: crypto.randomUUID(),
    extractedAt: new Date().toISOString(),
    markdown: doc.markdown ?? blocksToMarkdown(doc.blocks),
    meta,
  }
}
