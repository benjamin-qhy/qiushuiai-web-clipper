import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import type { BookmarkRecord } from '../storage/bookmarks'
import { getDirPath } from '../filesystem/save'
import { getFolderDescriptions } from '../storage/folderDescriptions'
import { getSettings } from '../storage/settings'

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode

function collectUrls(node: BookmarkNode): BookmarkNode[] {
  if (node.url) return [node]
  const results: BookmarkNode[] = []
  for (const child of node.children ?? []) {
    results.push(...collectUrls(child))
  }
  return results
}

function buildEntry(bm: BookmarkNode, record?: BookmarkRecord): string {
  const title = record?.title || bm.title || bm.url || ''
  const url = bm.url!
  const summary = record?.summary ? `\n${record.summary}` : ''
  const tagsLine = record?.tags?.length ? `\n${record.tags.map(t => `#${t}`).join(' ')}` : ''
  return `## [${title}](${url})${summary}${tagsLine}\n\n`
}

function buildFrontmatter(title: string, description: string, date: string): string {
  const descLine = description ? `\ndescription: "${description.replace(/"/g, '\\"')}"` : ''
  return `---\ntitle: "${title}"${descLine}\ntags: [bookmarks]\nupdated: ${date}\n---\n\n`
}

export async function exportBookmarksToVault(
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  records: Map<string, BookmarkRecord>,
): Promise<void> {
  const dirHandle = await getDirPath(vaultHandle, subDir, 'Bookmarks')
  const [descriptions, settings] = await Promise.all([getFolderDescriptions(), getSettings()])
  const inboxName = settings.bookmarkInboxFolder
  const date = new Date().toISOString().slice(0, 10)

  const roots = await browser.bookmarks.getTree()
  const bar = roots[0]?.children?.find(n => !n.url) ?? roots[0]?.children?.[0]
  if (!bar) return

  for (const folder of bar.children ?? []) {
    if (folder.url) continue
    if (folder.title === inboxName) continue

    const title = folder.title
    const description = descriptions[folder.id] ?? ''
    const allBookmarks = collectUrls(folder)

    if (allBookmarks.length === 0) continue

    const entries = allBookmarks.map(bm => buildEntry(bm, records.get(bm.id))).join('')
    const content = buildFrontmatter(title, description, date) + entries

    const filename = `${title}.md`
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }
}
