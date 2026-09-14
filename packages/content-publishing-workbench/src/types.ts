export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type CardThemeId = 'basic' | 'tech' | 'minimal' | 'border' | 'journal' | 'soft'

export interface SourceSnapshot {
  id: string
  extractedAt: string
  markdown: string
  meta: {
    title: string
    source: string
    author?: string
    published?: string
    created: string
    tags?: string[]
  }
}

export interface ModelSelection {
  platformId: string
  modelId: string
  reasoning: ReasoningLevel
}

export interface DraftInstruction {
  mode: 'template' | 'manual'
  templateId: string
  manualContent: string
}

export interface PublisherDraft {
  snapshot: SourceSnapshot
  draftMarkdown: string
  instruction: DraftInstruction
  model: ModelSelection | null
  themeId: CardThemeId
  coverEnabled: boolean
  currentPage: number
}

export interface PublisherLayout {
  sizes: [number, number, number]
  visible: { source: boolean; composer: boolean; output: boolean }
}

export interface ModelChoice extends ModelSelection {
  label: string
  groupLabel: string
  reasoningLevels: ReasoningLevel[]
}

export interface PromptTemplate {
  id: string
  title: string
  content: string
}

export interface GenerateInput {
  sourceMarkdown: string
  instruction: string
  model: ModelSelection
}

export interface WorkbenchAdapters {
  listModels(): Promise<ModelChoice[]>
  listTemplates(): Promise<PromptTemplate[]>
  getDefaultModel(): Promise<ModelSelection | null>
  generate(input: GenerateInput): Promise<string>
  saveDraft(draft: PublisherDraft): Promise<void>
  openSettings(): Promise<void>
}

export function resolveReasoningLevel(
  stored: ReasoningLevel,
  supported: ReasoningLevel[],
): ReasoningLevel {
  return stored === 'off' || supported.includes(stored) ? stored : 'off'
}

export function createDraft(
  snapshot: SourceSnapshot,
  model: ModelSelection | null = null,
): PublisherDraft {
  return {
    snapshot: structuredClone(snapshot),
    draftMarkdown: '',
    instruction: { mode: 'template', templateId: '', manualContent: '' },
    model: model ? { ...model } : null,
    themeId: 'minimal',
    coverEnabled: false,
    currentPage: 0,
  }
}
