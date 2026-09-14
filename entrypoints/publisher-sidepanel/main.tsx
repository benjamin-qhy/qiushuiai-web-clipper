import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ContentPublishingWorkbench } from '@qiushui/content-publishing-workbench'
import '@qiushui/content-publishing-workbench/styles.css'
import './style.css'
import {
  takeOpeningPublisherDraftId,
  waitForActivePublisherDraft,
  waitForPublisherDraft,
} from '../../src/publisher/drafts'
import type { PublisherDraft } from '../../src/publisher/types'

const searchParams = new URLSearchParams(window.location.search)

async function resolveDraft(): Promise<PublisherDraft | null> {
  const directDraftId = searchParams.get('draftId')
  const tabId = Number(searchParams.get('tabId'))
  const openingDraftId = Number.isInteger(tabId) && tabId > 0
    ? takeOpeningPublisherDraftId(tabId)
    : null

  if (openingDraftId || directDraftId) {
    return waitForPublisherDraft(openingDraftId ?? directDraftId!)
  }
  return Number.isInteger(tabId) && tabId > 0
    ? waitForActivePublisherDraft(tabId)
    : null
}

function PublisherSidePanel() {
  const [draft, setDraft] = useState<PublisherDraft | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    resolveDraft()
      .then(setDraft)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="publisher-status">正在载入内容…</p>
  if (!draft) return <p className="publisher-status">未找到发布草稿，请返回插件重新打开。</p>

  return (
    <ContentPublishingWorkbench
      meta={draft.snapshot.meta}
      markdown={draft.snapshot.markdown}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublisherSidePanel />
  </StrictMode>,
)
