// src/types.ts

export type BlockType =
  | 'page'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4'
  | 'heading5' | 'heading6' | 'heading7' | 'heading8' | 'heading9'
  | 'text'
  | 'bullet'
  | 'ordered'
  | 'todo'
  | 'code'
  | 'quote_container'
  | 'divider'
  | 'table'
  | 'image'
  | 'callout'

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  inlineCode?: boolean
  link?: string
}

export interface Cell {
  spans: Span[]
}

export interface Block {
  type: BlockType
  spans?: Span[]          // text / heading / bullet / ordered / todo / quote_container / callout
  level?: number          // bullet / ordered 缩进层级（0 = 顶层）
  language?: string       // code block 语言
  checked?: boolean       // todo 状态
  rows?: Cell[][]         // table 行列数据
  src?: string            // image URL
  alt?: string            // image alt text
}

export interface DocMeta {
  title: string
  source: string
  author?: string         // 原始作者名（不含 [[]]，由 frontmatter 模块加工）
  published?: string      // ISO 日期字符串，如 "2026-04-01"
  created: string         // ISO 日期字符串，保存时自动填入
  description?: string    // AI速览文本（如有）
  tags?: string[]
}

export interface DocContent extends DocMeta {
  blocks: Block[]
  /** 通用网页路径直接给出 markdown 字符串；飞书/金山路径不设置此字段 */
  markdown?: string
}

// Content Script ↔ Popup 消息协议
export type MessageRequest =
  | { type: 'EXTRACT_DOC' }
  | { type: 'DOWNLOAD_IMAGE'; url: string }

export type MessageResponse =
  | { ok: true; data: DocContent }
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; error: string }
