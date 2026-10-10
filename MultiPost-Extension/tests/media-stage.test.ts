import { expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { stagePublishingMedia } from '../src/sync/media-stage'

it('rejects a wrong site, expired transfer and out-of-order media without exposing a usable file', async () => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  const data = { runId: 'run', deadline: Date.now() + 10000, name: 'v.mp4', type: 'video/mp4', size: 4, sha256: '0'.repeat(64), offset: 0, chunk: 'dGVzdA==', final: false }
  try {
    expect(await stagePublishingMedia({ ...data, deadline: 0 })).toBe('PREPARATION_EXPIRED')
    expect(await stagePublishingMedia({ ...data, offset: 2 })).toBe('MEDIA_ORDER_MISMATCH')
    expect(await stagePublishingMedia(data)).toBe('MEDIA_CHUNK_STAGED')
    expect(await stagePublishingMedia(data)).toBe('MEDIA_ORDER_MISMATCH')
    vi.stubGlobal('crypto', webcrypto)
    expect(await stagePublishingMedia({ ...data, offset: 4, chunk: '', final: true })).toBe('ASSET_DIGEST_MISMATCH')
    vi.stubGlobal('location', new URL('https://example.com/'))
    expect(await stagePublishingMedia(data)).toBe('PAGE_NOT_READY')
  } finally { vi.unstubAllGlobals(); delete (globalThis as any).haiqiaiMedia }
})
