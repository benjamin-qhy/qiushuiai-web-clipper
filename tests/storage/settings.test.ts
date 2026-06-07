import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/storage/settings'

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

describe('getSettings', () => {
  it('returns defaults when nothing stored', async () => {
    const s = await getSettings()
    expect(s.subDir).toBe('Clippings')
    expect(s.imageMode).toBe('local')
    expect(s.ossProvider).toBe('aliyun')
    expect(s.aliyunOSS.prefix).toBe('qiushui-web-clipper')
    expect(s.aliyunOSS.customDomain).toBe('')
    expect(s.getNote.clientId).toBe('')
    expect(s.getNote.authToken).toBe('')
  })

  it('merges stored values over defaults', async () => {
    mockStorage['feishu-clipper-settings'] = { subDir: 'Notes', imageMode: 'oss' }
    const s = await getSettings()
    expect(s.subDir).toBe('Notes')
    expect(s.imageMode).toBe('oss')
    expect(s.aliyunOSS.region).toBe('oss-cn-hangzhou')
  })

  it('merges nested get note settings over defaults', async () => {
    mockStorage['feishu-clipper-settings'] = { getNote: { clientId: 'cli_123' } }
    const s = await getSettings()
    expect(s.getNote.clientId).toBe('cli_123')
    expect(s.getNote.authToken).toBe('')
  })
})

describe('saveSettings', () => {
  it('persists settings to browser.storage.local', async () => {
    const settings = { ...DEFAULT_SETTINGS, subDir: 'Archive' }
    await saveSettings(settings)
    const stored = mockStorage['feishu-clipper-settings'] as typeof settings
    expect(stored.subDir).toBe('Archive')
  })
})
