# 抖音收藏批量导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在抖音收藏页点击插件图标时打开右侧侧边栏，抓取收藏作品并批量保存链接到 Get 笔记，同时用“连续成功段 + 已导入 URL 集合”避免重复导入。

**Architecture:** 入口分流放在 `entrypoints/background.ts`，把“普通 popup 剪藏”和“抖音收藏侧边栏导入”拆开。抖音相关逻辑收敛到 `src/douyin/*` 和 `src/storage/douyinImports.ts`，先用可测试的纯函数固定 URL 判断、去重与断点推进，再由新侧边栏组件串起抓取、展示和保存流程。Get 笔记接口统一收敛为只传 URL，不传标题。

**Tech Stack:** WXT, Vue 3, TypeScript, WebExtension APIs (`browser.action`, `browser.sidePanel`, `browser.scripting`, `browser.storage.local`), Vitest

---

## File Structure

- Create: `src/douyin/collect.ts`
  - 抖音收藏页判断、URL 归一化、抓取结果映射
- Create: `src/douyin/importFlow.ts`
  - 侧边栏列表初始化、连续成功段计算等纯逻辑
- Create: `src/storage/douyinImports.ts`
  - 断点缓存的读写封装
- Create: `entrypoints/douyin-sidepanel/App.vue`
  - 抖音收藏批量导入侧边栏 UI
- Modify: `entrypoints/background.ts`
  - 点击插件图标分流：抖音页开侧边栏，其他页保持 popup
- Modify: `src/getnote/types.ts`
  - 删除 `title` 字段
- Modify: `src/getnote/api.ts`
  - 请求体不再发送 `title`
- Modify: `entrypoints/popup/App.vue`
  - 单篇保存到 Get 笔记时只传 `linkUrl`
- Modify: `wxt.config.ts`
  - 侧边栏能力所需 manifest 配置
- Create: `tests/douyin/collect.test.ts`
- Create: `tests/douyin/importFlow.test.ts`
- Create: `tests/storage/douyinImports.test.ts`
- Modify: `tests/getnote/api.test.ts`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

## Task 1: 收敛 Get 笔记接口为“只传 URL”

**Files:**
- Modify: `src/getnote/types.ts`
- Modify: `src/getnote/api.ts`
- Modify: `entrypoints/popup/App.vue`
- Modify: `tests/getnote/api.test.ts`

- [ ] **Step 1: 写出 Get 笔记请求体不含标题的失败测试**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { saveLinkNote } from '../../src/getnote/api'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

describe('saveLinkNote', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn(),
    })
  })

  it('sends only link fields to Get note API', async () => {
    await saveLinkNote({
      clientId: 'cid',
      authToken: 'token',
      linkUrl: 'https://example.com/post',
      tags: ['a', 'b'],
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body as string)).toEqual({
      note_type: 'link',
      link_url: 'https://example.com/post',
      tags: ['a', 'b'],
    })
    expect(JSON.parse(init.body as string)).not.toHaveProperty('title')
  })
})
```

- [ ] **Step 2: 运行单测确认失败**

Run: `pnpm vitest run tests/getnote/api.test.ts`

Expected: 断言失败，现有请求体里仍包含 `title`

- [ ] **Step 3: 最小实现，移除 title 类型与请求体字段**

`src/getnote/types.ts`

```ts
export interface SaveLinkNoteParams {
  clientId: string
  authToken: string
  linkUrl: string
  tags?: string[]
}
```

`src/getnote/api.ts`

```ts
import type { SaveLinkNoteParams } from './types'

const GET_NOTE_SAVE_URL = 'https://openapi.biji.com/open/api/v1/resource/note/save'

