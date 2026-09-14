export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis' | 'mark'; children: InlineNode[] }
  | { type: 'inlineCode'; value: string }
  | { type: 'link'; url: string; children: InlineNode[] }
  | { type: 'break' }

interface MarkdownInlineNode {
  type: string
  value?: string
  url?: string
  alt?: string
  children?: MarkdownInlineNode[]
}

export function splitHighlightText(value: string): InlineNode[] {
  const result: InlineNode[] = []
  const pattern = /==([^=\n]+)==/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) result.push({ type: 'text', value: value.slice(cursor, index) })
    result.push({ type: 'mark', children: [{ type: 'text', value: match[1] }] })
    cursor = index + match[0].length
  }
  if (cursor < value.length) result.push({ type: 'text', value: value.slice(cursor) })
  return result.length ? result : [{ type: 'text', value }]
}

export function parseInlineNodes(nodes: MarkdownInlineNode[] = []): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    switch (node.type) {
      case 'text': return splitHighlightText(node.value ?? '')
      case 'strong': return [{ type: 'strong', children: parseInlineNodes(node.children) }]
      case 'emphasis': return [{ type: 'emphasis', children: parseInlineNodes(node.children) }]
      case 'inlineCode': return [{ type: 'inlineCode', value: node.value ?? '' }]
      case 'link': return [{ type: 'link', url: node.url ?? '', children: parseInlineNodes(node.children) }]
      case 'break': return [{ type: 'break' }]
      case 'image': return node.alt ? [{ type: 'text', value: node.alt }] : []
      default: return node.children ? parseInlineNodes(node.children) : []
    }
  })
}
