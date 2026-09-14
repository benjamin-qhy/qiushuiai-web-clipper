import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const popupSource = readFileSync(
  resolve(process.cwd(), 'entrypoints/popup/App.vue'),
  'utf8',
)
const optionsSource = readFileSync(
  resolve(process.cwd(), 'entrypoints/options/App.vue'),
  'utf8',
)

describe('bookmark-management UI visibility', () => {
  it('keeps the popup entry in the source but hides it', () => {
    expect(popupSource).toContain('class="btn-bookmarks feature-hidden"')
    expect(popupSource).toContain('.feature-hidden { display: none; }')
  })

  it('keeps bookmark settings in the source but hides their navigation and section', () => {
    expect(optionsSource).toContain('class="bookmark-settings-nav feature-hidden"')
    expect(optionsSource).toContain('id="section-org" class="settings-section feature-hidden"')
    expect(optionsSource).toContain('.feature-hidden { display: none; }')
  })
})
