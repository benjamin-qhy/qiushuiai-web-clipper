# 书签 AI 整理流程重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将书签 AI 整理流程替换为：自动开关标签页读取页面 meta、基于完整文件夹树 AI 分类、第二次 AI 调用生成书签标题，实时展示处理进度。

**Architecture:** 新增 `src/bookmark/meta.ts`（标签页生命周期管理）和 `src/bookmark/classify.ts`（文件夹树处理 + AI 调用），`useBookmarkProcess.ts` 负责串行编排。`AIProvider` 接口扩展支持可选 system prompt。

**Tech Stack:** WXT + Vue 3 + TypeScript, browser.tabs / browser.scripting, OpenAI-compatible AI API

---

### Task 1: 添加 `tabs` 权限并扩展 `AIProvider` 接口

**Files:**
- Modify: `wxt.config.ts`
- Modify: `src/ai/types.ts`
- Modify: `src/ai/aliyun.ts`

- [ ] **Step 1: 在 `wxt.config.ts` 的 permissions 中加入 `tabs`**

```ts
permissions: ['storage', 'activeTab', 'scripting', 'bookmarks', 'alarms', 'tabs'],
```

- [ ] **Step 2: 更新 `src/ai/types.ts`，`complete` 支持可选 system prompt，删除不再使用的 `AIResult`**

将文件全部内容替换为：

```ts
export interface AIProvider {
  complete(userPrompt: string, systemPrompt?: string): Promise<string>
  testConnection(): Promise<void>
}
```

- [ ] **Step 3: 更新 `src/ai/aliyun.ts`，支持 systemPrompt 参数**

将 `complete` 方法替换为：

```ts
async complete(userPrompt: string, systemPrompt?: string): Promise<string> {
  const messages: { role: string; content: string }[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: userPrompt })

  const res = await fetch(this.chatCompletionsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    },
    body: JSON.stringify({
      model: this.config.model,
      messages,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? ''
}
```

- [ ] **Step 4: 运行编译，确保无报错**

```bash
pnpm compile
```

期望：无输出（零错误）

- [ ] **Step 5: 提交**

```bash
git add wxt.config.ts src/ai/types.ts src/ai/aliyun.ts
git commit -m "feat: add tabs permission and extend AIProvider with systemPrompt"
```

---

### Task 2: 添加 `bookmarkSystemPrompt` 设置项及 options 页 UI

**Files:**
- Modify: `src/storage/settings.ts`
- Modify: `entrypoints/options/App.vue`

- [ ] **Step 1: 在 `src/storage/settings.ts` 的 `Settings` 接口末尾添加字段**

在 `bookmarkSubDir: string` 后添加：

```ts
bookmarkSystemPrompt: string
```

- [ ] **Step 2: 在 `DEFAULT_SETTINGS` 末尾添加默认值**

在 `bookmarkSubDir: 'Bookmarks',` 后添加：

```ts
bookmarkSystemPrompt: '你是一个书签整理助手。根据网页的标题、关键词、描述和 URL，从给定的文件夹结构中选出最合适的目录路径。',
```

- [ ] **Step 3: 在 `getSettings` 的 return 中合并该字段**

当前 return 块：
```ts
return {
  ...DEFAULT_SETTINGS,
  ...stored,
  aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS, ...stored.aliyunOSS },
  aiConfig: { ...DEFAULT_SETTINGS.aiConfig, ...stored.aiConfig },
}
```

替换为：
```ts
return {
  ...DEFAULT_SETTINGS,
  ...stored,
  aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS, ...stored.aliyunOSS },
  aiConfig: { ...DEFAULT_SETTINGS.aiConfig, ...stored.aiConfig },
  bookmarkSystemPrompt: typeof stored.bookmarkSystemPrompt === 'string'
    ? stored.bookmarkSystemPrompt
    : DEFAULT_SETTINGS.bookmarkSystemPrompt,
}
```

- [ ] **Step 4: 在 `entrypoints/options/App.vue` 中，AI 模型字段的 `</div>` 之后（约 432 行），测试模型按钮之前，添加系统提示词字段**

找到：
```html
        <div class="field">
          <label class="field-label" for="ai-model">AI 模型名称</label>
          <input id="ai-model" v-model="settings.aiConfig.model" class="field-input" placeholder="qwen-long" />
        </div>
        <div class="field test-row">
```

