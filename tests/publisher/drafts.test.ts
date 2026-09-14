import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPublisherDraft,
  getActivePublisherDraftId,
  getLatestPublisherDraftId,
  getPublisherLayout,
  getPublisherDraft,
  savePublisherDraft,
  savePublisherLayout,
  setActivePublisherDraft,
  setOpeningPublisherDraft,
  takeOpeningPublisherDraftId,
  waitForActivePublisherDraft,
} from '../../src/publisher/drafts'
import type { SourceSnapshot } from '../../src/publisher/types'

const { changeListeners, mockStorage, storageGet, storageSet } = vi.hoisted(() => {
  const mockStorage: Record<string, unknown> = {}
  const changeListeners = new Set<(changes: Record<string, { newValue?: unknown }>, areaName: string) => void>()
  return {
    changeListeners,
    mockStorage,
    storageGet: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
    storageSet: vi.fn(async (value: Record<string, unknown>) => {
      Object.assign(mockStorage, value)
      const changes = Object.fromEntries(Object.entries(value).map(([key, newValue]) => [key, { newValue }]))
      changeListeners.forEach(listener => listener(changes, 'local'))
    }),
  }
})

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: { get: storageGet, set: storageSet },
      onChanged: {
        addListener: (listener: typeof changeListeners extends Set<infer T> ? T : never) => changeListeners.add(listener),
        removeListener: (listener: typeof changeListeners extends Set<infer T> ? T : never) => changeListeners.delete(listener),
      },
    },
  },
}))

beforeEach(() => {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key])
  storageGet.mockClear()
  storageSet.mockClear()
  changeListeners.clear()
  localStorage.clear()
})

const snapshot: SourceSnapshot = {
  id: 'snapshot-1',
  extractedAt: '2026-09-14T06:00:00.000Z',
  markdown: '# 标题\n\n正文',
  meta: { title: '标题', source: 'https://example.com', created: '2026-09-14' },
}

describe('publisher drafts', () => {
  it('creates an empty creative draft without changing the source snapshot', () => {
    const draft = createPublisherDraft(snapshot)

    expect(draft.snapshot).toEqual(snapshot)
    expect(draft.draftMarkdown).toBe('')
    expect(draft.coverEnabled).toBe(false)
    expect(draft.themeId).toBe('minimal')
    expect(draft.currentPage).toBe(0)
  })

  it('saves and loads a cloned draft by snapshot ID', async () => {
    const draft = createPublisherDraft(snapshot)
    await savePublisherDraft(draft)
    draft.snapshot.meta.title = '本地修改'

    const stored = await getPublisherDraft('snapshot-1')
    expect(stored?.snapshot.meta.title).toBe('标题')
    expect(stored).not.toBe(draft)
  })

  it('maps the active browser tab to its current draft', async () => {
    await setActivePublisherDraft(42, 'snapshot-1')
    expect(await getActivePublisherDraftId(42)).toBe('snapshot-1')
  })

  it('waits for the new tab mapping and exact draft instead of returning a previous draft', async () => {
    const pendingDraft = waitForActivePublisherDraft(42, 100)
    await setActivePublisherDraft(42, 'snapshot-1')
    await savePublisherDraft(createPublisherDraft(snapshot))

    expect((await pendingDraft)?.snapshot.id).toBe('snapshot-1')
  })

  it('synchronously routes a repeated panel opening to the new draft once', () => {
    setOpeningPublisherDraft(42, 'snapshot-new')

    expect(takeOpeningPublisherDraftId(42)).toBe('snapshot-new')
    expect(takeOpeningPublisherDraftId(42)).toBeNull()
  })

  it('remembers the latest draft for a source URL', async () => {
    await savePublisherDraft(createPublisherDraft(snapshot))
    expect(await getLatestPublisherDraftId('https://example.com')).toBe('snapshot-1')
  })

  it('loads default layout and clones saved global layout preferences', async () => {
    expect(await getPublisherLayout()).toEqual({
      sizes: [30, 35, 35],
      visible: { source: true, composer: true, output: true },
    })

    const layout = {
      sizes: [40, 0, 60] as [number, number, number],
      visible: { source: true, composer: false, output: true },
    }
    await savePublisherLayout(layout)
    layout.visible.source = false

    expect((await getPublisherLayout()).visible.source).toBe(true)
  })
})
