import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUpdateChecker } from '../../src/composables/useUpdateChecker'

const { getManifest } = vi.hoisted(() => ({
  getManifest: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getManifest },
  },
}))

beforeEach(() => {
  getManifest.mockReset()
  vi.restoreAllMocks()
})

describe('useUpdateChecker', () => {
  it('sets updateAvailable when remote version is newer', async () => {
    getManifest.mockReturnValue({ version: '1.0.0' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.1.0', releaseUrl: 'https://gitee.com/x', notes: '' }),
    }))
    const { updateAvailable, latestVersion, check } = useUpdateChecker()
    await check()
    expect(updateAvailable.value).toBe(true)
    expect(latestVersion.value).toBe('1.1.0')
  })

  it('does not set updateAvailable when on latest version', async () => {
    getManifest.mockReturnValue({ version: '1.1.0' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.1.0', releaseUrl: 'https://gitee.com/x', notes: '' }),
    }))
    const { updateAvailable, check } = useUpdateChecker()
    await check()
    expect(updateAvailable.value).toBe(false)
  })

  it('does not set updateAvailable when local version is newer', async () => {
    getManifest.mockReturnValue({ version: '2.0.0' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.9.9', releaseUrl: 'https://gitee.com/x', notes: '' }),
    }))
    const { updateAvailable, check } = useUpdateChecker()
    await check()
    expect(updateAvailable.value).toBe(false)
  })

  it('silently ignores network errors', async () => {
    getManifest.mockReturnValue({ version: '1.0.0' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const { updateAvailable, check } = useUpdateChecker()
    await check()
    expect(updateAvailable.value).toBe(false)
  })

  it('silently ignores non-ok HTTP responses', async () => {
    getManifest.mockReturnValue({ version: '1.0.0' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { updateAvailable, check } = useUpdateChecker()
    await check()
    expect(updateAvailable.value).toBe(false)
  })

  it('compares patch version correctly', async () => {
    getManifest.mockReturnValue({ version: '1.0.0' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.0.1', releaseUrl: 'https://gitee.com/x', notes: '' }),
    }))
    const { updateAvailable, check } = useUpdateChecker()
    await check()
    expect(updateAvailable.value).toBe(true)
  })
})