替换为：
```html
        <div class="field">
          <label class="field-label" for="ai-model">AI 模型名称</label>
          <input id="ai-model" v-model="settings.aiConfig.model" class="field-input" placeholder="qwen-long" />
        </div>
        <div class="field">
          <label class="field-label" for="ai-system-prompt">系统提示词</label>
          <textarea
            id="ai-system-prompt"
            v-model="settings.bookmarkSystemPrompt"
            class="field-input field-textarea"
            rows="4"
          />
          <p class="field-hint">文件夹结构和输出格式由系统自动附加，此处可追加自定义指令。</p>
        </div>
        <div class="field test-row">
```

- [ ] **Step 5: 在 `<style scoped>` 末尾（`.field-inline-error {}` 后，`</style>` 前）添加样式**

```css
.field-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}
```

- [ ] **Step 6: 编译验证**

```bash
pnpm compile
```

期望：零错误

- [ ] **Step 7: 提交**

```bash
git add src/storage/settings.ts entrypoints/options/App.vue
git commit -m "feat: add bookmarkSystemPrompt setting and options UI textarea"
```

---

### Task 3: 创建 `src/bookmark/meta.ts`

**Files:**
- Create: `src/bookmark/meta.ts`
- Create: `tests/bookmark/meta.test.ts`

- [ ] **Step 1: 先写失败测试**

新建 `tests/bookmark/meta.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildMetaFromDom } from '../../src/bookmark/meta'

describe('buildMetaFromDom', () => {
  it('returns title, keywords, description', () => {
    const result = buildMetaFromDom('React 文档', 'react,hooks', '一个 JS 框架')
    expect(result).toEqual({
      title: 'React 文档',
      keywords: 'react,hooks',
      description: '一个 JS 框架',
    })
  })

  it('allows empty strings for missing meta', () => {
    const result = buildMetaFromDom('标题', '', '')
    expect(result.keywords).toBe('')
    expect(result.description).toBe('')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run tests/bookmark/meta.test.ts
```

期望：FAIL，`buildMetaFromDom is not a function`

- [ ] **Step 3: 创建 `src/bookmark/meta.ts`**

```ts
import { browser } from 'wxt/browser'

export interface PageMeta {
  title: string
  keywords: string
  description: string
}

export function buildMetaFromDom(title: string, keywords: string, description: string): PageMeta {
  return { title, keywords, description }
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener)
      reject(new Error('页面加载超时'))
    }, timeoutMs)

    function listener(id: number, changeInfo: { status?: string }) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer)
        browser.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    browser.tabs.onUpdated.addListener(listener)
  })
}

export async function fetchPageMeta(url: string, timeoutMs = 10000): Promise<PageMeta> {
  const tab = await browser.tabs.create({ url, active: false })
  const tabId = tab.id!
  try {
    await waitForTabComplete(tabId, timeoutMs)
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? ''
        return {
          title: document.title,
          keywords: getMeta('keywords'),
          description: getMeta('description'),
        }
      },
    })
    const raw = results[0]?.result as { title: string; keywords: string; description: string } | undefined
    return raw ?? { title: '', keywords: '', description: '' }
  } finally {
    await browser.tabs.remove(tabId)
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run tests/bookmark/meta.test.ts
```

期望：PASS

- [ ] **Step 5: 编译验证**

```bash
pnpm compile
```

期望：零错误

- [ ] **Step 6: 提交**

```bash
git add src/bookmark/meta.ts tests/bookmark/meta.test.ts
git commit -m "feat: add bookmark meta extraction via background tab"
```

---

### Task 4: 创建 `src/bookmark/classify.ts`

**Files:**
- Create: `src/bookmark/classify.ts`
- Create: `tests/bookmark/classify.test.ts`

- [ ] **Step 1: 先写失败测试**

