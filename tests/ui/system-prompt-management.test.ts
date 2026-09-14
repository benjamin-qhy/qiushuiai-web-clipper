import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentPath = resolve(
  process.cwd(),
  'entrypoints/options/components/SystemPromptSection.vue',
)
const optionsSource = readFileSync(
  resolve(process.cwd(), 'entrypoints/options/App.vue'),
  'utf8',
)

describe('system prompt management UI', () => {
  it('provides a prompt list with create and edit controls', () => {
    expect(existsSync(componentPath)).toBe(true)

    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain('系统提示词管理')
    expect(source).toContain('已添加提示词')
    expect(source).toContain('新增提示词')
    expect(source).toContain('标题')
    expect(source).toContain('提示词内容')
    expect(source).toContain('编辑')
  })

  it('mounts prompt management after model configuration', () => {
    expect(optionsSource).toContain('import SystemPromptSection')
    expect(optionsSource.indexOf('<SystemPromptSection')).toBeGreaterThan(
      optionsSource.indexOf('<ModelConfigSection'),
    )
  })

  it('provides a prompt-management menu below model configuration', () => {
    expect(optionsSource).toContain("'models', 'prompts'")
    expect(optionsSource).toContain("scrollTo('prompts')\">提示词管理")

    const source = readFileSync(componentPath, 'utf8')
    expect(source).toContain('id="section-prompts"')
  })
})
