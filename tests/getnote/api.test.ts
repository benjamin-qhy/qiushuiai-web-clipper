import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveLinkNote } from '../../src/getnote/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saveLinkNote', () => {
  it('posts link notes with required headers and payload without title', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    })
    vi.stubGlobal('fetch', fetchMock)

    await saveLinkNote({
      clientId: 'cli_xxx',
      authToken: 'gk_live_xxx',
      linkUrl: 'https://example.com/post',
      tags: ['工作', '重要'],
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openapi.biji.com/open/api/v1/resource/note/save')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'X-Client-ID': 'cli_xxx',
      'Authorization': 'gk_live_xxx',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual({
      note_type: 'link',
      link_url: 'https://example.com/post',
      tags: ['工作', '重要'],
    })
  })

  it('throws readable error when api returns failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('unauthorized'),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      saveLinkNote({
        clientId: 'cli_xxx',
        authToken: 'gk_live_xxx',
        linkUrl: 'https://example.com/post',
      }),
    ).rejects.toThrow('Get 笔记保存失败 401: unauthorized')
  })
})