新建 `tests/bookmark/classify.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  buildFolderPaths,
  buildFolderPathMap,
  buildClassifyPrompt,
  buildTitlePrompt,
  parseFolder,
  parseTitle,
} from '../../src/bookmark/classify'
import type { PageMeta } from '../../src/bookmark/meta'

const makeNode = (id: string, title: string, parentId: string, children: object[] = []) => ({
  id, title, parentId, index: 0, dateAdded: 0, children,
})

const sampleTree = [
  makeNode('1', '书签栏', '0', [
    makeNode('2', '工作', '1', [
      makeNode('3', '前端', '2', []),
    ]),
    makeNode('4', '学习', '1', []),
    { id: '5', title: 'React 官网', url: 'https://react.dev', parentId: '1', index: 2, dateAdded: 0 },
  ]),
]

describe('buildFolderPaths', () => {
  it('returns flat list of folder paths', () => {
    const paths = buildFolderPaths(sampleTree)
    expect(paths).toContain('书签栏')
    expect(paths).toContain('书签栏/工作')
    expect(paths).toContain('书签栏/工作/前端')
    expect(paths).toContain('书签栏/学习')
  })

  it('skips bookmark nodes (nodes with url)', () => {
    const paths = buildFolderPaths(sampleTree)
    expect(paths).not.toContain('书签栏/React 官网')
  })
})

describe('buildFolderPathMap', () => {
  it('maps path to folder id', () => {
    const map = buildFolderPathMap(sampleTree)
    expect(map.get('书签栏/工作/前端')).toBe('3')
    expect(map.get('书签栏/学习')).toBe('4')
  })

  it('does not include bookmark nodes', () => {
    const map = buildFolderPathMap(sampleTree)
    expect(map.has('书签栏/React 官网')).toBe(false)
  })
})

describe('buildClassifyPrompt', () => {
  const meta: PageMeta = { title: 'React', keywords: 'frontend,hooks', description: 'A JS library' }

  it('puts user system prompt and folder list in system part', () => {
    const { system } = buildClassifyPrompt(meta, 'https://react.dev', ['书签栏/前端'], '自定义指令')
    expect(system).toContain('自定义指令')
    expect(system).toContain('书签栏/前端')
    expect(system).toContain('{"folder":')
  })

  it('puts meta info in user part', () => {
    const { user } = buildClassifyPrompt(meta, 'https://react.dev', [], '指令')
    expect(user).toContain('React')
    expect(user).toContain('https://react.dev')
    expect(user).toContain('frontend,hooks')
  })
})

describe('buildTitlePrompt', () => {
  it('includes meta info and output format constraint', () => {
    const meta: PageMeta = { title: 'GitHub', keywords: '', description: 'Code hosting' }
    const prompt = buildTitlePrompt(meta, 'https://github.com')
    expect(prompt).toContain('GitHub')
    expect(prompt).toContain('https://github.com')
    expect(prompt).toContain('{"title":')
  })
})

describe('parseFolder', () => {
  it('parses valid JSON folder path', () => {
    expect(parseFolder('{"folder":"书签栏/工作/前端"}')).toBe('书签栏/工作/前端')
  })

  it('returns 其他 on invalid JSON', () => {
    expect(parseFolder('not json')).toBe('其他')
  })

  it('returns 其他 when folder field is empty string', () => {
    expect(parseFolder('{"folder":""}')).toBe('其他')
  })

  it('returns 其他 when folder field is missing', () => {
    expect(parseFolder('{}')).toBe('其他')
  })
})

describe('parseTitle', () => {
  it('parses valid JSON title', () => {
    expect(parseTitle('{"title":"GitHub - 代码托管平台"}', '原标题')).toBe('GitHub - 代码托管平台')
  })

  it('returns fallback on invalid JSON', () => {
    expect(parseTitle('bad json', '原标题')).toBe('原标题')
  })

  it('returns fallback when title field is empty', () => {
    expect(parseTitle('{"title":""}', '原标题')).toBe('原标题')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run tests/bookmark/classify.test.ts
```

期望：FAIL，`buildFolderPaths is not a function`

- [ ] **Step 3: 创建 `src/bookmark/classify.ts`**

```ts
import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import type { AIProvider } from '../ai/types'
import type { PageMeta } from './meta'

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode

export function buildFolderPaths(nodes: BookmarkNode[], prefix = ''): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.url) continue
    const path = prefix ? `${prefix}/${node.title}` : node.title
    paths.push(path)
    if (node.children?.length) paths.push(...buildFolderPaths(node.children, path))
  }
  return paths
}

export function buildFolderPathMap(nodes: BookmarkNode[], prefix = ''): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of nodes) {
    if (node.url) continue
    const path = prefix ? `${prefix}/${node.title}` : node.title
    map.set(path, node.id)
    if (node.children?.length) {
      for (const [p, id] of buildFolderPathMap(node.children, path)) map.set(p, id)
    }
  }
  return map
}

export function buildClassifyPrompt(
  meta: PageMeta,
  url: string,
  folderPaths: string[],
  userSystemPrompt: string,
): { system: string; user: string } {
  const system = `${userSystemPrompt}

可用的书签文件夹：
${folderPaths.join('\n')}

