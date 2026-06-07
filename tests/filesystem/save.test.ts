import { describe, it, expect, vi } from 'vitest'
import {
  saveToVault,
  prepareSaveToDir,
  clearPerNoteAssetsInDir,
  clearSharedImagesInDir,
} from '../../src/filesystem/save'

function makeMockDirHandle(existingFiles: string[] = []): FileSystemDirectoryHandle {
  const files = new Set(existingFiles)

  const subDirHandle = {
    getFileHandle: vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    keys: vi.fn().mockImplementation(async function* () {
      for (const name of files) yield name
    }),
  }

  return {
    getDirectoryHandle: vi.fn().mockResolvedValue(subDirHandle),
  } as unknown as FileSystemDirectoryHandle
}

function makeWritableDirHandle(existingEntries: string[] = []): FileSystemDirectoryHandle {
  const entries = new Set(existingEntries)
  return {
    getFileHandle: vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    keys: vi.fn().mockImplementation(async function* () {
      for (const name of entries) yield name
    }),
    removeEntry: vi.fn().mockImplementation(async (name: string) => {
      entries.delete(name)
    }),
  } as unknown as FileSystemDirectoryHandle
}

describe('saveToVault', () => {
  it('writes file to subdirectory', async () => {
    const rootHandle = makeMockDirHandle()
    await saveToVault(rootHandle, 'Clippings', '我的笔记', '# 内容')
    expect(rootHandle.getDirectoryHandle).toHaveBeenCalledWith('Clippings', { create: true })
  })

  it('resolves conflict by appending -1', async () => {
    const rootHandle = makeMockDirHandle(['我的笔记.md'])
    const result = await saveToVault(rootHandle, 'Clippings', '我的笔记', '# 内容')
    expect(result).toBe('我的笔记-1.md')
  })

  it('returns final filename', async () => {
    const rootHandle = makeMockDirHandle()
    const result = await saveToVault(rootHandle, 'Clippings', '新笔记', '# 内容')
    expect(result).toBe('新笔记.md')
  })
})

describe('prepareSaveToDir', () => {
  it('keeps original filename when user confirms overwrite', async () => {
    const dirHandle = makeWritableDirHandle(['文章.md'])
    const confirmOverwrite = vi.fn().mockResolvedValue(true)

    await expect(prepareSaveToDir(dirHandle, '文章', confirmOverwrite)).resolves.toEqual({
      filename: '文章.md',
      notename: '文章',
      overwrite: true,
    })
  })

  it('falls back to suffixed filename when user declines overwrite', async () => {
    const dirHandle = makeWritableDirHandle(['文章.md', '文章-1.md'])
    const confirmOverwrite = vi.fn().mockResolvedValue(false)

    await expect(prepareSaveToDir(dirHandle, '文章', confirmOverwrite)).resolves.toEqual({
      filename: '文章-2.md',
      notename: '文章-2',
      overwrite: false,
    })
  })
})

describe('asset cleanup', () => {
  it('removes per-note assets directory recursively', async () => {
    const dirHandle = makeWritableDirHandle()

    await clearPerNoteAssetsInDir(dirHandle, '文章')

    expect(dirHandle.removeEntry).toHaveBeenCalledWith('文章.assets', { recursive: true })
  })

  it('removes only shared images for the overwritten note', async () => {
    const imageDirHandle = makeWritableDirHandle([
      '文章-20260521-1.png',
      '文章-20260521-2.png',
      '文章-2-20260521-1.png',
      '其他-20260521-1.png',
    ])
    const rootHandle = {
      getDirectoryHandle: vi.fn().mockResolvedValue(imageDirHandle),
    } as unknown as FileSystemDirectoryHandle

    await clearSharedImagesInDir(rootHandle, 'images', '文章')

    expect(imageDirHandle.removeEntry).toHaveBeenCalledTimes(2)
    expect(imageDirHandle.removeEntry).toHaveBeenCalledWith('文章-20260521-1.png', undefined)
    expect(imageDirHandle.removeEntry).toHaveBeenCalledWith('文章-20260521-2.png', undefined)
  })
})