export async function saveLinkNote(params: SaveLinkNoteParams): Promise<void> {
  const response = await fetch(GET_NOTE_SAVE_URL, {
    method: 'POST',
    headers: {
      'X-Client-ID': params.clientId.trim(),
      'Authorization': params.authToken.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      note_type: 'link',
      link_url: params.linkUrl,
      tags: params.tags,
    }),
  })

  if (response.ok) return

  const text = await response.text()
  throw new Error(`Get 笔记保存失败 ${response.status}: ${text}`)
}
```

- [ ] **Step 4: 调整 popup 的单篇调用，不再传 title**

在 `entrypoints/popup/App.vue` 把：

```ts
await saveLinkNote({
  clientId,
  authToken,
  title: currentDoc.title,
  linkUrl: currentDoc.source,
  tags: currentDoc.tags,
})
```

改成：

```ts
await saveLinkNote({
  clientId,
  authToken,
  linkUrl: currentDoc.source,
  tags: currentDoc.tags,
})
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/getnote/api.test.ts`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/getnote/types.ts src/getnote/api.ts entrypoints/popup/App.vue tests/getnote/api.test.ts
git commit -m "refactor: send only link url to get note"
```

## Task 2: 固定抖音页面判断与导入纯逻辑

**Files:**
- Create: `src/douyin/collect.ts`
- Create: `src/douyin/importFlow.ts`
- Create: `tests/douyin/collect.test.ts`
- Create: `tests/douyin/importFlow.test.ts`

- [ ] **Step 1: 先写 URL 判断和归一化的失败测试**

`tests/douyin/collect.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { isDouyinFavoritesPage, normalizeDouyinWorkUrl } from '../../src/douyin/collect'

describe('isDouyinFavoritesPage', () => {
  it('matches douyin favorite_collection pages', () => {
    expect(
      isDouyinFavoritesPage('https://www.douyin.com/user/self?showTab=favorite_collection')
    ).toBe(true)
  })

  it('rejects non favorite pages', () => {
    expect(
      isDouyinFavoritesPage('https://www.douyin.com/user/self?showTab=post')
    ).toBe(false)
  })
})

describe('normalizeDouyinWorkUrl', () => {
  it('makes relative urls absolute and strips hash', () => {
    expect(
      normalizeDouyinWorkUrl('/video/123?foo=1#abc', 'https://www.douyin.com/user/self?showTab=favorite_collection')
    ).toBe('https://www.douyin.com/video/123?foo=1')
  })
})
```

- [ ] **Step 2: 再写连续成功段推进与跳过逻辑的失败测试**

`tests/douyin/importFlow.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildFavoriteItems, finalizePrefixProgress } from '../../src/douyin/importFlow'

describe('buildFavoriteItems', () => {
  it('marks imported urls as skipped and unselected', () => {
    const items = buildFavoriteItems(
      [
        { url: 'https://www.douyin.com/video/1', title: 'a', cover: '', likesText: '' },
        { url: 'https://www.douyin.com/video/2', title: 'b', cover: '', likesText: '' },
      ],
      new Set(['https://www.douyin.com/video/1'])
    )

    expect(items[0]).toMatchObject({ status: 'skipped', selected: false })
    expect(items[1]).toMatchObject({ status: 'idle', selected: true })
  })
})

describe('finalizePrefixProgress', () => {
  it('advances only the contiguous success prefix', () => {
    const result = finalizePrefixProgress(
      ['https://www.douyin.com/video/1', 'https://www.douyin.com/video/2'],
      ['https://www.douyin.com/video/1']
    )

    expect(result.lastImportedUrl).toBe('https://www.douyin.com/video/1')
    expect(result.importedUrlSet).toEqual(['https://www.douyin.com/video/1'])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/douyin/collect.test.ts tests/douyin/importFlow.test.ts`

Expected: FAIL，模块不存在

- [ ] **Step 4: 最小实现 `src/douyin/collect.ts`**

```ts
export interface DouyinFavoriteItemRaw {
  url: string
  title: string
  cover: string
  likesText: string
}

export function isDouyinFavoritesPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostOk = parsed.hostname === 'douyin.com' || parsed.hostname === 'www.douyin.com'
    return hostOk && parsed.searchParams.get('showTab') === 'favorite_collection'
  } catch {
    return false
  }
}

export function normalizeDouyinWorkUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl)
  parsed.hash = ''
  return parsed.toString()
}
```

- [ ] **Step 5: 最小实现 `src/douyin/importFlow.ts`**

