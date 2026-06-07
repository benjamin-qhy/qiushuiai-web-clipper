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
  aiConfig: AIConfig
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
  aiConfig: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    model: 'qwen-long',
  },
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
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS, ...stored.aliyunOSS },
    aiConfig: { ...DEFAULT_SETTINGS.aiConfig, ...stored.aiConfig },
    getNote: { ...DEFAULT_SETTINGS.getNote, ...stored.getNote },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings })
}
