import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('popup publishing workbench action', () => {
  const popup = readFileSync('entrypoints/popup/App.vue', 'utf8')
  const background = readFileSync('entrypoints/background.ts', 'utf8')

  it('offers publishing after content extraction', () => {
    expect(popup).toContain('发布到社交媒体')
    expect(popup).toContain('@click="handleOpenPublisher"')
    expect(popup).toContain('createSourceSnapshot(mergedDoc())')
  })

  it('keeps Douyin routing and enables the publisher panel on normal pages', () => {
    expect(background).toContain('douyin-sidepanel.html?tabId=${tabId}')
    expect(background).toContain('publisher-sidepanel.html?tabId=${tabId}')
    expect(background).toContain("const popup = url && isDouyinFavoritesPage(url) ? '' : 'popup.html'")
  })
})
