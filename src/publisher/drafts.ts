import { browser } from 'wxt/browser'
import { createDraft } from '@qiushui/content-publishing-workbench'
import type { DraftInstruction, PublisherDraft, PublisherLayout, SourceSnapshot, WorkbenchPaneId } from './types'

const draftKey = (snapshotId: string) => `publisher-draft:${snapshotId}`
const latestSourceKey = (sourceUrl: string) => `publisher-latest:${sourceUrl}`
const activeTabKey = (tabId: number) => `publisher-active-tab:${tabId}`
const openingTabKey = (tabId: number) => `publisher-opening-tab:${tabId}`
const layoutKey = 'publisher-layout'

const defaultLayout: PublisherLayout = {
  sizes: [30, 35, 35],
  visible: { source: true, composer: true, output: true },
  activePane: 'composer',
}

function normalizePublisherDraft(draft: PublisherDraft): PublisherDraft {
  const defaults = createDraft(draft.snapshot)
  const storedInstruction = draft.instruction as DraftInstruction | undefined | { mode: 'template'; templateId: string } | { mode: 'manual'; content: string }
  const instruction: DraftInstruction = !storedInstruction
    ? defaults.instruction
    : 'manualContent' in storedInstruction
      ? storedInstruction
      : storedInstruction.mode === 'manual'
        ? { mode: 'manual', templateId: '', manualContent: storedInstruction.content }
        : { mode: 'template', templateId: storedInstruction.templateId, manualContent: '' }
  return structuredClone({
    ...defaults,
    ...draft,
    instruction,
    model: draft.model ?? null,
  })
}

export function createPublisherDraft(snapshot: SourceSnapshot): PublisherDraft {
  return createDraft(snapshot)
}

export async function savePublisherDraft(draft: PublisherDraft): Promise<void> {
  await browser.storage.local.set({
    [draftKey(draft.snapshot.id)]: structuredClone(draft),
    [latestSourceKey(draft.snapshot.meta.source)]: draft.snapshot.id,
  })
}

export async function getPublisherDraft(snapshotId: string): Promise<PublisherDraft | null> {
  const key = draftKey(snapshotId)
  const result = await browser.storage.local.get(key)
  const draft = result[key] as PublisherDraft | undefined
  return draft ? normalizePublisherDraft(draft) : null
}

export async function waitForPublisherDraft(
  snapshotId: string,
  timeoutMs = 10_000,
): Promise<PublisherDraft | null> {
  const key = draftKey(snapshotId)

  return new Promise((resolve) => {
    let settled = false
    const finish = (draft: PublisherDraft | null) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeout)
      browser.storage.onChanged.removeListener(onChanged)
      resolve(draft ? normalizePublisherDraft(draft) : null)
    }
    const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      const draft = changes[key]?.newValue as PublisherDraft | undefined
      if (areaName === 'local' && draft) finish(draft)
    }
    const timeout = globalThis.setTimeout(() => finish(null), timeoutMs)

    browser.storage.onChanged.addListener(onChanged)
    getPublisherDraft(snapshotId).then((draft) => {
      if (draft) finish(draft)
    }).catch(() => finish(null))
  })
}

export async function setActivePublisherDraft(tabId: number, snapshotId: string): Promise<void> {
  await browser.storage.local.set({ [activeTabKey(tabId)]: snapshotId })
}

export function setOpeningPublisherDraft(tabId: number, snapshotId: string): void {
  localStorage.setItem(openingTabKey(tabId), snapshotId)
}

export function takeOpeningPublisherDraftId(tabId: number): string | null {
  const key = openingTabKey(tabId)
  const snapshotId = localStorage.getItem(key)
  localStorage.removeItem(key)
  return snapshotId
}

export async function getActivePublisherDraftId(tabId: number): Promise<string | null> {
  const key = activeTabKey(tabId)
  const result = await browser.storage.local.get(key)
  return typeof result[key] === 'string' ? result[key] : null
}

export async function waitForActivePublisherDraft(
  tabId: number,
  timeoutMs = 10_000,
): Promise<PublisherDraft | null> {
  const key = activeTabKey(tabId)
  const existingId = await getActivePublisherDraftId(tabId)
  if (existingId) return waitForPublisherDraft(existingId, timeoutMs)

  return new Promise((resolve) => {
    let settled = false
    const finish = (draft: PublisherDraft | null) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeout)
      browser.storage.onChanged.removeListener(onChanged)
      resolve(draft)
    }
    const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      const draftId = changes[key]?.newValue
      if (areaName !== 'local' || typeof draftId !== 'string') return
      waitForPublisherDraft(draftId, timeoutMs).then(finish)
    }
    const timeout = globalThis.setTimeout(() => finish(null), timeoutMs)

    browser.storage.onChanged.addListener(onChanged)
    getActivePublisherDraftId(tabId).then((draftId) => {
      if (draftId) waitForPublisherDraft(draftId, timeoutMs).then(finish)
    }).catch(() => finish(null))
  })
}

export async function getLatestPublisherDraftId(sourceUrl: string): Promise<string | null> {
  const key = latestSourceKey(sourceUrl)
  const result = await browser.storage.local.get(key)
  return typeof result[key] === 'string' ? result[key] : null
}

export async function savePublisherLayout(layout: PublisherLayout): Promise<void> {
  await browser.storage.local.set({ [layoutKey]: structuredClone(layout) })
}

export async function getPublisherLayout(): Promise<PublisherLayout> {
  const result = await browser.storage.local.get(layoutKey)
  const layout = result[layoutKey] as PublisherLayout | undefined
  const visible = { ...defaultLayout.visible, ...layout?.visible }
  if (!Object.values(visible).some(Boolean)) Object.assign(visible, defaultLayout.visible)
  const sizes = layout?.sizes?.length === 3 && layout.sizes.every(size => Number.isFinite(size) && size >= 0)
    ? layout.sizes
    : defaultLayout.sizes
  const paneIds: WorkbenchPaneId[] = ['source', 'composer', 'output']
  const candidateActive = layout?.activePane
  const storedActive: WorkbenchPaneId = candidateActive !== undefined && paneIds.includes(candidateActive)
    ? candidateActive
    : defaultLayout.activePane
  const activePane = visible[storedActive]
    ? storedActive
    : paneIds.find(pane => visible[pane])!
  return structuredClone({ sizes, visible, activePane })
}
