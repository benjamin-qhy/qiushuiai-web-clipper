import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('bookmarks App template sort mode bindings', () => {
  const appSource = readFileSync(
    resolve(process.cwd(), 'entrypoints/bookmarks/App.vue'),
    'utf-8'
  )

  it('binds the top-level sortMode ref without using .value in template props', () => {
    expect(appSource).toContain(':sort-mode="sortMode"')
    expect(appSource).not.toContain(':sort-mode="sortMode.value"')
  })

  it('updates the top-level sortMode ref without using .value in template listeners', () => {
    expect(appSource).toContain('@change-sort="(mode) => { sortMode = mode }"')
    expect(appSource).not.toContain('@change-sort="(mode) => { sortMode.value = mode }"')
  })
})
