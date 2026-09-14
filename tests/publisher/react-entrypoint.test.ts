import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('publisher React entrypoint', () => {
  it('keeps Vue and enables an isolated React entrypoint', () => {
    const config = readFileSync('wxt.config.ts', 'utf8')
    expect(config).toContain("modules: ['@wxt-dev/module-vue']")
    expect(config).toContain("from '@vitejs/plugin-react'")

    const entrypoint = readFileSync('entrypoints/publisher-sidepanel/main.tsx', 'utf8')
    expect(entrypoint).toContain("from '@qiushui/content-publishing-workbench'")
    expect(entrypoint).not.toContain('../../packages/content-publishing-workbench/src/')
  })
})
