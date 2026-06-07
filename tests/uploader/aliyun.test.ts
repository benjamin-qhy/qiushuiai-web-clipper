import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AliyunOSSUploader,
  OSS_SIGNATURE_DIAGNOSTIC_VERSION,
  buildObjectKey,
  formatTimestamp,
  mimeToExt,
} from '../../src/uploader/aliyun'

const fixedDate = new Date('2026-05-09T14:30:22.583Z')

const config = {
  accessKeyId: 'access-key-id',
  accessKeySecret: 'access-key-secret',
  bucket: 'test-bucket',
  region: 'oss-cn-hangzhou',
  prefix: '/obsidian//clips/',
  customDomain: '',
}

function mockCrypto() {
  const importKey = vi.fn().mockResolvedValue('key')
  const sign = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
  vi.stubGlobal('crypto', {
    subtle: {
      importKey,
      sign,
    },
  })
  return { importKey, sign }
}

function mockFetch(ok = true, text = '') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 403,
    text: vi.fn().mockResolvedValue(text),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(fixedDate)
  mockCrypto()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('formatTimestamp', () => {
  it('produces 17-char string YYYYMMDDHHmmssSSS', () => {
    const ts = formatTimestamp(fixedDate)
    expect(ts).toHaveLength(17)
    expect(ts).toMatch(/^\d{17}$/)
  })
})

describe('buildObjectKey', () => {
  it('constructs correct path with prefix', () => {
    const key = buildObjectKey({ prefix: 'obsidian', source: 'feishu', notename: '我的笔记', date: fixedDate, ext: 'png' })
    expect(key).toMatch(/^obsidian\/\d{6}\/我的笔记-\d{17}\.png$/)
  })

  it('constructs correct path without prefix', () => {
    const key = buildObjectKey({ prefix: '', source: 'feishu', notename: '笔记', date: fixedDate, ext: 'jpg' })
    expect(key).toMatch(/^\d{6}\/笔记-\d{17}\.jpg$/)
  })

  it('normalizes prefix and notename path segments', () => {
    const key = buildObjectKey({
      prefix: '/obsidian//clips/',
      source: 'fei/shu',
      notename: '我的/笔记',
      date: fixedDate,
      ext: 'png',
    })

    expect(key).toMatch(/^obsidian\/clips\/\d{6}\/我的-笔记-\d{17}\.png$/)
  })

  it('replaces dot path segments in prefix and notename', () => {
    const key = buildObjectKey({
      prefix: './obsidian/../clips',
      source: '..',
      notename: '.',
      date: fixedDate,
      ext: 'png',
    })

    expect(key).toMatch(/^_\/obsidian\/_\/clips\/\d{6}\/_-\d{17}\.png$/)
  })
})

describe('mimeToExt', () => {
  it('maps known mime types', () => {
    expect(mimeToExt('image/png')).toBe('png')
    expect(mimeToExt('image/jpeg')).toBe('jpg')
    expect(mimeToExt('image/webp')).toBe('webp')
    expect(mimeToExt('image/unknown')).toBe('png')
  })
})

