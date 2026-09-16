import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ContentPublishingWorkbench } from '../ContentPublishingWorkbench'
import { createDraft, type WorkbenchAdapters } from '../types'

vi.mock('react-resizable-panels', () => ({
  Group: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div>,
  Panel: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div>,
  Separator: ({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) =>
    <div className={className} role="separator" aria-label={ariaLabel} />,
  useGroupRef: () => ({ current: null }),
}))

afterEach(cleanup)

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.unstubAllGlobals()
})

const snapshot = {
  id: 'snapshot-1',
  extractedAt: '2026-09-14T06:00:00.000Z',
  markdown: '# 原文',
  meta: { title: '标题', source: 'https://example.com', created: '2026-09-14' },
}

function createAdapters(): WorkbenchAdapters {
  return {
    listModels: vi.fn().mockResolvedValue([{
      platformId: 'custom-1',
      modelId: 'model-a',
      reasoning: 'off',
      label: 'Model A',
      groupLabel: '自定义',
      reasoningLevels: ['off', 'low', 'high'],
    }]),
    listTemplates: vi.fn().mockResolvedValue([
      { id: 'prompt-1', title: '知识卡片', content: '提炼核心观点。' },
    ]),
    getDefaultModel: vi.fn().mockResolvedValue({
      platformId: 'custom-1', modelId: 'model-a', reasoning: 'low',
    }),
    generate: vi.fn().mockResolvedValue('## 创作稿'),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    loadLayout: vi.fn().mockResolvedValue({
      sizes: [30, 35, 35], visible: { source: true, composer: true, output: true }, activePane: 'composer',
    }),
    saveLayout: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(undefined),
  }
}