输出格式（仅输出 JSON，不要其他内容）：
{"folder":"文件夹路径"}`

  const user = `标题：${meta.title}
URL：${url}
关键词：${meta.keywords}
描述：${meta.description}`

  return { system, user }
}

export function buildTitlePrompt(meta: PageMeta, url: string): string {
  return `根据以下网页信息，生成一个简洁的书签标题，格式为「网站名 - 简短描述」，15字以内，中文。

标题：${meta.title}
URL：${url}
关键词：${meta.keywords}
描述：${meta.description}

输出格式（仅输出 JSON，不要其他内容）：
{"title":"网站名 - 简短描述"}`
}

export function parseFolder(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const folder = typeof parsed.folder === 'string' ? parsed.folder.trim() : ''
    return folder || '其他'
  } catch {
    return '其他'
  }
}

export function parseTitle(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    return title || fallback
  } catch {
    return fallback
  }
}

async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const children = await browser.bookmarks.getChildren(parentId)
  const existing = children.find(c => !c.url && c.title === name)
  if (existing) return existing.id
  const created = await browser.bookmarks.create({ parentId, title: name })
  return created.id
}

export async function classifyAndMove(
  bookmarkId: string,
  meta: PageMeta,
  url: string,
  inboxParentId: string,
  userSystemPrompt: string,
  aiProvider: AIProvider,
): Promise<{ folderPath: string }> {
  const tree = await browser.bookmarks.getTree()
  const rootChildren = tree[0]?.children ?? []
  const folderPaths = buildFolderPaths(rootChildren)
  const pathMap = buildFolderPathMap(rootChildren)

  const { system, user } = buildClassifyPrompt(meta, url, folderPaths, userSystemPrompt)
  const raw = await aiProvider.complete(user, system)
  const folderPath = parseFolder(raw)

  let targetFolderId = pathMap.get(folderPath)
  if (!targetFolderId) {
    targetFolderId = await findOrCreateFolder(inboxParentId, '其他')
  }

  await browser.bookmarks.move(bookmarkId, { parentId: targetFolderId })
  return { folderPath: folderPath === '其他' || !pathMap.has(folderPath) ? '其他' : folderPath }
}

export async function renameBookmark(
  bookmarkId: string,
  meta: PageMeta,
  url: string,
  originalTitle: string,
  aiProvider: AIProvider,
): Promise<string> {
  const prompt = buildTitlePrompt(meta, url)
  const raw = await aiProvider.complete(prompt)
  const newTitle = parseTitle(raw, originalTitle)
  await browser.bookmarks.update(bookmarkId, { title: newTitle })
  return newTitle
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run tests/bookmark/classify.test.ts
```

期望：PASS（所有测试）

- [ ] **Step 5: 编译验证**

```bash
pnpm compile
```

期望：零错误

- [ ] **Step 6: 提交**

```bash
git add src/bookmark/classify.ts tests/bookmark/classify.test.ts
git commit -m "feat: add bookmark classify and title generation module"
```

---

### Task 5: 替换 `process.ts` 并重写 `useBookmarkProcess.ts`

**Files:**
- Delete: `src/bookmark/process.ts`
- Delete: `tests/bookmark/process.test.ts`
- Rewrite: `src/composables/useBookmarkProcess.ts`

- [ ] **Step 1: 删除旧文件**

```bash
rm src/bookmark/process.ts tests/bookmark/process.test.ts
```

- [ ] **Step 2: 完整替换 `src/composables/useBookmarkProcess.ts`**

