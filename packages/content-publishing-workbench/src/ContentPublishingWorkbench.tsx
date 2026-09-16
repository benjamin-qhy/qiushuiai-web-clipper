import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { Bot, Brain, Settings, Sparkles, WandSparkles } from 'lucide-react'
import {
  DEFAULT_PUBLISHER_LAYOUT,
  type ModelChoice,
  type ModelSelection,
  type PromptTemplate,
  type PublisherDraft,
  type PublisherLayout,
  type WorkbenchAdapters,
} from './types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog'
import { Button } from './components/ui/button'
import { ButtonGroup } from './components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { Textarea } from './components/ui/textarea'
import { MarkdownEditor } from './components/MarkdownEditor'
import { ResponsiveWorkspace } from './components/ResponsiveWorkspace'
import { CardPreview } from './components/CardPreview'

export interface ContentPublishingWorkbenchProps {
  initialDraft: PublisherDraft
  adapters: WorkbenchAdapters
}

const reasoningLabels: Record<string, string> = {
  off: '关闭', minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高',
}

const modelKey = (model: Pick<ModelSelection, 'platformId' | 'modelId'>) =>
  JSON.stringify([model.platformId, model.modelId])

export function ContentPublishingWorkbench({ initialDraft, adapters }: ContentPublishingWorkbenchProps) {
  const [draft, setDraft] = useState(() => structuredClone(initialDraft))
  const [models, setModels] = useState<ModelChoice[]>([])
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [layout, setLayout] = useState<PublisherLayout | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const latestDraft = useRef(draft)

  useEffect(() => {
    let cancelled = false
    Promise.all([adapters.listModels(), adapters.listTemplates(), adapters.getDefaultModel()])
      .then(([nextModels, nextTemplates, defaultModel]) => {
        if (cancelled) return
        setModels(nextModels)
        setTemplates(nextTemplates)
        setDraft(current => {
          const availableModel = current.model
            ? nextModels.find(model => modelKey(model) === modelKey(current.model!))
            : undefined
          const selectedTemplate = current.instruction.templateId
            ? nextTemplates.find(template => template.id === current.instruction.templateId)
            : undefined
          const instruction = selectedTemplate && !current.instruction.manualContent.trim()
            ? { mode: 'manual' as const, templateId: selectedTemplate.id, manualContent: selectedTemplate.content }
            : current.instruction
          if (availableModel && current.model) {
            const reasoning = availableModel.reasoningLevels.includes(current.model.reasoning)
              ? current.model.reasoning
              : 'off'
            return { ...current, instruction, model: { ...current.model, reasoning } }
          }
          return { ...current, instruction, model: defaultModel }
        })
      })
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => { cancelled = true }
  }, [adapters, initialDraft.model])

  useEffect(() => {
    latestDraft.current = draft
    setSaveStatus('saving')
    const timeout = globalThis.setTimeout(() => {
      adapters.saveDraft(draft)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'))
    }, 300)
    return () => globalThis.clearTimeout(timeout)
  }, [adapters, draft])

  useEffect(() => () => {
    void adapters.saveDraft(latestDraft.current).catch(() => undefined)
  }, [adapters])

  useEffect(() => {
    let cancelled = false
    adapters.loadLayout()
      .then(savedLayout => { if (!cancelled) setLayout(savedLayout) })
      .catch(layoutError => {
        if (cancelled) return
        setLayout(structuredClone(DEFAULT_PUBLISHER_LAYOUT))
        setError(layoutError instanceof Error ? layoutError.message : String(layoutError))
      })
    return () => { cancelled = true }
  }, [adapters])

  const selectedModel = useMemo(() => models.find(model =>
    model.platformId === draft.model?.platformId && model.modelId === draft.model?.modelId,
  ), [draft.model, models])
  const instruction = draft.instruction.manualContent.trim()
  const reasoningIsValid = Boolean(draft.model && selectedModel?.reasoningLevels.includes(draft.model.reasoning))
  const canGenerate = Boolean(draft.model && selectedModel && reasoningIsValid && instruction && !generating && !loadingOptions)

  function selectModel(value: string) {
    const model = models.find(option => modelKey(option) === value)
    if (!model) return
    const currentReasoning = draft.model?.reasoning ?? 'off'
    setDraft(current => ({
      ...current,
      model: {
        platformId: model.platformId,
        modelId: model.modelId,
        reasoning: model.reasoningLevels.includes(currentReasoning) ? currentReasoning : 'off',
      },
    }))
  }

  function selectTemplate(templateId: string) {
    const template = templates.find(option => option.id === templateId)
    if (!template) return
    setDraft(current => ({
      ...current,
      instruction: { mode: 'manual', templateId: template.id, manualContent: template.content },
    }))
  }

  async function generate() {
    if (!draft.model || !instruction) return
    setConfirmOpen(false)
    setGenerating(true)
    setError('')
    try {
      const markdown = await adapters.generate({
        sourceMarkdown: draft.snapshot.markdown,
        instruction,
        model: draft.model,
      })
      const nextDraft = { ...draft, draftMarkdown: markdown }
      setDraft(nextDraft)
      await adapters.saveDraft(nextDraft)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    } finally {
      setGenerating(false)
    }
  }

  function requestGeneration() {
    if (!canGenerate) return
    if (draft.draftMarkdown.trim()) setConfirmOpen(true)
    else void generate()
  }

  function updateLayout(nextLayout: PublisherLayout) {
    setLayout(nextLayout)
    void adapters.saveLayout(nextLayout).catch(layoutError => {
      setError(layoutError instanceof Error ? layoutError.message : String(layoutError))
    })
  }

  return (
    <main className="publishing-workbench">
      {layout ? <ResponsiveWorkspace header={<header className="publishing-workbench__header">
        <h1>内容发布工作台</h1>
        <span role="status">{saveStatus === 'saving' ? '正在保存…' : saveStatus === 'error' ? '草稿保存失败' : '草稿已自动保存'}</span>
      </header>} layout={layout} onLayoutChange={updateLayout} panes={{
        source: <section className="publishing-workbench__pane" aria-labelledby="source-pane-title">
          <PaneHeader title="内容原文" titleId="source-pane-title">
            <Button asChild variant="link" size="sm">
              <a href={draft.snapshot.meta.source} target="_blank" rel="noreferrer">查看来源</a>
            </Button>
          </PaneHeader>
          <article className="publishing-workbench__markdown">
            <h3>{draft.snapshot.meta.title}</h3>
            <dl className="publishing-workbench__metadata">
              {draft.snapshot.meta.author && <><dt>作者</dt><dd>{draft.snapshot.meta.author}</dd></>}
              {draft.snapshot.meta.published && <><dt>发布时间</dt><dd>{draft.snapshot.meta.published}</dd></>}
              <dt>创建时间</dt><dd>{draft.snapshot.meta.created}</dd>
              {draft.snapshot.meta.tags?.length
                ? <><dt>标签</dt><dd>{draft.snapshot.meta.tags.join(' · ')}</dd></>
                : null}
            </dl>
            <Markdown>{draft.snapshot.markdown}</Markdown>
          </article>
        </section>,

        composer: <section className="publishing-workbench__pane" aria-labelledby="composer-pane-title">
          <PaneHeader title="创作稿" titleId="composer-pane-title">
            <ButtonGroup className="publishing-workbench__compose-menus" aria-label="创作设置">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="选择模型"
                  title={`模型：${selectedModel?.label ?? '未选择'}`} />}>
                  <Bot aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {[...new Set(models.map(model => model.groupLabel))].map(group => <DropdownMenuGroup key={group}>
                    <DropdownMenuLabel>{group}</DropdownMenuLabel>
                    {models.filter(model => model.groupLabel === group).map(model => <DropdownMenuItem
                      key={modelKey(model)} onClick={() => selectModel(modelKey(model))}
                    >{model.label}</DropdownMenuItem>)}
                  </DropdownMenuGroup>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="选择推理程度"
                  title={`推理程度：${reasoningLabels[draft.model?.reasoning ?? 'off']}`} disabled={!selectedModel} />}>
                  <Brain aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>推理程度</DropdownMenuLabel>
                    {selectedModel?.reasoningLevels.map(level => <DropdownMenuItem key={level}
                      onClick={() => setDraft(current => current.model
                        ? { ...current, model: { ...current.model, reasoning: level } }
                        : current)}
                    >{reasoningLabels[level]}</DropdownMenuItem>)}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="选择提示词模板"
                  title="选择提示词模板" />}>
                  <WandSparkles aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>提示词模板</DropdownMenuLabel>
                    {templates.map(template => <DropdownMenuItem key={template.id}
                      onClick={() => selectTemplate(template.id)}
                    >{template.title}</DropdownMenuItem>)}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          </PaneHeader>

          <div className="publishing-workbench__composer">
            <div className="publishing-workbench__instruction-row">
              <Textarea
                aria-label="创作指令"
                value={draft.instruction.manualContent}
                placeholder="输入创作指令，或从上方选择提示词模板"
                onChange={event => setDraft(current => ({ ...current,
                  instruction: { mode: 'manual', templateId: '', manualContent: event.target.value },
                }))}
              />
              <Button size="icon" aria-label="生成创作稿" title="生成创作稿" disabled={!canGenerate}
                onClick={requestGeneration}>
                <Sparkles aria-hidden="true" />
              </Button>
            </div>

            {!models.length && !loadingOptions
              ? <div className="publishing-workbench__empty"><p>尚未配置可用模型。</p>
                  <Button size="icon-sm" variant="outline" aria-label="打开设置" title="打开设置"
                    onClick={() => void adapters.openSettings()}><Settings aria-hidden="true" /></Button></div>
              : null}
            {loadingOptions && <p className="publishing-workbench__loading">正在加载模型与提示词…</p>}
            {generating && <p className="publishing-workbench__loading">正在生成创作稿…</p>}
            {error && <p role="alert" className="publishing-workbench__error">{error}</p>}

            <MarkdownEditor
              value={draft.draftMarkdown}
              onChange={draftMarkdown => setDraft(current => ({ ...current, draftMarkdown }))}
            />
          </div>
        </section>,

        output: <section className="publishing-workbench__pane" aria-labelledby="output-pane-title">
          <CardPreview
            markdown={draft.draftMarkdown}
            title={draft.snapshot.meta.title}
            meta={draft.snapshot.meta}
            themeId={draft.themeId}
            coverEnabled={draft.coverEnabled}
            currentPage={draft.currentPage}
            onDownload={adapters.download}
            onThemeChange={themeId => setDraft(current => ({ ...current, themeId }))}
            onCoverChange={coverEnabled => setDraft(current => ({ ...current, coverEnabled, currentPage: 0 }))}
            onPageChange={currentPage => setDraft(current => ({ ...current, currentPage }))}
          />
        </section>,
      }} /> : <div className="publishing-workbench__layout-loading" role="status">正在恢复工作台布局…</div>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>覆盖当前创作稿？</AlertDialogTitle>
            <AlertDialogDescription>重新生成会替换当前编辑内容，此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generate()}>确认覆盖</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function PaneHeader({
  title,
  titleId,
  children,
}: {
  title: string
  titleId: string
  children?: React.ReactNode
}) {
  return <div className="publishing-workbench__pane-header">
    <h2 id={titleId}>{title}</h2>
    {children}
  </div>
}
