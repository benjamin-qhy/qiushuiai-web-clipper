import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const optionsSource = readFileSync(
  resolve(process.cwd(), 'entrypoints/options/App.vue'),
  'utf8',
)
const componentPath = resolve(
  process.cwd(),
  'entrypoints/options/components/ModelConfigSection.vue',
)

describe('model configuration UI', () => {
  it('shows model configuration as a standalone settings navigation item', () => {
    expect(optionsSource).toContain("scrollTo('models')\">模型配置")
    expect(optionsSource).toContain('<ModelConfigSection')
  })

  it('supports adding platforms without a numeric limit', () => {
    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain('添加平台')
    expect(source).not.toContain('MAX_PLATFORM')
    expect(source).not.toContain('最多 3')
  })

  it('combines platform and model into one grouped model selector', () => {
    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain('测试指令')
    expect(source).not.toContain('<span>选择平台</span>')
    expect(source).toContain('<span>选择模型</span>')
    expect(source).toContain('v-model="selectedModelKey"')
    expect(source).toContain('<optgroup')
    expect(source).toContain('v-for="group in modelGroups"')
  })

  it('keeps the test prompt and default-off reasoning controls', () => {
    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain('测试指令')
    expect(source).toContain("ref<AIReasoningLevel>('off')")
    expect(source).toContain('<option value="off">关闭</option>')
  })

  it('persists the last-used model only after a successful test request', () => {
    const source = readFileSync(componentPath, 'utf8')
    const successIndex = source.indexOf("testStatus.value = 'ok'")
    const updateIndex = source.indexOf("emit('update:lastUsedModel'")

    expect(successIndex).toBeGreaterThan(-1)
    expect(updateIndex).toBeGreaterThan(successIndex)
  })

  it('sends the test instruction as plain text instead of forcing JSON mode', () => {
    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain("{ responseFormat: 'text' }")
  })
})
