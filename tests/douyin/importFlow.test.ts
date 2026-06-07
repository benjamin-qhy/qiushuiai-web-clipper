import { describe, expect, it } from 'vitest'
import { buildFavoriteItems, finalizePrefixProgress } from '../../src/douyin/importFlow'

describe('buildFavoriteItems', () => {
  it('marks imported video ids as skipped and unselected', () => {
    const items = buildFavoriteItems(
      [
        { url: 'https://www.douyin.com/video/1', videoId: '1', title: 'a', cover: '', likesText: '' },
        { url: 'https://www.douyin.com/video/2', videoId: '2', title: 'b', cover: '', likesText: '' },
      ],
      new Set(['1']),
    )

    expect(items[0]).toMatchObject({ status: 'skipped', selected: false })
    expect(items[1]).toMatchObject({ status: 'idle', selected: true })
  })

  it('unselects items at and after the lastImportedId cutoff', () => {
    // list order: newest first; id=2 was last saved
    const items = buildFavoriteItems(
      [
        { url: 'https://www.douyin.com/video/3', videoId: '3', title: 'c', cover: '', likesText: '' },
        { url: 'https://www.douyin.com/video/2', videoId: '2', title: 'b', cover: '', likesText: '' },
        { url: 'https://www.douyin.com/video/1', videoId: '1', title: 'a', cover: '', likesText: '' },
      ],
      new Set(['2', '1']),
      '2',
    )

    expect(items[0]).toMatchObject({ status: 'idle', selected: true })   // newer, not yet imported
    expect(items[1]).toMatchObject({ status: 'skipped', selected: false }) // cutoff, imported
    expect(items[2]).toMatchObject({ status: 'skipped', selected: false }) // older, imported
  })

  it('unselects items past cutoff even if not in importedSet', () => {
    const items = buildFavoriteItems(
      [
        { url: 'https://www.douyin.com/video/3', videoId: '3', title: 'c', cover: '', likesText: '' },
        { url: 'https://www.douyin.com/video/2', videoId: '2', title: 'b', cover: '', likesText: '' },
        { url: 'https://www.douyin.com/video/1', videoId: '1', title: 'a', cover: '', likesText: '' },
      ],
      new Set(['2']),
      '2',
    )

    expect(items[0]).toMatchObject({ status: 'idle', selected: true })
    expect(items[1]).toMatchObject({ status: 'skipped', selected: false })
    expect(items[2]).toMatchObject({ status: 'idle', selected: false }) // past cutoff, not imported, still unselected
  })
})

describe('finalizePrefixProgress', () => {
  it('adds new video ids to the imported set', () => {
    const result = finalizePrefixProgress(['2'], ['1'])

    expect(result.lastImportedUrl).toBe('1')
    expect(result.importedUrlSet).toEqual(['2', '1'])
  })

  it('returns empty checkpoint when no success happened', () => {
    const result = finalizePrefixProgress([], [])
    expect(result).toEqual({
      importedUrlSet: [],
      lastImportedUrl: '',
    })
  })
})
