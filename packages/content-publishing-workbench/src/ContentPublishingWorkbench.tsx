import Markdown from 'react-markdown'
import { Button } from './components/ui/button'

export interface PublisherSourceMeta {
  title: string
  source: string
  author?: string
  published?: string
  created: string
  tags?: string[]
}

export interface ContentPublishingWorkbenchProps {
  meta: PublisherSourceMeta
  markdown: string
}

export function ContentPublishingWorkbench({ meta, markdown }: ContentPublishingWorkbenchProps) {
  return (
    <main className="publishing-workbench">
      <header className="publishing-workbench__header">
        <div>
          <p className="publishing-workbench__eyebrow">CONTENT STUDIO</p>
          <h1>内容发布工作台</h1>
        </div>
        <span>草稿已保存</span>
      </header>
      <section className="publishing-workbench__source" aria-labelledby="source-pane-title">
        <div className="publishing-workbench__pane-header">
          <div>
            <p>01 / SOURCE</p>
            <h2 id="source-pane-title">内容原文</h2>
          </div>
          <Button asChild variant="link" size="sm">
            <a href={meta.source} target="_blank" rel="noreferrer">查看来源</a>
          </Button>
        </div>
        <article className="publishing-workbench__markdown">
          <h3>{meta.title}</h3>
          <dl className="publishing-workbench__metadata">
            {meta.author && <><dt>作者</dt><dd>{meta.author}</dd></>}
            {meta.published && <><dt>发布时间</dt><dd>{meta.published}</dd></>}
            <dt>创建时间</dt><dd>{meta.created}</dd>
            {meta.tags?.length ? <><dt>标签</dt><dd>{meta.tags.join(' · ')}</dd></> : null}
          </dl>
          <Markdown>{markdown}</Markdown>
        </article>
      </section>
    </main>
  )
}
