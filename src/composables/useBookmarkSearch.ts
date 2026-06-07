import { ref } from 'vue'
import { browser } from 'wxt/browser'
import type { BookmarkListItem } from './useBookmarkTree'
import type { BookmarkRecord } from '../storage/bookmarks'
import { getAllBookmarkRecords } from '../storage/bookmarks'
import { getSettings } from '../storage/settings'
import { createAIProvider } from '../ai'

function getDomain(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function useBookmarkSearch() {
  const searchQuery = ref('')
  const searchResults = ref<BookmarkListItem[]>([])
  const isSearchActive = ref(false)
  const isSearching = ref(false)
  const searchError = ref<string | null>(null)

  async function search(query: string) {
    const q = query.trim()
    if (!q) {
      clear()
      return
    }

    searchQuery.value = query
    isSearchActive.value = true
    isSearching.value = true
    searchError.value = null

    try {
      const roots = await browser.bookmarks.getTree()
      const allBookmarks: BookmarkListItem[] = []
      function collect(nodes: any[]) {
        for (const n of nodes) {
          if (n.url) allBookmarks.push({ ...n, folderPath: '' })
          if (n.children) collect(n.children)
        }
      }
      collect(roots[0]?.children ?? [])

      const records = await getAllBookmarkRecords()
      const recordsMap = new Map(records.map(r => [r.id, r]))
      const lower = q.toLowerCase()

      searchResults.value = allBookmarks.filter(bm => {
        if (bm.title?.toLowerCase().includes(lower)) return true
        if (bm.url?.toLowerCase().includes(lower)) return true
        const rec = recordsMap.get(bm.id)
        if (rec?.summary?.toLowerCase().includes(lower)) return true
        if (rec?.tags?.some(t => t.toLowerCase().includes(lower))) return true
        return false
      })
    } catch (e) {
      searchError.value = e instanceof Error ? e.message : String(e)
    } finally {
      isSearching.value = false
    }
  }

  async function aiSearch(query: string, recordsMap: Map<string, BookmarkRecord>) {
    const q = query.trim()
    if (!q) {
      clear()
      return
    }

    searchQuery.value = query
    isSearchActive.value = true
    isSearching.value = true
    searchError.value = null

    try {
      const settings = await getSettings()
      if (!settings.aiConfig.apiKey) {
        throw new Error('AI 未配置，请先在设置中填写 API Key')
      }

      // Collect all bookmarks from the full tree
      const roots = await browser.bookmarks.getTree()
      const allBookmarks: BookmarkListItem[] = []

      function collect(nodes: any[]) {
        for (const n of nodes) {
          if (n.url) allBookmarks.push({ ...n, folderPath: '' })
          if (n.children) collect(n.children)
        }
      }
      collect(roots[0]?.children ?? [])

      // Build compact lines: index | title | domain | tags
      const lines = allBookmarks.map((bm, i) => {
        const parts = [`[${i}] ${bm.title || bm.url}`]
        const domain = getDomain(bm.url)
        if (domain) parts.push(`域名: ${domain}`)
        const record = recordsMap.get(bm.id)
        if (record?.tags?.length) parts.push(`标签: ${record.tags.join(', ')}`)
        return parts.join(' | ')
      })

      const ai = createAIProvider(settings.aiConfig)
      const userPrompt = `查询: "${q}"\n\n书签列表:\n${lines.join('\n')}`
      const systemPrompt = '你是一个书签语义搜索助手。从书签列表中找出与查询语义最相关的书签，只返回 JSON：{"indices":[0,2,5]}（按相关度降序，最多20个）。'
      console.log('[bookmark-ai-search] submit', {
        time: new Date().toISOString(),
        query: q,
        bookmarkCount: allBookmarks.length,
        systemPrompt,
        userPrompt,
      })
      const response = await ai.complete(userPrompt, systemPrompt)

      const parsed = JSON.parse(response) as { indices: number[] }
      console.log('[bookmark-ai-search] response', {
        time: new Date().toISOString(),
        query: q,
        rawResponse: response,
        parsedIndices: parsed.indices ?? [],
      })
      searchResults.value = (parsed.indices ?? [])
        .filter((i: number) => Number.isInteger(i) && i >= 0 && i < allBookmarks.length)
        .map((i: number) => allBookmarks[i])
    } catch (e) {
      searchError.value = e instanceof Error ? e.message : String(e)
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

  function clear() {
    searchQuery.value = ''
    searchResults.value = []
    isSearchActive.value = false
    isSearching.value = false
    searchError.value = null
  }

  return {
    searchQuery,
    searchResults,
    isSearchActive,
    isSearching,
    searchError,
    search,
    aiSearch,
    clear,
  }
}
