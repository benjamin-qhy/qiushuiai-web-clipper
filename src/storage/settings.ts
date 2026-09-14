import { browser } from 'wxt/browser'

export interface AliyunOSSConfig {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
  prefix: string
  customDomain: string
}

export interface AIConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface AIPlatformConfig {
  id: string
  provider: string
  apiKey: string
  baseUrl?: string
  customModels: string[]
}

export interface AIModelSelection {
  platformId: string
  modelId: string
}

export interface SystemPrompt {
  id: string
  title: string
  content: string
}

export interface GetNoteConfig {
  clientId: string
  authToken: string
  batchIntervalSeconds: number
}

export interface Settings {
  subDir: string
  imageMode: 'local' | 'oss'
  imageLocalMode: 'per-note' | 'shared'
  imageLocalDir: string
  ossProvider: 'aliyun'
  aliyunOSS: AliyunOSSConfig
  aiPlatforms: AIPlatformConfig[]
  lastUsedAIModel: AIModelSelection | null
  systemPrompts: SystemPrompt[]
  getNote: GetNoteConfig
  bookmarkInboxFolder: string
  bookmarkSubDir: string
  bookmarkSystemPrompt: string
}

const STORAGE_KEY = 'feishu-clipper-settings'

export const DEFAULT_SETTINGS: Settings = {
  subDir: 'Clippings',
  imageMode: 'local',
  imageLocalMode: 'per-note',
  imageLocalDir: 'images',
  ossProvider: 'aliyun',
  aliyunOSS: {
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: 'oss-cn-hangzhou',
    prefix: 'qiushui-web-clipper',
    customDomain: '',
  },
  aiPlatforms: [],
  lastUsedAIModel: null,
  systemPrompts: [],
  getNote: {
    clientId: '',
    authToken: '',
    batchIntervalSeconds: 1,
  },
  bookmarkInboxFolder: '待整理',
  bookmarkSubDir: 'Bookmarks',
  bookmarkSystemPrompt: '你是一个书签整理助手。根据网页的标题、关键词、描述和 URL，从给定的文件夹结构中选出最合适的目录路径。',
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<Settings> & { aiConfig?: AIConfig }
  const { aiConfig: legacyAIConfig, ...currentSettings } = stored
  const hasStoredPlatforms = Array.isArray(stored.aiPlatforms)
  const aiPlatforms = hasStoredPlatforms
    ? stored.aiPlatforms!.map(platform => ({
        ...platform,
        customModels: [...(platform.customModels ?? [])],
      }))
    : legacyAIConfig
      ? [{
          id: 'legacy-openai-compatible',
          provider: 'openai-compatible',
          apiKey: legacyAIConfig.apiKey,
          baseUrl: legacyAIConfig.baseUrl,
          customModels: legacyAIConfig.model ? [legacyAIConfig.model] : [],
        }]
      : []
  const lastUsedAIModel = stored.lastUsedAIModel
    ?? (!hasStoredPlatforms && legacyAIConfig?.model
      ? { platformId: 'legacy-openai-compatible', modelId: legacyAIConfig.model }
      : null)
  const validLastUsedAIModel = lastUsedAIModel
    && aiPlatforms.some(platform => platform.id === lastUsedAIModel.platformId)
    ? lastUsedAIModel
    : null

  return {
    ...DEFAULT_SETTINGS,
    ...currentSettings,
    aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS, ...stored.aliyunOSS },
    aiPlatforms,
    lastUsedAIModel: validLastUsedAIModel,
    systemPrompts: (stored.systemPrompts ?? []).map(prompt => ({ ...prompt })),
    getNote: { ...DEFAULT_SETTINGS.getNote, ...stored.getNote },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings })
}
