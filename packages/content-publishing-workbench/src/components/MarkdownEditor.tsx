import { useMemo, type ReactNode } from 'react'
import { parseCardMarkdown, type SemanticBlock } from '../markdown/parse'
import type { InlineNode } from '../markdown/inlineMarks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'

interface MarkdownEditorProps {
  value: string
  onChange(value: string): void
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const blocks = useMemo(() => parseCardMarkdown(value), [value])

  return <Tabs defaultValue="edit">
    <TabsList variant="line">
      <TabsTrigger value="edit">编辑</TabsTrigger>
      <TabsTrigger value="preview">预览</TabsTrigger>
    </TabsList>
    <TabsContent value="edit">
      <Textarea
        aria-label="创作稿 Markdown"
        className="publishing-workbench__editor"
        value={value}
        placeholder="选择创作指令后由 AI 生成，或直接开始编辑…"
        onChange={event => onChange(event.target.value)}
      />
    </TabsContent>
    <TabsContent value="preview">
      <article className="publishing-workbench__draft-preview">
        {blocks.length ? blocks.map(block => <SemanticBlockView key={block.id} block={block} />) : <p>暂无创作稿</p>}
      </article>
    </TabsContent>
  </Tabs>
}

export function InlineView({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((node, index) => {
    const key = `${node.type}-${index}`
    switch (node.type) {
      case 'text': return node.value
      case 'strong': return <strong key={key}><InlineView nodes={node.children} /></strong>
      case 'emphasis': return <em key={key}><InlineView nodes={node.children} /></em>
      case 'mark': return <mark key={key}><InlineView nodes={node.children} /></mark>
      case 'inlineCode': return <code key={key}>{node.value}</code>
      case 'link': return <a key={key} href={node.url} target="_blank" rel="noreferrer"><InlineView nodes={node.children} /></a>
      case 'break': return <br key={key} />
    }
  })
}

export function SemanticBlockView({ block }: { block: SemanticBlock }): ReactNode {
  switch (block.type) {
    case 'heading': {
      const children = <InlineView nodes={block.children} />
      if (block.level === 1) return <h1>{children}</h1>
      if (block.level === 2) return <h2>{children}</h2>
      if (block.level === 3) return <h3>{children}</h3>
      if (block.level === 4) return <h4>{children}</h4>
      if (block.level === 5) return <h5>{children}</h5>
      return <h6>{children}</h6>
    }
    case 'paragraph': return <p><InlineView nodes={block.children} /></p>
    case 'list': {
      const children = block.items.map((item, index) => <li key={index}>
        {item.map(child => <SemanticBlockView key={child.id} block={child} />)}
      </li>)
      const className = block.continuedFromPrevious ? 'xhs-card__continued-list' : undefined
      return block.ordered ? <ol className={className} start={block.start}>{children}</ol> : <ul className={className}>{children}</ul>
    }
    case 'quote': return <blockquote>{block.children.map(child => <SemanticBlockView key={child.id} block={child} />)}</blockquote>
    case 'code': return <pre><code data-language={block.language}>{block.value}</code></pre>
    case 'table': return <table><tbody>{block.rows.map((row, rowIndex) =>
      <tr key={rowIndex}>{row.map((cell, cellIndex) => {
        const Cell = rowIndex === 0 ? 'th' : 'td'
        return <Cell key={cellIndex} style={{ textAlign: block.align[cellIndex] ?? undefined }}>
          <InlineView nodes={cell} />
        </Cell>
      })}</tr>,
    )}</tbody></table>
    case 'divider': return <hr />
    case 'pageBreak': return <div className="publishing-workbench__page-break" role="separator" aria-label="分页符">分页</div>
  }
}
