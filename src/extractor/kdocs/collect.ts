import type { Block } from '../../types'
import { parseKdocsBlock } from './blocks'

const CONTAINER_SELECTOR = '#otl-main-editor'
const SCROLL_STEP = 400
const SCROLL_DELAY = 300
const MAX_WAIT = 60_000
const LOG_PREFIX = '[kdocs-clipper][collect]'

export async function scrollAndCollectKdocsBlocks(): Promise<{
  container: Element | null
  blocks: Block[]
}> {
  const container = document.querySelector(CONTAINER_SELECTOR)
  if (!container) {
    console.info(`${LOG_PREFIX} container not found`)
    return { container: null, blocks: [] }
  }

  const order = new Map<string, number>()
  const collected = new Map<string, Block>()
  const processedIds = new Set<string>()
  const blobCaptures: Array<Promise<void>> = []
  let counter = 0

  function collectVisible(): number {
    let added = 0
    // Only top-level block_tiles (skip those inside table cells)
    for (const bt of container!.querySelectorAll('.block_tile')) {
      if (bt.closest('.sub-doc')) continue

      const id = bt.id || `block_${counter}`
      if (processedIds.has(id)) continue

      const blocks = parseKdocsBlock(bt)
      if (blocks.length === 0) continue

      processedIds.add(id)
      for (let i = 0; i < blocks.length; i++) {
        const subId = blocks.length > 1 ? `${id}_${i}` : id
        order.set(subId, counter++)
        collected.set(subId, blocks[i])
        added++

        // Blob images must be captured immediately before viewport exit
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
    return added
  }

  const scrollable = findScrollTarget(container)

  if (!scrollable) {
    collectVisible()
    console.info(`${LOG_PREFIX} done (no scroll target)`, { blocks: collected.size })
    return { container, blocks: sorted(order, collected) }
  }

  scrollable.scrollTop = 0
  await delay(SCROLL_DELAY)
  collectVisible()

  const start = Date.now()
  let prevScrollTop = -1
  let iterations = 0

  while (Date.now() - start < MAX_WAIT) {
    iterations++
    scrollable.scrollTop += SCROLL_STEP
    await delay(SCROLL_DELAY)
    collectVisible()

    if (scrollable.scrollTop === prevScrollTop) {
      await delay(SCROLL_DELAY * 3)
      collectVisible()
      console.info(`${LOG_PREFIX} done (bottom)`, { iterations, blocks: collected.size })
      break
    }
    prevScrollTop = scrollable.scrollTop
  }

  await Promise.all(blobCaptures)
  return { container, blocks: sorted(order, collected) }
}

function sorted(order: Map<string, number>, collected: Map<string, Block>): Block[] {
  return [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => collected.get(id)!)
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
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