describe('AliyunOSSUploader', () => {
  it('uploads data URLs with encoded request URL, PUT headers, and byte body', async () => {
    const fetchMock = mockFetch()
    const uploader = new AliyunOSSUploader(config)

    const url = await uploader.upload({
      base64: 'data:image/png;base64,aGVsbG8=',
      mimeType: 'image/png',
      notename: '我的/笔记',
      source: 'fei/shu',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [requestUrl, init] = fetchMock.mock.calls[0]
    expect(requestUrl).toBe(url)
    expect(requestUrl).toMatch(
      /^https:\/\/test-bucket\.oss-cn-hangzhou\.aliyuncs\.com\/obsidian\/clips\/\d{6}\/%E6%88%91%E7%9A%84-%E7%AC%94%E8%AE%B0-\d{17}\.png$/,
    )
    expect(init.method).toBe('PUT')
    expect(init.headers).toMatchObject({
      'Content-Type': 'image/png',
      'x-oss-date': '20260509T143022Z',
      'Authorization': 'OSS access-key-id:AQID',
    })
    expect(Array.from(init.body)).toEqual([104, 101, 108, 108, 111])
  })

  it('signs against x-oss-date canonicalized headers instead of the Date header', async () => {
    const { sign } = mockCrypto()
    mockFetch()
    const uploader = new AliyunOSSUploader(config)

    await uploader.upload({
      base64: 'aGVsbG8=',
      mimeType: 'image/png',
      notename: 'note',
      source: 'feishu',
    })

    expect(sign).toHaveBeenCalledOnce()
    const [, , data] = sign.mock.calls[0]
    const stringToSign = new TextDecoder().decode(data)
    const objectKey = `obsidian/clips/202605/note-${formatTimestamp(fixedDate)}.png`
    expect(stringToSign).toBe(
      `PUT\n\nimage/png\n20260509T143022Z\nx-oss-date:20260509T143022Z\n/test-bucket/${objectKey}`,
    )
  })

  it('uploads with dot segments encoded as safe literal names', async () => {
    const fetchMock = mockFetch()
    const uploader = new AliyunOSSUploader({ ...config, prefix: './obsidian/..' })

    const url = await uploader.upload({
      base64: 'aGVsbG8=',
      mimeType: 'image/png',
      notename: '..',
      source: '.',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [requestUrl] = fetchMock.mock.calls[0]
    expect(requestUrl).toBe(url)
    expect(requestUrl).toMatch(/^https:\/\/test-bucket\.oss-cn-hangzhou\.aliyuncs\.com\/_\/obsidian\/_\/\d{6}\/_-\d{17}\.png$/)
  })

  it('uploads URL-safe raw base64', async () => {
    const fetchMock = mockFetch()
    const uploader = new AliyunOSSUploader({ ...config, prefix: '' })

    await uploader.upload({
      base64: '-_8',
      mimeType: 'image/png',
      notename: 'bytes',
      source: 'feishu',
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(Array.from(init.body)).toEqual([251, 255])
  })

  it('returns absolute URL with configured custom domain while uploading to OSS endpoint', async () => {
    const fetchMock = mockFetch()
    const uploader = new AliyunOSSUploader({
      ...config,
      customDomain: 'img.example.com/',
    })

    const url = await uploader.upload({
      base64: 'aGVsbG8=',
      mimeType: 'image/png',
      notename: 'note',
      source: 'feishu',
    })

    const [requestUrl] = fetchMock.mock.calls[0]
    expect(requestUrl).toMatch(/^https:\/\/test-bucket\.oss-cn-hangzhou\.aliyuncs\.com\/obsidian\/clips\/\d{6}\/note-\d{17}\.png$/)
    expect(url).toMatch(/^https:\/\/img\.example\.com\/obsidian\/clips\/\d{6}\/note-\d{17}\.png$/)
  })

  it('preserves explicit scheme in custom domain', async () => {
    mockFetch()
    const uploader = new AliyunOSSUploader({
      ...config,
      customDomain: 'http://img.example.com/static/',
    })

    const url = await uploader.upload({
      base64: 'aGVsbG8=',
      mimeType: 'image/png',
      notename: 'note',
      source: 'feishu',
    })

    expect(url).toMatch(/^http:\/\/img\.example\.com\/static\/obsidian\/clips\/\d{6}\/note-\d{17}\.png$/)
  })

  it('throws status and response text when upload fails', async () => {
    mockFetch(false, 'forbidden')
    const uploader = new AliyunOSSUploader(config)

    await expect(
      uploader.upload({
        base64: 'aGVsbG8=',
        mimeType: 'image/png',
        notename: '笔记',
        source: 'feishu',
      }),
    ).rejects.toThrow(`OSS upload failed 403: forbidden`)

    await expect(
      uploader.upload({
        base64: 'aGVsbG8=',
        mimeType: 'image/png',
        notename: '笔记',
        source: 'feishu',
      }),
    ).rejects.toThrow(`version=${OSS_SIGNATURE_DIAGNOSTIC_VERSION}`)
  })

  it('trims config fields before signing and requesting', async () => {
    const { sign } = mockCrypto()
    const fetchMock = mockFetch()
    const uploader = new AliyunOSSUploader({
      accessKeyId: ' access-key-id ',
      accessKeySecret: ' access-key-secret ',
      bucket: ' test-bucket ',
      region: ' oss-cn-hangzhou ',
      prefix: ' clips ',
      customDomain: ' img.example.com/files/ ',
    })

    await uploader.upload({
      base64: 'aGVsbG8=',
      mimeType: 'image/png',
      notename: 'note',
      source: 'feishu',
    })

    const [requestUrl, init] = fetchMock.mock.calls[0]
    expect(requestUrl).toMatch(/^https:\/\/test-bucket\.oss-cn-hangzhou\.aliyuncs\.com\/clips\/\d{6}\//)
    expect(init.headers.Authorization).toBe('OSS access-key-id:AQID')

    const [, , data] = sign.mock.calls[0]
    const stringToSign = new TextDecoder().decode(data)
    expect(stringToSign).toContain('/test-bucket/clips/202605/')
  })
})
