export type CardThemeId =
  | 'basic'
  | 'tech'
  | 'minimal'
  | 'border'
  | 'journal'
  | 'soft'

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

export interface PublisherDraft {
  snapshot: SourceSnapshot
  draftMarkdown: string
  themeId: CardThemeId
  coverEnabled: boolean
  currentPage: number
}

export interface PublisherLayout {
  sizes: [number, number, number]
  visible: {
    source: boolean
    composer: boolean
    output: boolean
  }
}
