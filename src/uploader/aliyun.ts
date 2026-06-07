import type { AliyunOSSConfig } from '../storage/settings'
import type { ImageUploader, UploadParams } from './types'

export const OSS_SIGNATURE_DIAGNOSTIC_VERSION = 'oss-v1-x-oss-date-trim-config'

export class AliyunOSSUploader implements ImageUploader {
  constructor(private config: AliyunOSSConfig) {}

  async upload({ base64, mimeType, notename, source }: UploadParams): Promise<string> {
    const config = normalizeConfig(this.config)
    const ext = mimeToExt(mimeType)
    const now = new Date()
    const objectKey = buildObjectKey({ prefix: config.prefix, source, notename, date: now, ext })

    const bytes = base64ToBytes(base64)
    const ossDate = formatOssDate(now)
    const signature = await signOSS({
      method: 'PUT',
      contentType: mimeType,
      ossDate,
      bucket: config.bucket,
      objectKey,
      secretKey: config.accessKeySecret,
    })
    const stringToSign = buildStringToSign({
      method: 'PUT',
      contentType: mimeType,
      ossDate,
      bucket: config.bucket,
      objectKey,
    })

    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
    const uploadUrl = `https://${config.bucket}.${config.region}.aliyuncs.com/${encodedKey}`
    const publicUrl = buildPublicUrl(config, encodedKey)

    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'x-oss-date': ossDate,
        'Authorization': `OSS ${config.accessKeyId}:${signature}`,
      },
      body: bytes,
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(
        `OSS upload failed ${resp.status}: ${text}\n\nClientDiagnostics:\n${buildClientDiagnostics({
          accessKeyId: config.accessKeyId,
          accessKeySecretLength: config.accessKeySecret.length,
          bucket: config.bucket,
          region: config.region,
          prefix: config.prefix,
          customDomain: config.customDomain,
          ossDate,
          objectKey,
          stringToSign,
        })}`,
      )
    }

    return publicUrl
  }
}

export function buildObjectKey(params: {
  prefix: string
  source: string
  notename: string
  date: Date
  ext: string
}): string {
  const { prefix, notename, date, ext } = params
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const ts = formatTimestamp(date)
  const prefixSegments = normalizePrefix(prefix)
  const noteSegment = safeObjectSegment(notename) || 'untitled'
  return [...prefixSegments, yyyymm, `${noteSegment}-${ts}.${ext}`].join('/')
}

export function formatTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
}

export function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
  }
  return map[mimeType] ?? 'png'
}

async function signOSS(params: {
  method: string
  contentType: string
  ossDate: string
  bucket: string
  objectKey: string
  secretKey: string
}): Promise<string> {
  const stringToSign = buildStringToSign(params)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

function base64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  const base64 = normalizeBase64(input)
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function normalizeBase64(input: string): string {
  const dataUrlMatch = input.match(/^data:[^,]*;base64,(.*)$/is)
  const rawBase64 = dataUrlMatch ? dataUrlMatch[1] : input
  const standard = rawBase64.trim().replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padding = standard.length % 4
  return padding === 0 ? standard : standard.padEnd(standard.length + 4 - padding, '=')
}

function formatOssDate(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('')
}

function normalizePrefix(prefix: string): string[] {
  return prefix
    .split(/[\\/]+/)
    .map(safeObjectSegment)
    .filter(Boolean)
}

function safeObjectSegment(segment: string): string {
  const safeSegment = segment.trim().replace(/[\\/]+/g, '-')
  return safeSegment === '.' || safeSegment === '..' ? '_' : safeSegment
}

function buildStringToSign(params: {
  method: string
  contentType: string
  ossDate: string
  bucket: string
  objectKey: string
}): string {
  const canonicalizedOssHeaders = `x-oss-date:${params.ossDate}\n`
  return [
    params.method,
    '',
    params.contentType,
    params.ossDate,
    `${canonicalizedOssHeaders}/${params.bucket}/${params.objectKey}`,
  ].join('\n')
}

function normalizeConfig(config: AliyunOSSConfig): AliyunOSSConfig {
  return {
    accessKeyId: config.accessKeyId.trim(),
    accessKeySecret: config.accessKeySecret.trim(),
    bucket: config.bucket.trim(),
    region: config.region.trim(),
    prefix: config.prefix.trim(),
    customDomain: config.customDomain.trim(),
  }
}

function buildClientDiagnostics(params: {
  accessKeyId: string
  accessKeySecretLength: number
  bucket: string
  region: string
  prefix: string
  customDomain: string
  ossDate: string
  objectKey: string
  stringToSign: string
}): string {
  return [
    `version=${OSS_SIGNATURE_DIAGNOSTIC_VERSION}`,
    `accessKeyId=${params.accessKeyId}`,
    `accessKeySecretLength=${params.accessKeySecretLength}`,
    `bucket=${params.bucket}`,
    `region=${params.region}`,
    `prefix=${params.prefix}`,
    `customDomain=${params.customDomain}`,
    `x-oss-date=${params.ossDate}`,
    `objectKey=${params.objectKey}`,
    `stringToSign=${params.stringToSign}`,
  ].join('\n')
}

function buildPublicUrl(config: AliyunOSSConfig, encodedKey: string): string {
  const baseUrl = normalizePublicBaseUrl(config)
  return `${baseUrl}/${encodedKey}`
}

function normalizePublicBaseUrl(config: AliyunOSSConfig): string {
  if (config.customDomain) {
    const withScheme = /^[a-z]+:\/\//i.test(config.customDomain)
      ? config.customDomain
      : `https://${config.customDomain}`
    return withScheme.replace(/\/+$/g, '')
  }

  return `https://${config.bucket}.${config.region}.aliyuncs.com`
}
