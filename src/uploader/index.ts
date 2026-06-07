import type { Settings } from '../storage/settings'
import type { ImageUploader } from './types'
import { AliyunOSSUploader } from './aliyun'

export function createUploader(settings: Settings): ImageUploader | null {
  if (settings.imageMode !== 'oss') return null
  if (settings.ossProvider === 'aliyun') return new AliyunOSSUploader(settings.aliyunOSS)
  return null
}
