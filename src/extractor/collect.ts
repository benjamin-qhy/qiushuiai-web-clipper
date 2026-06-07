import type { Block, BlockType } from '../types'
import { parseBlock, SKIP_TYPES, extractAiSummaryText } from './blocks'

const CONTAINER_SELECTOR = '#mainBox .bear-web-x-container'
const SCROLL_STEP = 400
const SCROLL_DELAY = 300
const MAX_WAIT = 60_000
const LOG_PREFIX = '[feishu-clipper][collect]'

export async function scrollAndCollectBlocks(): Promise<{ container: Element | null; blocks: Block[]; description: string }> {
  const container = document.querySelector(CONTAINER_SELECTOR)
  if (!container) {
    console.info(`${LOG_PREFIX} container not found`, { selector: CONTAINER_SELECTOR, href: location.href })
    return { container: null, blocks: [], description: '' }
  }

  const order = new Map<string, number>()   // subId -> insertion index
  const collected = new Map<string, Block>() // subId -> Block
  const processedIds = new Set<string>()     // blockId（已处理，防止重复采集）
  const blobCaptures: Array<Promise<void>> = [] // blob 图片立即捕获任务
  let counter = 0
  const startedAt = Date.now()

  console.info(`${LOG_PREFIX} start`, {
    href: location.href,
    title: document.title,
    container: describeElement(container),
  })

  function collectVisible(stage: string): number {
    let added = 0
    for (const el of container!.querySelectorAll('[data-block-type]')) {
      const type = el.getAttribute('data-block-type') as BlockType
      if (!type || SKIP_TYPES.has(type)) continue
      // 只过滤 ai-summary 内部子块（不过滤 grid/其他 skip 容器的子块，避免漏掉图片）
      if (isInsideAiSummary(el, container!)) continue

      const blockId = el.getAttribute('data-block-id') ?? `${type}_${counter}`
      if (processedIds.has(blockId)) continue

      const blocks = parseBlock(el, type)
      if (blocks.length === 0) continue

      processedIds.add(blockId)
      for (let i = 0; i < blocks.length; i++) {
        const subId = blocks.length > 1 ? `${blockId}_${i}` : blockId
        order.set(subId, counter++)
        collected.set(subId, blocks[i])
        added++

        // blob URL 在 block 离开视口后会被回收，必须立即用 canvas 转成 data URL
        if (blocks[i].type === 'image' && blocks[i].src?.startsWith('blob:')) {
          const src = blocks[i].src!
          blobCaptures.push(
            blobUrlToDataUrl(src).then(dataUrl => {
              if (dataUrl) collected.set(subId, { ...collected.get(subId)!, src: dataUrl })
            })
          )
        }
      }
    }

    console.info(`${LOG_PREFIX} collect`, {
      stage,
      added,
      total: collected.size,
      processed: processedIds.size,
      blobs: blobCaptures.length,
    })
    return added
  }

  const scrollable = findScrollTarget(container)
  console.info(`${LOG_PREFIX} scroll target`, {
    found: Boolean(scrollable),
    target: scrollable ? describeElement(scrollable) : null,
  })

  // 在滚动前（内容在顶部）提取 AI速览
  const description = extractAiSummaryText(container)
  console.info(`${LOG_PREFIX} ai summary`, { length: description.length })

  if (!scrollable) {
    collectVisible('no-scroll-target')
    console.info(`${LOG_PREFIX} done`, {
      reason: 'no-scroll-target',
      durationMs: Date.now() - startedAt,
      blocks: collected.size,
    })
    return { container, blocks: sorted(order, collected), description }
  }

  scrollable.scrollTop = 0
  await delay(SCROLL_DELAY)
  collectVisible('initial')

  const start = Date.now()
  let prevScrollTop = -1
  let iterations = 0

  while (Date.now() - start < MAX_WAIT) {
    iterations++
    const before = scrollable.scrollTop
    scrollable.scrollTop += SCROLL_STEP
    await delay(SCROLL_DELAY)
    const after = scrollable.scrollTop
    const visibleAdded = collectVisible(`iteration-${iterations}`)
    console.info(`${LOG_PREFIX} step`, {
      iteration: iterations,
      before,
      after,
      clientHeight: scrollable.clientHeight,
      scrollHeight: scrollable.scrollHeight,
      added: visibleAdded,
      elapsedMs: Date.now() - start,
    })

    if (scrollable.scrollTop === prevScrollTop) {
      // 真正到达底部，多等一会儿让懒加载内容渲染完再收集一次
      await delay(SCROLL_DELAY * 3)
      collectVisible('bottom-confirmation')
      console.info(`${LOG_PREFIX} done`, {
        reason: 'bottom-reached',
        iterations,
        durationMs: Date.now() - startedAt,
        blocks: collected.size,
        processed: processedIds.size,
      })
      break
    }
    prevScrollTop = scrollable.scrollTop
  }

  if (Date.now() - start >= MAX_WAIT) {
    console.info(`${LOG_PREFIX} done`, {
      reason: 'timeout',
      iterations,
      durationMs: Date.now() - startedAt,
      blocks: collected.size,
      processed: processedIds.size,
      scrollTop: scrollable.scrollTop,
      clientHeight: scrollable.clientHeight,
      scrollHeight: scrollable.scrollHeight,
      prevScrollTop,
    })
  }

  await Promise.all(blobCaptures)
  return { container, blocks: sorted(order, collected), description }
}

function sorted(order: Map<string, number>, collected: Map<string, Block>): Block[] {
  return [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => collected.get(id)!)
}

// 只过滤 ai-summary 的子块（其内容已单独提取为 description，不应混入正文）
function isInsideAiSummary(el: Element, root: Element): boolean {
  let node = el.parentElement
  while (node && node !== root) {
    if (node.getAttribute('data-block-type') === 'ai-summary') return true
    node = node.parentElement
  }
  return false
}

function findScrollTarget(container: Element): Element | null {
  let node: Element | null = container
  while (node && node !== document.body) {
    const { overflow, overflowY } = getComputedStyle(node)
    if (['auto', 'scroll'].includes(overflow) || ['auto', 'scroll'].includes(overflowY)) {
      return node
    }
    node = node.parentElement
  }

  node = container.parentElement
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight + 50 && node.clientHeight > 200) {
      return node
    }
    node = node.parentElement
  }

  const candidates = [...document.querySelectorAll('*')].filter(el => {
    try {
      return el !== document.body &&
        el.scrollHeight > el.clientHeight + 100 &&
        el.clientHeight > 300
    } catch { return false }
  })

  return candidates.sort((a, b) => a.scrollHeight - b.scrollHeight)[0] ?? null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function describeElement(el: Element): Record<string, unknown> {
  const rect = el.getBoundingClientRect()
  return {
    tagName: el.tagName,
    className: el.className,
    id: el.id || undefined,
    dataBlockType: el.getAttribute('data-block-type') || undefined,
    dataBlockId: el.getAttribute('data-block-id') || undefined,
    scrollTop: (el as HTMLElement).scrollTop,
    scrollHeight: (el as HTMLElement).scrollHeight,
    clientHeight: (el as HTMLElement).clientHeight,
    rect: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  }
}

function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || 100
        c.height = img.naturalHeight || 100
        c.getContext('2d')?.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.95))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })
}