describe('AI generation controls', () => {
  it('keeps icon-only creation settings in the composer header', async () => {
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={createAdapters()} />)

    await screen.findByRole('button', { name: '选择模型' })
    const header = screen.getByRole('heading', { name: '创作稿' }).closest('.publishing-workbench__pane-header')
    const settings = header?.querySelector('[role="group"][aria-label="创作设置"]')
    const buttons = settings?.querySelectorAll('button') ?? []

    expect(settings).not.toBeNull()
    expect(buttons).toHaveLength(3)
    expect([...buttons].every(button => button.textContent?.trim() === '')).toBe(true)
  })

  it('generates editable Markdown from a selected prompt template', async () => {
    const adapters = createAdapters()
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    fireEvent.click(await screen.findByRole('button', { name: '选择提示词模板' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '知识卡片' }))
    expect((screen.getByRole('textbox', { name: '创作指令' }) as HTMLTextAreaElement).value)
      .toBe('提炼核心观点。')
    fireEvent.click(screen.getByRole('button', { name: '生成创作稿' }))

    await waitFor(() => expect(adapters.generate).toHaveBeenCalledWith({
      sourceMarkdown: '# 原文',
      instruction: '提炼核心观点。',
      model: { platformId: 'custom-1', modelId: 'model-a', reasoning: 'low' },
    }))
    expect(await screen.findByDisplayValue('## 创作稿')).not.toBeNull()
  })

  it('requires confirmation before replacing a non-empty draft', async () => {
    const adapters = createAdapters()
    const draft = createDraft(snapshot, {
      platformId: 'custom-1', modelId: 'model-a', reasoning: 'off',
    })
    draft.instruction = { mode: 'template', templateId: 'prompt-1', manualContent: '' }
    draft.draftMarkdown = '已有内容'
    render(<ContentPublishingWorkbench initialDraft={draft} adapters={adapters} />)

    fireEvent.click(await screen.findByRole('button', { name: '生成创作稿' }))
    expect(await screen.findByRole('alertdialog')).not.toBeNull()
    expect(adapters.generate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认覆盖' }))
    await waitFor(() => expect(adapters.generate).toHaveBeenCalledOnce())
  })

  it('uses edited prompt content without changing the template list', async () => {
    const adapters = createAdapters()
    const user = userEvent.setup()
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    fireEvent.change(await screen.findByRole('textbox', { name: '创作指令' }), {
      target: { value: '用故事化语气改写。' },
    })
    await waitFor(() => expect(adapters.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      instruction: { mode: 'manual', templateId: '', manualContent: '用故事化语气改写。' },
    })))
    expect((screen.getByRole('textbox', { name: '创作指令' }) as HTMLTextAreaElement).value)
      .toBe('用故事化语气改写。')
    const generateButton = screen.getByRole('button', { name: '生成创作稿' }) as HTMLButtonElement
    await waitFor(() => expect(generateButton.disabled).toBe(false))
    fireEvent.click(generateButton)

    await waitFor(() => expect(adapters.generate).toHaveBeenCalledWith(expect.objectContaining({
      instruction: '用故事化语气改写。',
    })))
    expect(adapters.listTemplates).toHaveBeenCalledOnce()
  })

  it('shows a settings action when no model is configured', async () => {
    const adapters = createAdapters()
    vi.mocked(adapters.listModels).mockResolvedValue([])
    vi.mocked(adapters.getDefaultModel).mockResolvedValue(null)
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    fireEvent.click(await screen.findByRole('button', { name: '打开设置' }))
    expect(adapters.openSettings).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '生成创作稿' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps manual prompt input available when there are no prompt templates', async () => {
    const adapters = createAdapters()
    let resolveModels!: (models: Awaited<ReturnType<WorkbenchAdapters['listModels']>>) => void
    vi.mocked(adapters.listModels).mockReturnValue(new Promise(resolve => { resolveModels = resolve }))
    vi.mocked(adapters.listTemplates).mockResolvedValue([])
    const view = render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    expect(await screen.findByText('正在加载模型与提示词…')).not.toBeNull()
    await act(async () => resolveModels([{
      platformId: 'custom-1', modelId: 'model-a', reasoning: 'off', label: 'Model A', groupLabel: '自定义',
      reasoningLevels: ['off'],
    }]))
    expect(await screen.findByRole('textbox', { name: '创作指令' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '选择提示词模板' })).not.toBeNull()
    view.unmount()
  })

  it('falls back from a removed draft model and flushes the latest edit on unmount', async () => {
    const adapters = createAdapters()
    const draft = createDraft(snapshot, {
      platformId: 'removed', modelId: 'removed-model', reasoning: 'max',
    })
    const view = render(<ContentPublishingWorkbench initialDraft={draft} adapters={adapters} />)

    const editor = await screen.findByRole('textbox', { name: '创作稿 Markdown' })
    fireEvent.change(editor, { target: { value: '关闭前最后一次编辑' } })
    view.unmount()

    await waitFor(() => expect(adapters.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftMarkdown: '关闭前最后一次编辑',
      model: { platformId: 'custom-1', modelId: 'model-a', reasoning: 'low' },
    })))
  })

  it('reports automatic draft save failures', async () => {
    const adapters = createAdapters()
    vi.mocked(adapters.saveDraft).mockRejectedValue(new Error('quota'))
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('草稿保存失败'))
  })

  it('loads and persists workspace visibility preferences', async () => {
    const adapters = createAdapters()
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    await waitFor(() => expect(adapters.loadLayout).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '隐藏原文' }))

    expect(adapters.saveLayout).toHaveBeenCalledWith({
      sizes: [30, 35, 35],
      visible: { source: false, composer: true, output: true },
      activePane: 'composer',
    })
    expect(screen.queryByText('CONTENT STUDIO')).toBeNull()
    expect(screen.queryByText('SOURCE')).toBeNull()
    expect(screen.queryByText('COMPOSE')).toBeNull()
    expect(screen.queryByText('OUTPUT')).toBeNull()
  })

  it('waits for stored layout hydration before enabling layout changes', async () => {
    const adapters = createAdapters()
    let resolveLayout!: (layout: Awaited<ReturnType<WorkbenchAdapters['loadLayout']>>) => void
    vi.mocked(adapters.loadLayout).mockReturnValue(new Promise(resolve => { resolveLayout = resolve }))
    render(<ContentPublishingWorkbench initialDraft={createDraft(snapshot)} adapters={adapters} />)

    expect(screen.getByText('正在恢复工作台布局…')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '隐藏原文' })).toBeNull()

    const restoredLayout = {
      sizes: [45, 25, 30] as [number, number, number],
      visible: { source: true, composer: true, output: true },
      activePane: 'source' as const,
    }
    resolveLayout(restoredLayout)
    fireEvent.click(await screen.findByRole('button', { name: '隐藏原文' }))

    expect(adapters.saveLayout).toHaveBeenCalledWith({
      ...restoredLayout,
      visible: { source: false, composer: true, output: true },
      activePane: 'composer',
    })
  })
})
