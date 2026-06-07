import { sanitizeFilename, resolveFilename, chooseFilename } from '../converter/filename'

export interface SaveTarget {
  filename: string
  notename: string
  overwrite: boolean
}

export async function saveImageToVault(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  filename: string,
  base64: string,
): Promise<void> {
  const dirHandle = await getDirPath(vaultHandle, subDir, 'Clippings')
  const assetsHandle = await getDir(dirHandle, `${notename}.assets`)
  const safeFilename = filename.replace(/^\.+/, '') || 'image.png'
  const fileHandle = await assetsHandle.getFileHandle(safeFilename, { create: true })
  const writable = await fileHandle.createWritable()
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  await writable.write(bytes)
  await writable.close()
}
export async function saveToVault(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  title: string,
  content: string,
  options?: { filename?: string },
): Promise<string> {
  const dirHandle = await getDirPath(vaultHandle, subDir, 'Clippings')
  const filename = options?.filename ?? await resolveMarkdownFilename(dirHandle, title)

  console.log('[feishu-clipper] saving md file:', JSON.stringify(filename))
  await writeFile(dirHandle, filename, content)

  return filename
}

export async function getDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  console.log('[feishu-clipper] getDirectoryHandle:', JSON.stringify(name))
  return parent.getDirectoryHandle(name, { create: true }).catch(e => {
    throw new Error(`无法创建目录 "${name}": ${e}`)
  })
}

export async function getDirPath(
  root: FileSystemDirectoryHandle,
  path: string,
  fallback: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = (path.trim() || fallback).split('/').map(p => p.trim()).filter(Boolean)
  let handle = root
  for (const part of parts) handle = await getDir(handle, part)
  return handle
}

export async function saveImageToSharedDir(
  vaultHandle: FileSystemDirectoryHandle,
  imageLocalDir: string,
  filename: string,
  base64: string,
): Promise<void> {
  const dirHandle = await getDirPath(vaultHandle, imageLocalDir, 'images')
  const safeFilename = filename.replace(/^\.+/, '') || 'image.png'
  const fileHandle = await dirHandle.getFileHandle(safeFilename, { create: true })
  const writable = await fileHandle.createWritable()
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  await writable.write(bytes)
  await writable.close()
}

export async function saveToDir(
  dirHandle: FileSystemDirectoryHandle,
  title: string,
  content: string,
  options?: { filename?: string },
): Promise<string> {
  const filename = options?.filename ?? await resolveMarkdownFilename(dirHandle, title)
  await writeFile(dirHandle, filename, content)
  return filename
}

export async function prepareSaveToVault(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  title: string,
  confirmOverwrite: (filename: string) => boolean | Promise<boolean>,
): Promise<SaveTarget> {
  const dirHandle = await getDirPath(vaultHandle, subDir, 'Clippings')
  return prepareSaveTarget(dirHandle, title, confirmOverwrite)
}

export async function prepareSaveToDir(
  dirHandle: FileSystemDirectoryHandle,
  title: string,
  confirmOverwrite: (filename: string) => boolean | Promise<boolean>,
): Promise<SaveTarget> {
  return prepareSaveTarget(dirHandle, title, confirmOverwrite)
}

export async function clearPerNoteAssets(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
): Promise<void> {
  const dirHandle = await getDirPath(vaultHandle, subDir, 'Clippings')
  await clearPerNoteAssetsInDir(dirHandle, notename)
}

export async function clearSharedImages(
  vaultHandle: FileSystemDirectoryHandle,
  imageLocalDir: string,
  notename: string,
): Promise<void> {
  await clearSharedImagesInDir(vaultHandle, imageLocalDir, notename)
}

export async function clearPerNoteAssetsInDir(
  dirHandle: FileSystemDirectoryHandle,
  notename: string,
): Promise<void> {
  await removeEntryIfExists(dirHandle, `${notename}.assets`, { recursive: true })
}

export async function clearSharedImagesInDir(
  rootHandle: FileSystemDirectoryHandle,
  imageLocalDir: string,
  notename: string,
): Promise<void> {
  const dirHandle = await getDirPath(rootHandle, imageLocalDir, 'images')
  const pattern = new RegExp(`^${escapeRegExp(notename)}-\\d{8}-\\d+\\.[^.]+$`)
  for await (const name of dirHandle.keys()) {
    if (!pattern.test(name)) continue
    await removeEntryIfExists(dirHandle, name)
  }
}

async function prepareSaveTarget(
  dirHandle: FileSystemDirectoryHandle,
  title: string,
  confirmOverwrite: (filename: string) => boolean | Promise<boolean>,
): Promise<SaveTarget> {
  const existing = await listExistingMarkdownBasenames(dirHandle)
  const base = sanitizeFilename(title)
  const { finalName, overwrite } = await chooseFilename(base, existing, confirmOverwrite)
  return {
    filename: `${finalName}.md`,
    notename: finalName,
    overwrite,
  }
}

async function resolveMarkdownFilename(
  dirHandle: FileSystemDirectoryHandle,
  title: string,
): Promise<string> {
  const existing = await listExistingMarkdownBasenames(dirHandle)
  const base = sanitizeFilename(title)
  return `${resolveFilename(base, existing)}.md`
}

async function listExistingMarkdownBasenames(dirHandle: FileSystemDirectoryHandle): Promise<Set<string>> {
  const existing = new Set<string>()
  for await (const name of dirHandle.keys()) {
    if (name.endsWith('.md')) existing.add(name.slice(0, -3))
  }
  return existing
}

async function writeFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true }).catch(e => {
    throw new Error(`无法创建文件 "${filename}": ${e}`)
  })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

async function removeEntryIfExists(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
  options?: { recursive?: boolean },
): Promise<void> {
  try {
    await dirHandle.removeEntry(name, options)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return
    throw e
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
