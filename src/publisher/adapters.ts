import { browser } from 'wxt/browser'
import type { WorkbenchAdapters } from '@qiushui/content-publishing-workbench'
import { getSettings } from '../storage/settings'
import { getPublisherLayout, savePublisherDraft, savePublisherLayout } from './drafts'
import {
  generatePublisherMarkdown,
  getPublisherModelChoices,
  resolvePublisherModelSelection,
} from './ai'
import { downloadPublisherArtifact } from './download'

export function createPublisherAdapters(): WorkbenchAdapters {
  return {
    async listModels() {
      return getPublisherModelChoices(await getSettings())
    },
    async listTemplates() {
      const settings = await getSettings()
      return settings.systemPrompts.map(prompt => ({ ...prompt }))
    },
    async getDefaultModel() {
      return resolvePublisherModelSelection(await getSettings())
    },
    async generate(input) {
      return generatePublisherMarkdown(input, await getSettings())
    },
    saveDraft: savePublisherDraft,
    loadLayout: getPublisherLayout,
    saveLayout: savePublisherLayout,
    async openSettings() {
      await browser.tabs.create({ url: browser.runtime.getURL('/options.html') })
    },
    download: downloadPublisherArtifact,
  }
}
