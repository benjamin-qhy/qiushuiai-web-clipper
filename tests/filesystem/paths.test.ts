import { describe, expect, it } from 'vitest'
import { computeSharedImagePath } from '../../src/filesystem/paths'

describe('computeSharedImagePath', () => {
  it('returns plain dir/file when subDir is empty', () => {
    expect(computeSharedImagePath('', 'images', 'photo.jpg')).toBe('images/photo.jpg')
  })

  it('adds one ../ for single-level subDir', () => {
    expect(computeSharedImagePath('Clippings', 'images', 'photo.jpg')).toBe('../images/photo.jpg')
  })

  it('adds two ../ for two-level subDir', () => {
    expect(computeSharedImagePath('a/b', 'images', 'photo.jpg')).toBe('../../images/photo.jpg')
  })

  it('trims leading/trailing slashes from subDir', () => {
    expect(computeSharedImagePath('/Clippings/', 'images', 'photo.jpg')).toBe('../images/photo.jpg')
  })
})
