import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { fail, fields, text } from './protocol.mts'

export interface Asset { id: string; filename: string; mediaType: string; sizeBytes: number; sha256: string; ready: boolean }
export async function receiveAsset(req: IncomingMessage, directory: string, asset: Asset, maxBytes: number) {
  const folder = join(directory, 'assets')
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const path = join(folder, `${asset.id}.${randomUUID()}.partial`)
  const file = await open(path, 'wx', 0o600)
  const digest = createHash('sha256')
  let sizeBytes = 0
  try {
    for await (const chunk of req) {
      sizeBytes += chunk.length
      if (sizeBytes > maxBytes) fail(413, 'ASSET_TOO_LARGE', '素材超过部署上传上限')
      if (sizeBytes > asset.sizeBytes) fail(422, 'ASSET_SIZE_MISMATCH', '素材长度与声明不符')
      digest.update(chunk); await file.writeFile(chunk)
    }
    const sha256 = digest.digest('hex')
    if (sizeBytes !== asset.sizeBytes || sha256 !== asset.sha256) fail(422, 'ASSET_INTEGRITY_MISMATCH', '素材长度或摘要与声明不符')
    await file.sync()
    return { path, sha256, sizeBytes }
  } catch (error) { await unlink(path); throw error }
  finally { await file.close() }
}
export function assetRoute({ method, path, body, assets, manager, maxAssetBytes, canRead = () => false }: {
  method?: string; path: string; body: Record<string, unknown>; assets: Asset[]; manager: boolean;
  maxAssetBytes: number; canRead?: (id: string) => boolean;
}): { status: number; result?: unknown; download?: Asset } | undefined {
  if (method === 'POST' && path === '/v1/assets') {
    if (!manager) fail(403, 'FORBIDDEN', '仅 Skill 或管理身份可以声明素材')
    fields(body, ['filename', 'mediaType', 'sizeBytes', 'sha256'])
    const filename = text(body, 'filename', 255); const mediaType = text(body, 'mediaType')
    if (!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/.test(mediaType)) fail(422, 'INVALID_ASSET_TYPE', '素材必须是支持的图片或视频媒体类型')
    const sizeBytes = body.sizeBytes
    if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) fail(422, 'INVALID_SIZE', '素材大小必须为正整数')
    if (sizeBytes > maxAssetBytes) fail(413, 'ASSET_TOO_LARGE', '素材超过部署上传上限')
    const sha256 = text(body, 'sha256')
    if (!/^[a-f0-9]{64}$/.test(sha256)) fail(422, 'INVALID_DIGEST', 'sha256 必须是64位小写十六进制摘要')
    const asset: Asset = { id: randomUUID(), filename, mediaType, sizeBytes, sha256, ready: false }
    assets.push(asset)
    return { status: 201, result: { assetId: asset.id, ready: false, maxSizeBytes: maxAssetBytes } }
  }
  const match = /^\/v1\/assets\/([^/]+)(\/content)?$/.exec(path)
  if (!match) return
  const asset = assets.find(asset => asset.id === match[1])
  if (!asset) fail(404, 'ASSET_NOT_FOUND', '素材不存在')
  if (!manager && !(method === 'GET' && canRead(asset.id))) fail(403, 'FORBIDDEN', '安装只能读取指定任务引用的素材')
  if (method === 'GET' && !match[2]) return { status: 200, result: asset }
  if (method === 'GET' && match[2]) {
    if (!asset.ready) fail(409, 'ASSET_NOT_READY', '素材尚未完整上传')
    return { status: 200, download: asset }
  }
  if (method === 'PUT' && match[2]) return { status: 200 }
}
