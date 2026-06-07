const CONTAINER_SELECTOR = '#mainBox .bear-web-x-container'
const SCROLL_STEP = 800
const SCROLL_DELAY = 120   // ms，等待虚拟渲染
const MAX_WAIT = 15_000    // ms，最多等待 15 秒

export async function scrollToLoadAll(): Promise<Element | null> {
  const container = document.querySelector(CONTAINER_SELECTOR)
  if (!container) return null

  const scrollable = findScrollable(container)

  if (scrollable) {
    await scrollElement(scrollable)
  } else {
    // 回退：用 window 滚动（飞书某些布局下页面级别滚动）
    await scrollWindow()
  }

  return container
}

async function scrollElement(scrollable: Element): Promise<void> {
  const start = Date.now()
  let lastHeight = 0

  while (Date.now() - start < MAX_WAIT) {
    scrollable.scrollTop += SCROLL_STEP
    await delay(SCROLL_DELAY)
    const newHeight = scrollable.scrollHeight
    if (newHeight === lastHeight && scrollable.scrollTop + scrollable.clientHeight >= newHeight) break
    lastHeight = newHeight
  }

  scrollable.scrollTop = 0
  await delay(SCROLL_DELAY)
}

async function scrollWindow(): Promise<void> {
  // 找 scrollHeight > clientHeight 的非 body 元素（飞书虚拟滚动容器）
  const candidates = [...document.querySelectorAll('*')].filter(el => {
    try {
      return el !== document.body &&
        el.scrollHeight > el.clientHeight + 100 &&
        el.clientHeight > 300
    } catch { return false }
  })

  // 优先选最接近文档内容的（scrollHeight 最小但仍大于 clientHeight）
  const target = candidates.sort((a, b) => a.scrollHeight - b.scrollHeight)[0]

  if (target) {
    await scrollElement(target)
  }
  // 找不到可滚动容器时直接返回，不移动页面
}

function findScrollable(el: Element): Element | null {
  // 先用 CSS overflow 找
  let node: Element | null = el
  while (node && node !== document.body) {
    const { overflow, overflowY } = getComputedStyle(node)
    if (['auto', 'scroll'].includes(overflow) || ['auto', 'scroll'].includes(overflowY)) {
      return node
    }
    node = node.parentElement
  }

  // 回退：找 scrollHeight > clientHeight 的祖先（飞书自定义滚动容器）
  node = el.parentElement
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight + 50 && node.clientHeight > 200) {
      return node
    }
    node = node.parentElement
  }

  return null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