```ts
import type { DouyinFavoriteItemRaw } from './collect'

export type DouyinFavoriteItemStatus = 'idle' | 'skipped' | 'saving' | 'success' | 'error'

export interface DouyinFavoriteItemView extends DouyinFavoriteItemRaw {
  normalizedUrl: string
  selected: boolean
  status: DouyinFavoriteItemStatus
  errorMessage?: string
}

export function buildFavoriteItems(
  raws: DouyinFavoriteItemRaw[],
  importedUrlSet: Set<string>
): DouyinFavoriteItemView[] {
  return raws.map((raw) => {
    const imported = importedUrlSet.has(raw.url)
    return {
      ...raw,
      normalizedUrl: raw.url,
      selected: !imported,
      status: imported ? 'skipped' : 'idle',
    }
  })
}

export function finalizePrefixProgress(
  importedUrlSet: string[],
  successPrefix: string[]
): { importedUrlSet: string[]; lastImportedUrl: string } {
  const next = new Set(importedUrlSet)
  for (const url of successPrefix) next.add(url)
  return {
    importedUrlSet: Array.from(next),
    lastImportedUrl: successPrefix[successPrefix.length - 1] ?? '',
  }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm vitest run tests/douyin/collect.test.ts tests/douyin/importFlow.test.ts`

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/douyin/collect.ts src/douyin/importFlow.ts tests/douyin/collect.test.ts tests/douyin/importFlow.test.ts
git commit -m "feat: add douyin import helpers"
```

## Task 3: 增加抖音导入缓存存储

**Files:**
- Create: `src/storage/douyinImports.ts`
- Create: `tests/storage/douyinImports.test.ts`

- [ ] **Step 1: 写出默认值与覆盖写入的失败测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDouyinImportState, saveDouyinImportState } from '../../src/storage/douyinImports'

const storageGet = vi.fn()
const storageSet = vi.fn()

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
      },
    },
  },
}))

describe('douyin import storage', () => {
  beforeEach(() => {
    storageGet.mockReset()
    storageSet.mockReset()
  })

  it('returns defaults when nothing is stored', async () => {
    storageGet.mockResolvedValue({})
    await expect(getDouyinImportState()).resolves.toEqual({
      lastImportedUrl: '',
      importedUrlSet: [],
      lastImportAt: undefined,
    })
  })

  it('persists provided state', async () => {
    await saveDouyinImportState({
      lastImportedUrl: 'https://www.douyin.com/video/1',
      importedUrlSet: ['https://www.douyin.com/video/1'],
      lastImportAt: '2026-05-22T10:00:00.000Z',
    })

    expect(storageSet).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/storage/douyinImports.test.ts`

Expected: FAIL，模块不存在

- [ ] **Step 3: 最小实现存储模块**

```ts
import { browser } from 'wxt/browser'

export interface DouyinImportState {
  lastImportedUrl: string
  importedUrlSet: string[]
  lastImportAt?: string
}

const STORAGE_KEY = 'douyin-import-state'

const DEFAULT_STATE: DouyinImportState = {
  lastImportedUrl: '',
  importedUrlSet: [],
}

export async function getDouyinImportState(): Promise<DouyinImportState> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<DouyinImportState>
  return {
    ...DEFAULT_STATE,
    ...stored,
    importedUrlSet: Array.isArray(stored.importedUrlSet) ? stored.importedUrlSet : [],
  }
}

export async function saveDouyinImportState(state: DouyinImportState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/storage/douyinImports.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/storage/douyinImports.ts tests/storage/douyinImports.test.ts
git commit -m "feat: add douyin import storage"
```

## Task 4: 接入后台入口分流与侧边栏清单抓取

**Files:**
- Modify: `wxt.config.ts`
- Modify: `entrypoints/background.ts`
- Create: `entrypoints/douyin-sidepanel/App.vue`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 查看当前 manifest 配置并写出需要的侧边栏权限改动**

在 `wxt.config.ts` 的 manifest 配置里加入：

```ts
permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'sidePanel']
```

以及：

```ts
side_panel: {
  default_path: 'douyin-sidepanel.html',
}
```

- [ ] **Step 2: 修改后台点击图标逻辑，按当前 tab 分流**

在 `entrypoints/background.ts` 中引入 `isDouyinFavoritesPage`，并加入类似逻辑：

