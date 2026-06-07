import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFolderDescriptions, setFolderDescription } from '../../src/storage/folderDescriptions'

const STORAGE_KEY = 'qiushui-folder-descriptions'

const { mockStorage, storageGet, storageSet } = vi.hoisted(() => {
  const mockStorage: Record<string, unknown> = {}
  return {
    mockStorage,
    storageGet: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
    storageSet: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(mockStorage, obj)
    }),
  }
})

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
      },
    },
  },
}))

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  storageGet.mockClear()
  storageSet.mockClear()
})

describe('getFolderDescriptions', () => {
  it('returns empty object when nothing stored', async () => {
    const result = await getFolderDescriptions()
    expect(result).toEqual({})
  })

  it('returns stored descriptions', async () => {
    mockStorage[STORAGE_KEY] = { 'folder-1': '前端工具和教程' }
    const result = await getFolderDescriptions()
    expect(result['folder-1']).toBe('前端工具和教程')
  })
})

describe('setFolderDescription', () => {
  it('stores a description for a folder id', async () => {
    await setFolderDescription('folder-1', '购物网站')
    const stored = mockStorage[STORAGE_KEY] as Record<string, string>
    expect(stored['folder-1']).toBe('购物网站')
  })

  it('merges with existing descriptions, does not overwrite other keys', async () => {
    mockStorage[STORAGE_KEY] = { 'folder-1': '已有说明' }
    await setFolderDescription('folder-2', '新说明')
    const stored = mockStorage[STORAGE_KEY] as Record<string, string>
    expect(stored['folder-1']).toBe('已有说明')
    expect(stored['folder-2']).toBe('新说明')
  })

  it('saves empty string (allows clearing a description)', async () => {
    mockStorage[STORAGE_KEY] = { 'folder-1': '原说明' }
    await setFolderDescription('folder-1', '')
    const stored = mockStorage[STORAGE_KEY] as Record<string, string>
    expect(stored['folder-1']).toBe('')
  })
})
