export interface DouyinFavoriteItemRaw {
  url: string
  videoId: string
  title: string
  cover: string
  likesText: string
}

export function extractDouyinVideoId(url: string): string {
  try {
    const parsed = new URL(url)
    const pathMatch = parsed.pathname.match(/\/(?:video|detail)\/(\d+)/)
    if (pathMatch) return pathMatch[1]
    const modalId = parsed.searchParams.get('modal_id')
    if (modalId) return modalId
  } catch {
    // ignore
  }
  return ''
}

export function isDouyinFavoritesPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostOk = parsed.hostname === 'douyin.com' || parsed.hostname === 'www.douyin.com'
    return (
      hostOk &&
      parsed.searchParams.get('showTab') === 'favorite_collection' &&
      !parsed.searchParams.has('modal_id')
    )
  } catch {
    return false
  }
}

export function normalizeDouyinWorkUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl)
  parsed.hash = ''
  if (parsed.pathname.includes('/video/') || parsed.pathname.includes('/detail/')) {
    parsed.search = ''
  } else {
    const modalId = parsed.searchParams.get('modal_id')
    parsed.search = modalId ? `?modal_id=${modalId}` : ''
  }
  return parsed.toString()
}


export function collectFavoriteItemsFromPage(): DouyinFavoriteItemRaw[] {
  function isElementVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    let current: HTMLElement | null = element
    while (current) {
      const style = globalThis.getComputedStyle(current)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0'
      ) {
        return false
      }
      current = current.parentElement
    }
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function hasVisibleCardContent(anchor: Element): boolean {
    const image = anchor.querySelector('img')
    if (isElementVisible(image)) return true
    const paragraph =
      anchor.querySelector('p.EtttsrEw') ||
      anchor.querySelector('p.eJFBAbdI') ||
      anchor.querySelector('p')
    if (isElementVisible(paragraph)) {
      const text = (paragraph as HTMLElement).innerText?.trim()
      if (text) return true
    }
    return false
  }

  function getFavoriteTitle(anchor: Element): string {
    const paragraph =
      anchor.querySelector('p.EtttsrEw') ||
      anchor.querySelector('p.eJFBAbdI') ||
      anchor.querySelector('p')
    const paragraphText = (paragraph as HTMLElement | null)?.innerText?.trim()
    if (paragraphText) return paragraphText
    const imageAlt = anchor.querySelector('img')?.getAttribute('alt')?.trim()
    if (imageAlt) return imageAlt
    const aria = anchor.getAttribute('aria-label')?.trim()
    if (aria) return aria
    const title = anchor.getAttribute('title')?.trim()
    if (title) return title
    return (anchor as HTMLElement).innerText?.trim() || ''
  }

  function getFavoriteLikes(anchor: Element): string {
    const likeElement =
      anchor.querySelector('span.BgCg_ebQ') ||
      anchor.querySelector('.author-card-user-video-like span:last-child') ||
      anchor.querySelector('[class*="video-like"] span:last-child')
    return (likeElement as HTMLElement | null)?.innerText?.trim() || ''
  }

  function extractVideoId(absoluteUrl: string): string {
    try {
      const parsed = new URL(absoluteUrl)
      const pathMatch = parsed.pathname.match(/\/(?:video|detail)\/(\d+)/)
      if (pathMatch) return pathMatch[1]
      const modalId = parsed.searchParams.get('modal_id')
      if (modalId) return modalId
    } catch {
      // ignore
    }
    return ''
  }

  const anchors = Array.from(document.querySelectorAll('a[href]'))
  const seen = new Set<string>()
  const items: DouyinFavoriteItemRaw[] = []

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || ''
    if (!href.includes('/video/') && !href.includes('/detail/') && !href.includes('modal_id=')) {
      continue
    }
    if (!hasVisibleCardContent(anchor)) continue

    let absoluteUrl = ''
    try {
      absoluteUrl = new URL(href, location.href).toString()
    } catch {
      continue
    }

    const videoId = extractVideoId(absoluteUrl)
    if (!videoId) continue
    if (seen.has(videoId)) continue
    seen.add(videoId)

    const image = anchor.querySelector('img')
    const cover =
      image?.getAttribute('src')?.trim() ||
      image?.getAttribute('data-src')?.trim() ||
      ''

    items.push({
      url: absoluteUrl,
      videoId,
      title: getFavoriteTitle(anchor),
      cover,
      likesText: getFavoriteLikes(anchor),
    })
  }

  return items
}
