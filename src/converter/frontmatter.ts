import type { DocMeta } from '../types'

export function buildFrontmatter(meta: DocMeta): string {
  const lines: string[] = ['---']
  lines.push(`title: "${meta.title}"`)
  lines.push(`source: "${meta.source}"`)
  if (meta.author) {
    lines.push('author:')
    lines.push(`  - "[[${meta.author}]]"`)
  } else {
    lines.push('author:')
  }
  lines.push(meta.published ? `published: ${meta.published}` : 'published:')
  lines.push(`created: ${meta.created}`)
  if (meta.description) {
    const desc = meta.description.trim()
    if (desc.includes('\n')) {
      lines.push('description: |')
      for (const l of desc.split('\n')) lines.push(`  ${l}`)
    } else {
      lines.push(`description: "${desc.replace(/"/g, '\\"')}"`)
    }
  } else {
    lines.push('description:')
  }
  if (meta.tags && meta.tags.length > 0) {
    lines.push('tags:')
    for (const tag of meta.tags) lines.push(`  - "${tag}"`)
  } else {
    lines.push('tags:')
  }
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}
