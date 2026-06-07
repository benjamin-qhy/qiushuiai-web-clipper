import { describe, expect, it } from 'vitest'
import { isDouyinFavoritesPage, normalizeDouyinWorkUrl, extractDouyinVideoId } from '../../src/douyin/collect'

describe('isDouyinFavoritesPage', () => {
  it('matches douyin favorite_collection pages', () => {
    expect(
      isDouyinFavoritesPage('https://www.douyin.com/user/self?showTab=favorite_collection'),
    ).toBe(true)
  })

  it('matches douyin.com pages without www', () => {
    expect(
      isDouyinFavoritesPage('https://douyin.com/user/self?showTab=favorite_collection'),
    ).toBe(true)
  })

  it('rejects non favorite pages', () => {
    expect(isDouyinFavoritesPage('https://www.douyin.com/user/self?showTab=post')).toBe(false)
  })

  it('rejects video detail pages that have modal_id', () => {
    expect(
      isDouyinFavoritesPage(
        'https://www.douyin.com/user/self?showTab=favorite_collection&modal_id=7608748246051114283',
      ),
    ).toBe(false)
  })
})

describe('extractDouyinVideoId', () => {
  it('extracts id from /video/ path', () => {
    expect(extractDouyinVideoId('https://www.douyin.com/video/7390447879849049371?is_from_webapp=1')).toBe('7390447879849049371')
  })

  it('extracts id from /detail/ path', () => {
    expect(extractDouyinVideoId('https://www.douyin.com/detail/7390447879849049371')).toBe('7390447879849049371')
  })

  it('extracts modal_id for other paths', () => {
    expect(extractDouyinVideoId('https://www.douyin.com/jingxuan?modal_id=7611737202434964657')).toBe('7611737202434964657')
  })

  it('returns empty string when no id found', () => {
    expect(extractDouyinVideoId('https://www.douyin.com/user/self')).toBe('')
  })
})

describe('normalizeDouyinWorkUrl', () => {
  const base = 'https://www.douyin.com/user/self?showTab=favorite_collection'

  it('strips query params and hash for /video/ urls', () => {
    expect(normalizeDouyinWorkUrl('/video/123?is_from_webapp=1#abc', base)).toBe(
      'https://www.douyin.com/video/123',
    )
  })

  it('strips query params and hash for /detail/ urls', () => {
    expect(normalizeDouyinWorkUrl('/detail/123?search_id=xxx', base)).toBe(
      'https://www.douyin.com/detail/123',
    )
  })

  it('keeps only modal_id for non-path urls', () => {
    expect(
      normalizeDouyinWorkUrl('/jingxuan?modal_id=456&other=1', base),
    ).toBe('https://www.douyin.com/jingxuan?modal_id=456')
  })

  it('strips all params when no modal_id present', () => {
    expect(normalizeDouyinWorkUrl('/explore?foo=1', base)).toBe(
      'https://www.douyin.com/explore',
    )
  })
})