```ts
import { browser } from 'wxt/browser'
import { isDouyinFavoritesPage } from '../src/douyin/collect'

browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return

  if (!isDouyinFavoritesPage(tab.url)) {
    browser.action.openPopup()
    return
  }

  const sidePanel = browser.sidePanel as typeof browser.sidePanel | undefined
  if (!sidePanel) return

  await sidePanel.setOptions({
    tabId: tab.id,
    enabled: true,
    path: `/douyin-sidepanel.html?tabId=${tab.id}`,
  })

  await sidePanel.open({ tabId: tab.id })
})
```

- [ ] **Step 3: 新建最小侧边栏页面，只做页面校验和抓取结果展示**

`entrypoints/douyin-sidepanel/App.vue`

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { browser } from 'wxt/browser'
import { getDouyinImportState } from '../../src/storage/douyinImports'
import { isDouyinFavoritesPage } from '../../src/douyin/collect'

const state = ref<'checking' | 'ready' | 'invalid-page' | 'load-error'>('checking')
const pageUrl = ref('')
const importedCount = ref(0)

onMounted(async () => {
  try {
    const tabIdParam = new URLSearchParams(location.search).get('tabId')
    const tabId = Number(tabIdParam)
    const tab = await browser.tabs.get(tabId)

    if (!tab.url || !isDouyinFavoritesPage(tab.url)) {
      state.value = 'invalid-page'
      return
    }

    pageUrl.value = tab.url
    const stored = await getDouyinImportState()
    importedCount.value = stored.importedUrlSet.length
    state.value = 'ready'
  } catch {
    state.value = 'load-error'
  }
})
</script>
```

- [ ] **Step 4: 文档同步，更新 AGENTS/CLAUDE 里的入口文件与存储说明**

把两份文档中的对应条目扩展为：

```md
- `entrypoints/douyin-sidepanel/App.vue` — 抖音收藏批量导入侧边栏，当前页面为抖音收藏页时由插件图标直接打开
- `src/storage/douyinImports.ts` — 抖音收藏批量导入断点缓存（连续成功段最后 URL、已导入 URL 集合）
```

- [ ] **Step 5: 构建一次，确保新入口被 WXT 识别**

Run: `pnpm build`

Expected: build 成功，`.output/chrome-mv3/` 下出现侧边栏页面产物

- [ ] **Step 6: 提交**

```bash
git add wxt.config.ts entrypoints/background.ts entrypoints/douyin-sidepanel/App.vue AGENTS.md CLAUDE.md
git commit -m "feat: route douyin favorite pages to side panel"
```

## Task 5: 完成侧边栏抓取、勾选、刷新与批量保存

**Files:**
- Modify: `src/douyin/collect.ts`
- Modify: `src/douyin/importFlow.ts`
- Modify: `entrypoints/douyin-sidepanel/App.vue`

- [ ] **Step 1: 在 `collect.ts` 增加页面内抓取函数**

```ts
export function collectFavoriteItemsFromPage(): DouyinFavoriteItemRaw[] {
  const anchors = Array.from(document.querySelectorAll('a[href]'))
  const seen = new Set<string>()
  const items: DouyinFavoriteItemRaw[] = []

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || ''
    if (!href.includes('/video/') && !href.includes('/detail/') && !href.includes('modal_id=')) continue

    const url = new URL(href, location.href).toString()
    if (seen.has(url)) continue
    seen.add(url)

    items.push({
      url,
      title: (anchor.textContent || '').trim(),
      cover: (anchor.querySelector('img')?.getAttribute('src') || '').trim(),
      likesText: '',
    })
  }

  return items
}
```

- [ ] **Step 2: 在侧边栏中接上注入抓取与列表初始化**

核心逻辑应类似：

```ts
const [{ result }] = await browser.scripting.executeScript({
  target: { tabId },
  func: collectFavoriteItemsFromPage,
})

