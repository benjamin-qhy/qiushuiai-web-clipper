# 通用网页提取（defuddle）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有飞书/金山文档剪藏插件中新增一条通用网页提取路径，使用 defuddle 做正文识别和 Markdown 转换，飞书与金山路径完全不动。

**Architecture:** 新增第三个 content script（`general.content.ts`），用 `matches: ['<all_urls>']` + `exclude_matches` 排除飞书/金山域名。该 content script 在 page 内运行 defuddle，返回带有 `markdown` 字段的 `DocContent`。`useFileSave` 看到 `markdown` 字段时直接用其作为正文，跳过现有 `blocksToMarkdown` 与图片下载分支。

**Tech Stack:** WXT, Vue 3, TypeScript, defuddle (`defuddle/full`), Vitest + jsdom

**与 Spec 的偏差说明：** Spec § 1 提到"用 `chrome.scripting.executeScript` 动态注入"。审查当前 manifest 后，`<all_urls>` 已在 `host_permissions` 里，`scripting` 与 `activeTab` 也已存在。考虑到现有飞书/金山都用静态 content script + `tabs.sendMessage` 的注册方式，本计划采用同一模式（新增一个 content script，配合 `exclude_matches`），与 spec 的"只在通用网页生效，不与飞书/金山冲突"目标等价，且权限脚印一致。

---

## File Structure

**新增：**
- `entrypoints/general.content.ts` — 通用网页 content script，注册 `EXTRACT_DOC` listener，调用 `extractGeneral()`，返回 `DocContent`。
- `src/extractor/general.ts` — defuddle 包装：调用 `new Defuddle(document, { markdown: true }).parse()`，把结果映射为 `DocContent`。
- `tests/extractor/general.test.ts` — 用 jsdom + 固定 HTML fixture 测 `extractGeneral()`。

**改动：**
- `src/types.ts` — `DocContent` 增加可选 `markdown?: string`。
- `src/composables/useFileSave.ts` — `save()` 与 `copyToClipboard()` 在 `doc.markdown` 存在时直接用，跳过 blocks 转换与图片下载。
- `src/composables/useDocContent.ts` — 错误文案：通用页面也支持后，提示语调整。
- `entrypoints/popup/App.vue` — 删除"必须是飞书文档"判定（`isFeishuDoc`），预览支持 markdown 字段。
- `package.json` — 增加 `defuddle` 依赖。

**不变：**
- `entrypoints/content.ts`、`entrypoints/kdocs.content.ts` 不动。
- `src/extractor/*` 现有飞书与金山文件不动。
- `src/converter/frontmatter.ts`、`filename.ts` 不动（直接复用）。
- manifest 不动（必要权限已存在）。

---

## Task 1: 安装 defuddle 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 defuddle**

```bash
pnpm add defuddle
```

- [ ] **Step 2: 确认版本写入 package.json**

```bash
grep '"defuddle"' package.json
```
Expected: 输出一行 `"defuddle": "^x.y.z"`（在 `dependencies` 下）。

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add defuddle for general web extraction"
```

---

## Task 2: 扩展 DocContent 类型

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 修改 DocContent 接口**

在 `src/types.ts` 中，把：

```ts
export interface DocContent extends DocMeta {
  blocks: Block[]
}
```

改为：

```ts
export interface DocContent extends DocMeta {
  blocks: Block[]
  /** 通用网页路径直接给出 markdown 字符串；飞书/金山路径不设置此字段 */
  markdown?: string
}
```

- [ ] **Step 2: 跑类型检查**

```bash
pnpm compile
```
Expected: 无报错（飞书/金山现有代码不设置该字段，TS 可选字段兼容）。

- [ ] **Step 3: 提交**

```bash
git add src/types.ts
git commit -m "types: add optional markdown field to DocContent"
```

---

## Task 3: 写 general extractor（先写测试）

**Files:**
- Create: `tests/extractor/general.test.ts`
- Create: `src/extractor/general.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/extractor/general.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { extractGeneral } from '../../src/extractor/general'

function setDom(html: string, url = 'https://example.com/post') {
  document.documentElement.innerHTML = html
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
  })
}

