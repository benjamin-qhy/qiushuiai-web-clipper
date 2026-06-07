import Defuddle from 'defuddle/full'
import type { DocContent } from '../types'

function resolveLazyImages() {
  const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-actualsrc']
  document.querySelectorAll('img').forEach(img => {
    for (const attr of lazyAttrs) {
      const val = img.getAttribute(attr)
      if (val && val.startsWith('http')) {
        img.src = val
        break
      }
    }
  })
}

function walkNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/[\r\n]+/g, ' ') ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as Element
  const tag = el.tagName.toLowerCase()

  if (['script', 'style', 'nav', 'header', 'footer', 'aside'].includes(tag)) return ''

  const children = () => [...el.childNodes].map(walkNode).join('')
  const inner = () => children().trim()

  switch (tag) {
    case 'h1': return `\n\n# ${inner()}\n\n`
    case 'h2': return `\n\n## ${inner()}\n\n`
    case 'h3': return `\n\n### ${inner()}\n\n`
    case 'h4': return `\n\n#### ${inner()}\n\n`
    case 'h5': return `\n\n##### ${inner()}\n\n`
    case 'h6': return `\n\n###### ${inner()}\n\n`
    case 'p': return `\n\n${inner()}\n\n`
    case 'br': return '\n'
    case 'hr': return '\n\n---\n\n'
    case 'strong':
    case 'b': { const t = inner(); return t ? `**${t}**` : '' }
    case 'em':
    case 'i': { const t = inner(); return t ? `*${t}*` : '' }
    case 'del':
    case 's': { const t = inner(); return t ? `~~${t}~~` : '' }
    case 'code': return `\`${el.textContent}\``
    case 'pre': {
      const codeEl = el.querySelector('code')
      const lang = codeEl?.className.match(/language-(\w+)/)?.[1] ?? ''
      return `\n\n\`\`\`${lang}\n${(codeEl ?? el).textContent?.trim()}\n\`\`\`\n\n`
    }
    case 'a': {
      const href = el.getAttribute('href')
      const t = inner()
      if (!t) return ''
      return href && !href.startsWith('javascript') ? `[${t}](${href})` : t
    }
    case 'img': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? ''
      if (!src || src.startsWith('data:')) return ''
      return `\n\n![${alt}](${src})\n\n`
    }
    case 'ul': {
      const items = [...el.querySelectorAll(':scope > li')]
        .map(li => `- ${walkNode(li).trim()}`).join('\n')
      return items ? `\n\n${items}\n\n` : ''
    }
    case 'ol': {
      const items = [...el.querySelectorAll(':scope > li')]
        .map((li, i) => `${i + 1}. ${walkNode(li).trim()}`).join('\n')
      return items ? `\n\n${items}\n\n` : ''
    }
    case 'blockquote': {
      const t = inner().replace(/^/gm, '> ')
      return `\n\n${t}\n\n`
    }
    case 'table': return `\n\n${el.textContent?.trim()}\n\n`
    default: return children()
  }
}

function htmlToMarkdown(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return walkNode(doc.body).replace(/\n{3,}/g, '\n\n').trim()
}

function findContentElement(): Element | null {
  // Site-specific high-confidence selectors
  for (const sel of ['#js_content', '.rich_media_content', '#article-content', '#content_html']) {
    const el = document.querySelector(sel)
    if (el) return el
  }
  // <article> — pick the one with most text if multiple
  const articles = [...document.querySelectorAll('article')]
  if (articles.length === 1) return articles[0]
  if (articles.length > 1) {
    const best = articles.reduce((a, b) =>
      (a.textContent?.length ?? 0) >= (b.textContent?.length ?? 0) ? a : b
    )
    if ((best.textContent?.length ?? 0) > 300) return best
  }
  // Generic fallbacks
  for (const sel of ['main', '[role="main"]', '.article-content', '.post-content', '.entry-content']) {
    const el = document.querySelector(sel)
    if (el && (el.textContent?.length ?? 0) > 300) return el
  }
  return null
}

export function extractGeneral(): DocContent {
  resolveLazyImages()
  const result = new Defuddle(document).parse()

  const title = (result.title ?? document.title ?? '').trim() || 'Untitled'

  // Walk live DOM directly so resolveLazyImages() src values are used.
  // Fall back to Defuddle HTML only when no content container is found.
  const container = findContentElement()
  const markdown = container
    ? walkNode(container).replace(/\n{3,}/g, '\n\n').trim()
    : htmlToMarkdown(result.content ?? '')

  return {
    title,
    source: window.location.href,
    author: result.author ?? undefined,
    published: result.published ?? undefined,
    created: new Date().toISOString().slice(0, 10),
    description: result.description ?? undefined,
    blocks: [],
    markdown,
  }
}
