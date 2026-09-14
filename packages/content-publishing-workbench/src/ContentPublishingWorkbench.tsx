import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
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
import { Field, FieldGroup, FieldLabel } from './components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
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
          if (availableModel && current.model) {
            const reasoning = availableModel.reasoningLevels.includes(current.model.reasoning)
              ? current.model.reasoning
              : 'off'
            return { ...current, model: { ...current.model, reasoning } }
          }
          return { ...current, model: defaultModel }
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
  const selectedTemplate = useMemo(() => {
    if (draft.instruction.mode !== 'template') return undefined
    const templateId = draft.instruction.templateId
    return templates.find(template => template.id === templateId)
  }, [draft.instruction, templates])
  const instruction = draft.instruction.mode === 'manual'
    ? draft.instruction.manualContent.trim()
    : selectedTemplate?.content.trim() ?? ''
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
      <header className="publishing-workbench__header">
        <div><p className="publishing-workbench__eyebrow">CONTENT STUDIO</p><h1>内容发布工作台</h1></div>
        <span role="status">{saveStatus === 'saving' ? '正在保存…' : saveStatus === 'error' ? '草稿保存失败' : '草稿已自动保存'}</span>
      </header>

      {layout ? <ResponsiveWorkspace layout={layout} onLayoutChange={updateLayout} panes={{
        source: <section className="publishing-workbench__pane" aria-labelledby="source-pane-title">
          <PaneHeader index="01" label="SOURCE" title="内容原文" titleId="source-pane-title">
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
          <PaneHeader index="02" label="COMPOSE" title="创作稿" titleId="composer-pane-title" />
          <div className="publishing-workbench__composer">
            <FieldGroup>
              <Field>
                <FieldLabel>模型</FieldLabel>
                <Select value={draft.model ? modelKey(draft.model) : ''} onValueChange={selectModel}>
                  <SelectTrigger aria-label="模型"><SelectValue placeholder="请选择模型" /></SelectTrigger>
                  <SelectContent>
                    {[...new Set(models.map(model => model.groupLabel))].map(group => (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {models.filter(model => model.groupLabel === group).map(model => (
                          <SelectItem key={modelKey(model)} value={modelKey(model)}>{model.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>推理程度</FieldLabel>
                <Select
                  value={draft.model?.reasoning ?? 'off'}
                  disabled={!selectedModel}
                  onValueChange={reasoning => setDraft(current => current.model
                    ? { ...current, model: { ...current.model, reasoning: reasoning as ModelSelection['reasoning'] } }
                    : current)}
                >
                  <SelectTrigger aria-label="推理程度"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {selectedModel?.reasoningLevels.map(level => (
                      <SelectItem key={level} value={level}>{reasoningLabels[level]}</SelectItem>
                    ))}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>创作指令</FieldLabel>
                <Tabs
                  value={draft.instruction.mode}
                  onValueChange={mode => setDraft(current => ({ ...current,
                    instruction: { ...current.instruction, mode: mode as 'template' | 'manual' },
                  }))}
                >
                  <TabsList variant="line">
                    <TabsTrigger value="template">提示词模板</TabsTrigger>
                    <TabsTrigger value="manual">手工输入</TabsTrigger>
                  </TabsList>
                  <TabsContent value="template">
                    <Select
                      value={draft.instruction.mode === 'template' ? draft.instruction.templateId : ''}
                      onValueChange={nextTemplateId => {
                        setDraft(current => ({ ...current,
                          instruction: { ...current.instruction, templateId: nextTemplateId },
                        }))
                      }}
                    >
                      <SelectTrigger aria-label="系统提示词"><SelectValue placeholder="请选择系统提示词" /></SelectTrigger>
                      <SelectContent><SelectGroup>
                        {templates.map(template => (
                          <SelectItem key={template.id} value={template.id}>{template.title}</SelectItem>
                        ))}
                      </SelectGroup></SelectContent>
                    </Select>
                  </TabsContent>
                  <TabsContent value="manual">
                    <Textarea
                      aria-label="手工系统提示词"
                      value={draft.instruction.manualContent}
                      placeholder="输入仅用于当前草稿的系统提示词"
                      onChange={event => {
                        setDraft(current => ({ ...current,
                          instruction: { ...current.instruction, manualContent: event.target.value },
                        }))
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </Field>
            </FieldGroup>

            {!models.length && !loadingOptions
              ? <div className="publishing-workbench__empty"><p>尚未配置可用模型。</p>
                  <Button variant="outline" onClick={() => void adapters.openSettings()}>打开设置</Button></div>
              : null}
            {models.length > 0 && draft.instruction.mode === 'template' && !selectedTemplate && !loadingOptions
              ? <div className="publishing-workbench__empty"><p>请选择系统提示词；如无可用模板，请前往设置添加。</p>
                  <Button variant="outline" onClick={() => void adapters.openSettings()}>打开设置</Button></div>
              : null}
            {loadingOptions && <p className="publishing-workbench__loading">正在加载模型与提示词…</p>}
            <Button disabled={!canGenerate} onClick={requestGeneration}>
              {generating ? '生成中…' : '生成创作稿'}
            </Button>
            {error && <p role="alert" className="publishing-workbench__error">{error}</p>}

            <MarkdownEditor
              value={draft.draftMarkdown}
              onChange={draftMarkdown => setDraft(current => ({ ...current, draftMarkdown }))}
            />
          </div>
        </section>,

        output: <section className="publishing-workbench__pane" aria-labelledby="output-pane-title">
          <PaneHeader index="03" label="OUTPUT" title="发布成品" titleId="output-pane-title" />
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
  index,
  label,
  title,
  titleId,
  children,
}: {
  index: string
  label: string
  title: string
  titleId: string
  children?: React.ReactNode
}) {
  return <div className="publishing-workbench__pane-header">
    <div><p>{index} / {label}</p><h2 id={titleId}>{title}</h2></div>
    {children}
  </div>
}