const stored = await getDouyinImportState()
const imported = new Set(stored.importedUrlSet)
items.value = buildFavoriteItems(
  (Array.isArray(result) ? result : []).map((item) => ({
    ...item,
    url: normalizeDouyinWorkUrl(item.url, tab.url!),
  })),
  imported
)
```

- [ ] **Step 3: 实现“刷新”按钮**

```ts
async function handleRefresh() {
  state.value = 'checking'
  loadItemsError.value = null
  await loadItems()
}
```

- [ ] **Step 4: 实现串行保存与连续成功段断点写回**

```ts
async function handleSaveAll() {
  const successPrefix: string[] = []

  for (const item of items.value) {
    if (!item.selected || item.status !== 'idle') continue

    item.status = 'saving'

    try {
      await saveLinkNote({
        clientId: settings.getNote.clientId,
        authToken: settings.getNote.authToken,
        linkUrl: item.normalizedUrl,
      })
      item.status = 'success'
      successPrefix.push(item.normalizedUrl)
    } catch (error) {
      item.status = 'error'
      item.errorMessage = error instanceof Error ? error.message : String(error)
      break
    }
  }

  if (successPrefix.length > 0) {
    const current = await getDouyinImportState()
    const next = finalizePrefixProgress(current.importedUrlSet, successPrefix)
    await saveDouyinImportState({
      ...next,
      lastImportAt: new Date().toISOString(),
    })
  }
}
```

- [ ] **Step 5: 补全模板，显示勾选、刷新、逐条状态和错误**

模板至少包含：

```vue
<button @click="handleRefresh">刷新</button>
<button :disabled="isSaving" @click="handleSaveAll">全部保存</button>

<li v-for="item in items" :key="item.normalizedUrl">
  <input v-model="item.selected" type="checkbox" :disabled="item.status === 'saving'" />
  <div>{{ item.title || item.normalizedUrl }}</div>
  <div>{{ item.normalizedUrl }}</div>
  <div>{{ item.likesText }}</div>
  <div>{{ item.status }}</div>
  <div v-if="item.errorMessage">{{ item.errorMessage }}</div>
</li>
```

- [ ] **Step 6: 运行单测和构建**

Run:

```bash
pnpm vitest run tests/douyin/collect.test.ts tests/douyin/importFlow.test.ts tests/storage/douyinImports.test.ts tests/getnote/api.test.ts
pnpm build
```

Expected:
- 所有相关 Vitest 用例 PASS
- build 成功

- [ ] **Step 7: 手动验证关键流程**

1. 打开抖音收藏页，点击插件图标，应直接打开右侧侧边栏
2. 点击刷新，应出现收藏作品列表
3. 取消勾选一条，再点全部保存，被取消项不应提交
4. 模拟一条失败时，后续项不再继续提交
5. 再次刷新，成功前缀应变成 `skipped`
6. 打开非抖音页，点击插件图标，应仍显示原 popup

- [ ] **Step 8: 提交**

```bash
git add src/douyin/collect.ts src/douyin/importFlow.ts entrypoints/douyin-sidepanel/App.vue
git commit -m "feat: add douyin favorites side panel importer"
```

## Task 6: 收尾校验与文档同步

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 核对 AGENTS/CLAUDE 是否已完整反映新行为**

文档中需要覆盖：

- 新入口 `entrypoints/douyin-sidepanel/App.vue`
- 新存储 `src/storage/douyinImports.ts`
- 新行为：抖音收藏页点击插件图标直接打开右侧侧边栏
- 新行为：Get 笔记保存链接只传 URL，不传标题

- [ ] **Step 2: 运行最终全量相关验证**

Run:

```bash
pnpm vitest run tests/douyin/collect.test.ts tests/douyin/importFlow.test.ts tests/storage/douyinImports.test.ts tests/getnote/api.test.ts
pnpm build
```

Expected:
- 所有新增/修改测试 PASS
- `.output/chrome-mv3/` 为最新构建产物

- [ ] **Step 3: 提交**

```bash
git add AGENTS.md CLAUDE.md .output/chrome-mv3
git commit -m "docs: sync douyin import and get note behavior"
```

## Self-Review

- Spec coverage:
  - 入口分流：Task 4
  - 侧边栏抓取、勾选、刷新、逐条状态：Task 5
  - 连续成功段断点：Task 2, Task 3, Task 5
  - Get 笔记只传 URL：Task 1
  - 文档同步：Task 4, Task 6
- Placeholder scan:
  - 无 `TODO` / `TBD`
  - 每个实现步骤都给了具体代码或命令
- Type consistency:
  - `DouyinImportState`, `DouyinFavoriteItemRaw`, `DouyinFavoriteItemView`, `finalizePrefixProgress`, `saveLinkNote` 名称前后一致
