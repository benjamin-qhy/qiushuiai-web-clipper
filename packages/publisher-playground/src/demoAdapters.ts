import {
  DEFAULT_PUBLISHER_LAYOUT,
  type PublisherDraft,
  type PublisherLayout,
  type WorkbenchAdapters,
} from '@qiushui/content-publishing-workbench'

const DRAFT_KEY = 'qiushui.publisher-playground.draft'
const LAYOUT_KEY = 'qiushui.publisher-playground.layout'

function readStored<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key)
  if (!value) return structuredClone(fallback)
  try {
    return JSON.parse(value) as T
  } catch {
    return structuredClone(fallback)
  }
}

export function loadDemoDraft(fallback: PublisherDraft): PublisherDraft {
  return readStored(DRAFT_KEY, fallback)
}

export function createDemoAdapters(): WorkbenchAdapters {
  return {
    async listModels() {
      return [{
        platformId: 'demo',
        modelId: 'local-preview',
        reasoning: 'off',
        label: '本地模拟模型',
        groupLabel: 'Web 预览',
        reasoningLevels: ['off'],
      }]
    },
    async listTemplates() {
      return [{
        id: 'demo-xhs',
        title: '小红书图文演示',
        content: '将原文整理为简洁、有层次的小红书图文。',
      }]
    },
    async getDefaultModel() {
      return { platformId: 'demo', modelId: 'local-preview', reasoning: 'off' }
    },
    async generate(input) {
      const excerpt = input.sourceMarkdown.replace(/^# .*$/m, '').trim().slice(0, 180)
      return `# Web 预览生成结果\n\n${excerpt}\n\n## 本地模拟生成\n\n- 没有调用插件接口\n- 没有发送网络请求\n- 可以继续编辑并测试分页与导出\n\n==这是一段重点内容。==`
    },
    async saveDraft(draft) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    },
    async loadLayout() {
      return readStored<PublisherLayout>(LAYOUT_KEY, DEFAULT_PUBLISHER_LAYOUT)
    },
    async saveLayout(layout) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    },
    async openSettings() {
      window.alert('Web 预览使用本地模拟模型，不需要配置 API Key。')
    },
    async download({ blob, fileName }) {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
    },
  }
}
