import { browser } from 'wxt/browser'

const STORAGE_KEY = 'qiushui-folder-descriptions'

export async function getFolderDescriptions(): Promise<Record<string, string>> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] ?? {}) as Record<string, string>
}

export async function setFolderDescription(folderId: string, desc: string): Promise<void> {
  const current = await getFolderDescriptions()
  await browser.storage.local.set({ [STORAGE_KEY]: { ...current, [folderId]: desc } })
}
