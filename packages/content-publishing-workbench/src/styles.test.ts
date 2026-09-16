import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve('packages/content-publishing-workbench/src/styles.css'), 'utf8')

describe('workbench visual tokens', () => {
  it('matches the settings page text hierarchy', () => {
    expect(styles).toContain('--muted-foreground: #bbbbbb;')
    expect(styles).toContain('--secondary-foreground: #888888;')
  })

  it('uses the settings page compact control treatment', () => {
    expect(styles).toMatch(/\[data-slot="button"\][\s\S]*?border-radius: 2px;/)
    expect(styles).toMatch(/\[data-slot="textarea"\][\s\S]*?border-bottom: 1px solid var\(--border\);/)
    expect(styles).toMatch(/\[data-slot="dropdown-menu-content"\][\s\S]*?border-radius: 4px;/)
  })
})