```ts
import { ref } from 'vue'
import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import { getSettings } from '../storage/settings'
import { createAIProvider } from '../ai/index'
import { fetchPageMeta } from '../bookmark/meta'
import type { PageMeta } from '../bookmark/meta'
import { classifyAndMove, renameBookmark } from '../bookmark/classify'

type BookmarkNode = Browser.bookmarks.BookmarkTreeNode

export interface LogEntry {
  time: string
  title: string
  url: string
  folder: string
  status: 'ok' | 'warning' | 'error'
  warning?: string
  error?: string
}

export interface CurrentItem {
  index: number
  total: number
  url: string
  phase: string
}

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function useBookmarkProcess() {
  const state = ref<'idle' | 'processing' | 'done' | 'error'>('idle')
  const log = ref<LogEntry[]>([])
  const progress = ref({ done: 0, total: 0 })
  const currentItem = ref<CurrentItem | null>(null)

  async function start(): Promise<void> {
    if (state.value === 'processing') return

    state.value = 'processing'
    log.value = []
    progress.value = { done: 0, total: 0 }
    currentItem.value = null

    try {
      const settings = await getSettings()
      const inboxName = settings.bookmarkInboxFolder

      const results = await browser.bookmarks.search({ title: inboxName })
      const inboxFolder = results.find((r: BookmarkNode) => !r.url)
      if (!inboxFolder || !inboxFolder.parentId) {
        state.value = 'error'
        log.value.push({
          time: nowTime(),
          title: '未找到收件箱文件夹',
          url: '',
          folder: '',
          status: 'error',
          error: `未找到「${inboxName}」文件夹，请在书签中创建一个`,
        })
        return
      }

      const children = await browser.bookmarks.getChildren(inboxFolder.id)
      const bookmarks = children.filter((c: BookmarkNode) => !!c.url)
      progress.value.total = bookmarks.length

      if (bookmarks.length === 0) {
        state.value = 'done'
        return
      }

      const aiProvider = createAIProvider(settings.aiConfig)

      for (let i = 0; i < bookmarks.length; i++) {
        const bm = bookmarks[i]
        if (!bm.url) continue

        currentItem.value = { index: i + 1, total: bookmarks.length, url: bm.url, phase: '正在获取页面信息…' }

        let meta: PageMeta
        let metaWarning: string | undefined

        try {
          meta = await fetchPageMeta(bm.url)
          if (!meta.title) meta = { title: bm.title ?? '', keywords: '', description: '' }
        } catch {
          meta = { title: bm.title ?? '', keywords: '', description: '' }
          metaWarning = '页面获取失败，已用书签标题兜底'
        }

        try {
          currentItem.value = { ...currentItem.value, phase: 'AI 分类中…' }
          const { folderPath } = await classifyAndMove(
            bm.id,
            meta,
            bm.url,
            inboxFolder.parentId!,
            settings.bookmarkSystemPrompt,
            aiProvider,
          )

          currentItem.value = { ...currentItem.value, phase: 'AI 生成标题…' }
          const newTitle = await renameBookmark(bm.id, meta, bm.url, bm.title ?? '', aiProvider)

          log.value.push({
            time: nowTime(),
            title: newTitle,
            url: bm.url,
            folder: folderPath,
            status: metaWarning ? 'warning' : 'ok',
            warning: metaWarning,
          })
        } catch (e) {
          log.value.push({
            time: nowTime(),
            title: bm.title || bm.url,
            url: bm.url,
            folder: '',
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          })
        }

        progress.value.done++
      }

      state.value = 'done'
      currentItem.value = null
    } catch (e) {
      state.value = 'error'
      log.value.push({
        time: nowTime(),
        title: '处理出错',
        url: '',
        folder: '',
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
      currentItem.value = null
    }
  }

  return { state, log, progress, currentItem, start }
}
```

- [ ] **Step 3: 编译验证**

```bash
pnpm compile
```

期望：零错误

- [ ] **Step 4: 运行全部测试**

```bash
pnpm vitest run
```

期望：全部 PASS（无 process.test.ts 相关报错）

- [ ] **Step 5: 提交**

```bash
git add src/composables/useBookmarkProcess.ts
git rm src/bookmark/process.ts tests/bookmark/process.test.ts
git commit -m "feat: rewrite bookmark process flow with meta + classify modules"
```

---

### Task 6: 更新 `AISidebar.vue` 展示新进度和日志

**Files:**
- Modify: `entrypoints/bookmarks/components/AISidebar.vue`

- [ ] **Step 1: 替换整个 `<template>` 中 action-area 及 log-area 的内容**

找到 `<!-- Action -->` 到 `</aside>` 的全部 template 内容，替换为：

