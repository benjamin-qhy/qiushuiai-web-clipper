import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storageGet, storageSet } = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}))

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

import { getDouyinImportState, saveDouyinImportState } from '../../src/storage/douyinImports'

describe('douyin import storage', () => {
  beforeEach(() => {
    storageGet.mockReset()
    storageSet.mockReset()
  })

  it('returns defaults when nothing is stored', async () => {
    storageGet.mockResolvedValue({})

    await expect(getDouyinImportState()).resolves.toEqual({
      lastImportedUrl: '',
      importedUrlSet: [],
      lastImportAt: undefined,
    })
  })

  it('persists the provided state', async () => {
    const state = {
      lastImportedUrl: 'https://www.douyin.com/video/1',
      importedUrlSet: ['https://www.douyin.com/video/1'],
      lastImportAt: '2026-05-22T10:00:00.000Z',
    }

    await saveDouyinImportState(state)

    expect(storageSet).toHaveBeenCalledWith({
      'douyin-import-state': state,
    })
  })
})
