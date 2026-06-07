import { ref } from 'vue'
import { browser } from 'wxt/browser'
import {
  saveToVault,
  saveImageToVault,
  saveImageToSharedDir,
  saveToDir,
  prepareSaveToVault,
  prepareSaveToDir,
  clearPerNoteAssetsInDir,
  clearSharedImagesInDir,
  getDirPath,
} from '../filesystem/save'
import { computeSharedImagePath } from '../filesystem/paths'
import { buildFrontmatter } from '../converter/frontmatter'
import { blocksToMarkdown } from '../converter/blocks'
import { getSettings } from '../storage/settings'
import { createUploader } from '../uploader/index'
import type { ImageUploader } from '../uploader/types'
import type { Block, DocContent, MessageResponse } from '../types'

export function useFileSave() {
  const savedFilename = ref<string | null>(null)
  const error = ref<string | null>(null)
  const isSaving = ref(false)

  async function save(
    vaultHandle: FileSystemDirectoryHandle,
    doc: DocContent,
    overrideDirHandle?: FileSystemDirectoryHandle,
  ) {
    isSaving.value = true
    error.value = null
    savedFilename.value = null

    try {
      const settings = await getSettings()
      const frontmatter = buildFrontmatter(doc)
      const effectiveSubDir = overrideDirHandle ? '' : settings.subDir
      const storageHandle = overrideDirHandle ?? vaultHandle
      const uploader = createUploader(settings)
      const confirmOverwrite = (filename: string) =>
        window.confirm(
          `目标位置已存在同名文件“${filename}”。\n\n选择“确定”将覆盖现有 Markdown 文件及对应图片资源；选择“取消”将自动保存为新文件名。`,
        )
      const saveTarget = overrideDirHandle
        ? await prepareSaveToDir(overrideDirHandle, doc.title, confirmOverwrite)
        : await prepareSaveToVault(vaultHandle, settings.subDir, doc.title, confirmOverwrite)

      if (saveTarget.overwrite && !uploader) {
        if (settings.imageLocalMode === 'shared') {
          await clearSharedImagesInDir(storageHandle, settings.imageLocalDir, saveTarget.notename)
        } else {
          const noteDirHandle = overrideDirHandle ?? await getDirPath(vaultHandle, settings.subDir, 'Clippings')
          await clearPerNoteAssetsInDir(noteDirHandle, saveTarget.notename)
        }
      }

      let body: string

      if (doc.markdown !== undefined) {
        body = await downloadAndReplaceMarkdownImages(
          doc.markdown,
          storageHandle,
          effectiveSubDir,
          saveTarget.notename,
          uploader,
          doc.source,
          settings.imageLocalMode,
          settings.imageLocalDir,
        )
      } else {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
        const blocks =
          tab?.id != null
            ? await downloadAndReplaceImages(
                doc.blocks,
                tab.id,
                storageHandle,
                effectiveSubDir,
                saveTarget.notename,
                uploader,
                settings.imageLocalMode,
                settings.imageLocalDir,
              )
            : doc.blocks
        body = blocksToMarkdown(blocks)
      }

      const content = `${frontmatter}\n${body}\n`
      const filename = overrideDirHandle
        ? await saveToDir(overrideDirHandle, doc.title, content, { filename: saveTarget.filename })
        : await saveToVault(vaultHandle, settings.subDir, doc.title, content, { filename: saveTarget.filename })
      savedFilename.value = filename
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isSaving.value = false
    }
  }

  async function copyToClipboard(doc: DocContent) {
    const frontmatter = buildFrontmatter(doc)
    const body = doc.markdown !== undefined ? doc.markdown : blocksToMarkdown(doc.blocks)
    const content = `${frontmatter}\n${body}\n`
    await navigator.clipboard.writeText(content)
  }

  return { savedFilename, error, isSaving, save, copyToClipboard }
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
  }
  return map[mimeType] ?? 'png'
}

async function downloadAndReplaceImages(
  blocks: Block[],
  tabId: number,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
  imageLocalMode: 'per-note' | 'shared' = 'per-note',
  imageLocalDir: string = 'images',
): Promise<Block[]> {
  let imageIndex = 0
  const result: Block[] = []
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  for (const block of blocks) {
    if (block.type !== 'image' || !block.src) {
      result.push(block)
      continue
    }

    imageIndex++
    try {
      let base64: string
      let mimeType: string

      if (block.src.startsWith('data:')) {
        const [header, b64] = block.src.split(',')
        if (!b64) {
          result.push(block)
          continue
        }
        const mimeMatch = header.match(/data:([^;]+)/)
        mimeType = mimeMatch?.[1] ?? 'image/png'
        base64 = b64
      } else {
        const resp = (await browser.tabs.sendMessage(tabId, {
          type: 'DOWNLOAD_IMAGE',
          url: block.src,
        })) as MessageResponse

        if (!resp.ok || !('base64' in resp) || !('mimeType' in resp)) {
          result.push(block)
          continue
        }
        mimeType = resp.mimeType
        base64 = resp.base64
      }

      if (uploader) {
        const url = await uploader.upload({ base64, mimeType, notename, source: 'feishu' })
        result.push({ ...block, src: url })
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        if (imageLocalMode === 'shared') {
          await saveImageToSharedDir(vaultHandle, imageLocalDir, filename, base64)
          result.push({ ...block, src: computeSharedImagePath(subDir, imageLocalDir, filename) })
        } else {
          await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
          result.push({ ...block, src: `${notename}.assets/${filename}` })
        }
      }
    } catch {
      result.push(block)
    }
  }

  return result
}

async function fetchImageAsBase64(url: string, referer?: string): Promise<{ base64: string; mimeType: string }> {
  const init: RequestInit = referer ? { referrer: referer, referrerPolicy: 'no-referrer-when-downgrade' } : {}
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const blob = await response.blob()
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return { base64, mimeType: blob.type || 'image/png' }
}

async function downloadAndReplaceMarkdownImages(
  markdown: string,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
  referer?: string,
  imageLocalMode: 'per-note' | 'shared' = 'per-note',
  imageLocalDir: string = 'images',
): Promise<string> {
  const imagePattern = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  let imageIndex = 0
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const replacements: Array<{ original: string; replacement: string }> = []
  const seen = new Map<string, string>()

  const allMatches = [...markdown.matchAll(imagePattern)]

  for (const match of allMatches) {
    const [full, alt, url] = match
    if (seen.has(url)) {
      replacements.push({ original: full, replacement: `![${alt}](${seen.get(url)})` })
      continue
    }

    imageIndex++
    try {
      const { base64, mimeType } = await fetchImageAsBase64(url, referer)
      let newUrl: string

      if (uploader) {
        newUrl = await uploader.upload({ base64, mimeType, notename, source: 'web' })
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        if (imageLocalMode === 'shared') {
          await saveImageToSharedDir(vaultHandle, imageLocalDir, filename, base64)
          newUrl = computeSharedImagePath(subDir, imageLocalDir, filename)
        } else {
          await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
          newUrl = `${notename}.assets/${filename}`
        }
      }

      seen.set(url, newUrl)
      replacements.push({ original: full, replacement: `![${alt}](${newUrl})` })
    } catch {
      // keep original on error
    }
  }

  let result = markdown
  for (const { original, replacement } of replacements) {
    result = result.replaceAll(original, replacement)
  }
  return result
}