```html
<template>
  <aside class="sidebar" :style="{ width: `${sidebarWidth}px` }">
    <div class="drag-handle" @mousedown="onDragStart" />

    <div class="sidebar-header">
      <span class="sidebar-title">AI 整理</span>
      <button class="btn-icon" title="设置" @click="openSettings">⚙</button>
    </div>

    <!-- Action -->
    <div class="action-area">
      <button
        class="btn-process"
        :disabled="processor.state.value === 'processing'"
        @click="processor.start()"
      >
        <span v-if="processor.state.value === 'processing'">
          整理中… {{ processor.progress.value.done }}/{{ processor.progress.value.total }}
        </span>
        <span v-else>▶ 整理「待整理」文件夹</span>
      </button>
    </div>

    <!-- Current item indicator -->
    <div v-if="processor.currentItem.value" class="current-item">
      <span class="current-index">{{ processor.currentItem.value.index }}/{{ processor.currentItem.value.total }}</span>
      <span class="current-phase">{{ processor.currentItem.value.phase }}</span>
      <span class="current-url">{{ processor.currentItem.value.url }}</span>
    </div>

    <!-- Log -->
    <div class="log-area">
      <div v-if="processor.log.value.length === 0" class="log-empty">
        <span v-if="processor.state.value === 'idle'">点击上方按钮开始整理</span>
        <span v-else-if="processor.state.value === 'processing'">正在处理…</span>
        <span v-else-if="processor.state.value === 'error'">出错，请检查配置</span>
      </div>

      <div
        v-for="(entry, i) in processor.log.value"
        :key="i"
        class="log-entry"
        :class="entry.status"
      >
        <span class="log-status">
          <span v-if="entry.status === 'ok'">✓</span>
          <span v-else-if="entry.status === 'warning'">✗</span>
          <span v-else>⊘</span>
        </span>
        <span class="log-time">{{ entry.time }}</span>
        <span class="log-body">
          <template v-if="entry.status !== 'error'">
            <a class="log-title" :href="entry.url" target="_blank" :title="entry.url">{{ entry.title }}</a>
            <span class="log-arrow">→</span>
            <span class="log-folder">{{ entry.folder }}</span>
            <span v-if="entry.warning" class="log-warning">（{{ entry.warning }}）</span>
          </template>
          <template v-else>
            <span class="log-title error-title">{{ entry.title }}</span>
            <span class="log-error">{{ entry.error }}</span>
          </template>
        </span>
      </div>

      <div v-if="processor.state.value === 'done' && processor.log.value.length > 0" class="log-summary">
        完成：共 {{ processor.progress.value.total }} 条，
        成功 {{ processor.log.value.filter(e => e.status === 'ok').length }} 条
        <template v-if="processor.log.value.filter(e => e.status === 'warning').length > 0">
          ，警告 {{ processor.log.value.filter(e => e.status === 'warning').length }} 条
        </template>
        <template v-if="processor.log.value.filter(e => e.status === 'error').length > 0">
          ，失败 {{ processor.log.value.filter(e => e.status === 'error').length }} 条
        </template>
      </div>
    </div>
  </aside>
</template>
```

- [ ] **Step 2: 在 `<style scoped>` 中，`.action-area {}` 之后添加新样式，并更新 log 相关样式**

找到 `.action-area` 块之后（约 158 行），在其后插入：

```css
/* Current item */
.current-item {
  padding: 8px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.current-index {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}
.current-phase {
  font-size: 14px;
  color: var(--color-text-muted);
}
.current-url {
  font-size: 14px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

找到 `.log-entry {}` 样式，更新为（增加 status 图标对齐）：

```css
.log-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 16px;
  font-size: 14px;
  line-height: 1.5;
  border-bottom: 1px solid var(--color-border-light);
}
.log-status {
  flex-shrink: 0;
  font-size: 14px;
  width: 14px;
}
.log-entry.ok .log-status { color: #2e7d32; }
.log-entry.warning .log-status { color: #e65100; }
.log-entry.error .log-status { color: #c62828; }
```

找到 `.log-category {}` 样式，替换为：

```css
.log-folder {
  color: var(--color-accent);
  font-weight: 600;
  white-space: nowrap;
}
.log-warning {
  color: #e65100;
  font-size: 14px;
}
```

- [ ] **Step 3: 编译验证**

```bash
pnpm compile
```

期望：零错误

- [ ] **Step 4: 构建并检查产物**

```bash
pnpm build
```

期望：构建成功，无错误

- [ ] **Step 5: 提交**

```bash
git add entrypoints/bookmarks/components/AISidebar.vue
git commit -m "feat: update AISidebar UI for new process flow with progress and warning states"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 运行全部测试**

```bash
pnpm vitest run
```

期望：全部 PASS

- [ ] **Step 2: 完整构建**

```bash
pnpm build
```

期望：构建成功

- [ ] **Step 3: 检查关键文件均存在**

```bash
ls src/bookmark/meta.ts src/bookmark/classify.ts src/composables/useBookmarkProcess.ts
```

期望：三个文件均存在

- [ ] **Step 4: 确认旧文件已删除**

```bash
ls src/bookmark/process.ts 2>&1
```

期望：`No such file or directory`
