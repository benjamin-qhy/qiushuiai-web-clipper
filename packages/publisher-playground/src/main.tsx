import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ContentPublishingWorkbench } from '@qiushui/content-publishing-workbench'
import '@qiushui/content-publishing-workbench/styles.css'
import { createDemoAdapters, loadDemoDraft } from './demoAdapters'
import { sampleDraft } from './sampleDraft'

const adapters = createDemoAdapters()
const draft = loadDemoDraft(sampleDraft)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContentPublishingWorkbench initialDraft={draft} adapters={adapters} />
  </StrictMode>,
)