describe('extractGeneral', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = ''
  })

  it('提取基本文章正文为 markdown 字符串', () => {
    setDom(`
      <head><title>测试文章 - 站点名</title></head>
      <body>
        <article>
          <h1>测试文章</h1>
          <p>这是<strong>正文</strong>第一段。</p>
          <p>第二段包含 <a href="https://example.com/x">链接</a>。</p>
        </article>
        <nav>导航栏</nav>
        <aside>侧边栏</aside>
      </body>
    `)
    const doc = extractGeneral()
    expect(doc.title).toContain('测试文章')
    expect(doc.markdown).toBeTruthy()
    expect(doc.markdown).toContain('正文')
    expect(doc.markdown).not.toContain('导航栏')
    expect(doc.markdown).not.toContain('侧边栏')
    expect(doc.source).toBe('https://example.com/post')
    expect(doc.blocks).toEqual([])
  })

  it('正文太短时 markdown 仍返回，由调用方决定是否拒绝', () => {
    setDom(`<body><article><p>太短</p></article></body>`)
    const doc = extractGeneral()
    expect(doc.markdown).toBeDefined()
  })

  it('保留图片为远程 URL，不做下载', () => {
    setDom(`
      <body><article>
        <h1>带图文章</h1>
        <p>段落前</p>
        <p><img src="https://cdn.example.com/a.png" alt="图 A" /></p>
        <p>段落后</p>
      </article></body>
    `)
    const doc = extractGeneral()
    expect(doc.markdown).toMatch(/https:\/\/cdn\.example\.com\/a\.png/)
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
pnpm vitest run tests/extractor/general.test.ts
```
Expected: FAIL，错误是 `Cannot find module '../../src/extractor/general'`。

- [ ] **Step 3: 实现 extractGeneral**

创建 `src/extractor/general.ts`：

```ts
import Defuddle from 'defuddle/full'
import type { DocContent } from '../types'

export function extractGeneral(): DocContent {
  const result = new Defuddle(document, { markdown: true }).parse()

  const title = (result.title ?? document.title ?? '').trim() || 'Untitled'

  return {
    title,
    source: window.location.href,
    author: result.author ?? undefined,
    published: result.published ?? undefined,
    created: new Date().toISOString().slice(0, 10),
    description: result.description ?? undefined,
    blocks: [],
    markdown: result.content ?? '',
  }
}
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
pnpm vitest run tests/extractor/general.test.ts
```
Expected: 3 PASS。

> 若 defuddle 在 jsdom 下抛错或某项断言不通过，先读 defuddle README 与源码确认 API（构造参数、`parse()` 返回字段名），按真实 API 调整 `general.ts` 与测试断言。**不要**绕过失败用空字符串硬塞。

- [ ] **Step 5: 提交**

```bash
git add src/extractor/general.ts tests/extractor/general.test.ts
git commit -m "feat: add general web extractor using defuddle"
```

---

## Task 4: 通用网页 content script

**Files:**
- Create: `entrypoints/general.content.ts`

- [ ] **Step 1: 写 content script**

创建 `entrypoints/general.content.ts`：

```ts
import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser } from 'wxt/browser'
import type { MessageRequest, MessageResponse } from '../src/types'
import { extractGeneral } from '../src/extractor/general'

export default defineContentScript({
  matches: ['<all_urls>'],
  excludeMatches: ['*://*.feishu.cn/*', '*://*.kdocs.cn/*'],
  runAt: 'document_idle',

  main() {
    browser.runtime.onMessage.addListener(
      (message: MessageRequest, _sender: unknown, sendResponse: (r: MessageResponse) => void) => {
        if (message.type === 'EXTRACT_DOC') {
          try {
            const doc = extractGeneral()
            const wordCount = (doc.markdown ?? '').trim().length
            if (wordCount < 30) {
              sendResponse({ ok: false, error: '未识别到正文内容' })
              return
            }
            sendResponse({ ok: true, data: doc })
          } catch (e) {
            sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
          }
          return true
        }
        if (message.type === 'DOWNLOAD_IMAGE') {
          // 通用路径不下载图片，直接返回错误（调用方应该不会发这个消息）
          sendResponse({ ok: false, error: '通用网页路径不支持图片下载' })
          return true
        }
      }
    )
  },
})
```

- [ ] **Step 2: 跑类型检查与构建**

```bash
pnpm compile && pnpm build
```
Expected: 构建成功，`.output/chrome-mv3/` 下出现 `general.content.js`。

- [ ] **Step 3: 提交**

```bash
git add entrypoints/general.content.ts
git commit -m "feat: add general web content script with all-urls + excludes"
```

---

## Task 5: useFileSave 分支识别 markdown 字段

**Files:**
- Modify: `src/composables/useFileSave.ts`

- [ ] **Step 1: 改 save() 函数**

打开 `src/composables/useFileSave.ts`，把 `save` 函数体里这一段：

```ts
const settings = await getSettings()
const uploader = createUploader(settings)
const notename = sanitizeFilename(doc.title)
const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
const blocks =
  tab?.id != null
    ? await downloadAndReplaceImages(
        doc.blocks,
        tab.id,
        vaultHandle,
        settings.subDir,
        notename,
        uploader,
      )
    : doc.blocks

const frontmatter = buildFrontmatter(doc)
const body = blocksToMarkdown(blocks)
const content = `${frontmatter}\n${body}\n`
```

改为：

```ts
const settings = await getSettings()
const frontmatter = buildFrontmatter(doc)

let body: string
if (doc.markdown !== undefined) {
  // 通用网页路径：直接使用 defuddle 输出的 markdown，不下载图片
  body = doc.markdown
} else {
  const uploader = createUploader(settings)
  const notename = sanitizeFilename(doc.title)
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const blocks =
    tab?.id != null
      ? await downloadAndReplaceImages(
          doc.blocks,
          tab.id,
          vaultHandle,
          settings.subDir,
          notename,
          uploader,
        )
      : doc.blocks
  body = blocksToMarkdown(blocks)
}

const content = `${frontmatter}\n${body}\n`
```

- [ ] **Step 2: 改 copyToClipboard() 函数**

把：

```ts
async function copyToClipboard(doc: DocContent) {
  const frontmatter = buildFrontmatter(doc)
  const body = blocksToMarkdown(doc.blocks)
  const content = `${frontmatter}\n${body}\n`
  await navigator.clipboard.writeText(content)
}
```

改为：

```ts
async function copyToClipboard(doc: DocContent) {
  const frontmatter = buildFrontmatter(doc)
  const body = doc.markdown !== undefined ? doc.markdown : blocksToMarkdown(doc.blocks)
  const content = `${frontmatter}\n${body}\n`
  await navigator.clipboard.writeText(content)
}
```

- [ ] **Step 3: 跑类型检查与现有测试**

```bash
pnpm compile && pnpm vitest run
```
Expected: 类型通过；全部既有测试 PASS（飞书/金山行为不变）。

- [ ] **Step 4: 提交**

```bash
git add src/composables/useFileSave.ts
git commit -m "feat: branch useFileSave on markdown field for general web path"
```

---

## Task 6: popup 接受通用网页

**Files:**
- Modify: `entrypoints/popup/App.vue`
- Modify: `src/composables/useDocContent.ts`

- [ ] **Step 1: 调整 useDocContent 错误文案**

打开 `src/composables/useDocContent.ts`，把这一段：

```ts
if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
  error.value = '当前页面不支持，请在飞书或金山文档页面使用此插件'
} else {
  error.value = msg
}
```

改为：

```ts
if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
  error.value = '当前页面不支持提取（例如 chrome:// 或浏览器内置页面）'
} else {
  error.value = msg
}
```

- [ ] **Step 2: 调整 popup 模板逻辑**

打开 `entrypoints/popup/App.vue`。

(a) 把 `isFeishuDoc` 重命名并放宽语义：

```ts
const isFeishuDoc = computed(() => doc.value !== null || docContent.isLoading.value)
```

改为：

```ts
const hasDoc = computed(() => doc.value !== null || docContent.isLoading.value)
```

(b) 改 `previewText`，让它兼容通用网页（`blocks` 为空、`markdown` 有内容）：

```ts
const previewText = computed(() => {
  if (!doc.value) return ''
  return doc.value.blocks
    .filter(b => b.spans)
    .map(b => b.spans!.map(s => s.text).join(''))
    .filter(line => line.trim())
    .join('\n')
})
```

改为：

```ts
const previewText = computed(() => {
  if (!doc.value) return ''
  if (doc.value.markdown !== undefined) {
    return doc.value.markdown.split('\n').filter(l => l.trim()).join('\n')
  }
  return doc.value.blocks
    .filter(b => b.spans)
    .map(b => b.spans!.map(s => s.text).join(''))
    .filter(line => line.trim())
    .join('\n')
})
```

(c) 把模板中所有 `isFeishuDoc` 引用改为 `hasDoc`：

```bash
grep -n isFeishuDoc entrypoints/popup/App.vue
```
对每一处出现，把 `isFeishuDoc` 替换为 `hasDoc`。

(d) 把"非支持页"占位文案改宽松：

把：

```html
<p v-else>请在飞书文档页面使用此插件</p>
```

改为：

```html
<p v-else>请在网页上使用此插件</p>
```

- [ ] **Step 3: 构建并人工冒烟**

```bash
pnpm compile && pnpm build
```
Expected: 构建成功。

加载 `.output/chrome-mv3/` 为未打包扩展，访问一篇普通文章（例如 https://en.wikipedia.org/wiki/Markdown），点 popup，确认：
- 预览区出现文章正文文字
- 标题/作者等字段被填充
- 点保存能生成 md 文件，frontmatter 完整，正文为 markdown，图片以远程 URL 形式出现
- 再到飞书文档页测试，确认飞书路径行为不变

> 这一步是 UI 验证，无法用自动化测试覆盖，必须人工跑一遍。如果发现飞书路径回归，停下来读 diff，不要在没复现并理解原因前提交。

- [ ] **Step 4: 提交**

```bash
git add entrypoints/popup/App.vue src/composables/useDocContent.ts
git commit -m "feat: popup accepts general web pages alongside feishu/kdocs"
```

---

## Task 7: 端到端验证与最终提交

**Files:** 无

- [ ] **Step 1: 全量测试**

```bash
pnpm vitest run
```
Expected: 全部 PASS，包括既有的 converter / extractor / kdocs / composables / uploader / filesystem 等套件。

- [ ] **Step 2: 类型检查**

```bash
pnpm compile
```
Expected: 无报错。

- [ ] **Step 3: 构建**

```bash
pnpm build
```
Expected: 构建成功，输出包含 `content.js`、`kdocs.content.js`、`general.content.js`。

- [ ] **Step 4: 人工回归（三条路径）**

加载 `.output/chrome-mv3/`，按顺序测：

1. **飞书 docx 页**：提取 → 保存 → 检查 md 与 .assets/，应与改动前一致。
2. **金山文档 `kdocs.cn/l/*`**：提取 → 保存 → 检查 md 与 .assets/，应与改动前一致。
3. **普通文章**（例如知乎专栏、Medium、博客）：提取 → 保存 → 检查 md，frontmatter 完整、正文为 markdown、图片为远程 URL、无 .assets/ 目录。

任何一条路径异常 → 停下来调查，不要标记完成。

- [ ] **Step 5: 若改动 README，最后整理**

> 仅在 README 里有"支持的网站"清单时改动。否则跳过此步。

---

## Self-Review 结果

- **Spec 覆盖：** § 1 路由（Task 4 exclude_matches）、§ 2 模块结构（Tasks 2/3/4/5）、§ 3 数据流（Tasks 4/5）、§ 4 frontmatter 映射（Task 3 — 直接复用 buildFrontmatter，无需新代码）、§ 5 失败处理（Task 4 wordCount<30 拒绝 + extractGeneral try/catch + useDocContent 错误文案）、§ 6 测试（Task 3）、§ 7 依赖（Task 1）。全部覆盖。
- **占位符：** 无 TBD / TODO。所有代码块为完整代码。
- **类型一致：** `DocContent.markdown?: string` 在 Task 2 定义，Tasks 3/5/6 使用一致。`extractGeneral()` 签名一致。
- **与 spec 偏差：** 注入策略改为 content script + exclude_matches（开头已说明），其余与 spec 一致。
