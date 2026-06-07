import { browser } from 'wxt/browser'

export interface DouyinImportState {
  lastImportedUrl: string
  importedUrlSet: string[]
  lastImportAt?: string
}

const STORAGE_KEY = 'douyin-import-state'

const DEFAULT_STATE: DouyinImportState = {
  lastImportedUrl: '',
  importedUrlSet: [],
}

export async function getDouyinImportState(): Promise<DouyinImportState> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<DouyinImportState>

  return {
    ...DEFAULT_STATE,
    ...stored,
    importedUrlSet: Array.isArray(stored.importedUrlSet) ? stored.importedUrlSet : [],
  }
}

export async function saveDouyinImportState(state: DouyinImportState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state })
}
