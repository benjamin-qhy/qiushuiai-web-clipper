Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.
Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. 文档同步

代码变更与文档必须在同一次任务内保持一致，不得留待事后补充。

- 新增、删除、重命名文件或模块后，立即更新 `CLAUDE.md` 中对应的描述（入口文件、核心模块、类型、图片模式等章节）。
- 修改关键行为（消息类型、滚动参数、签名算法、存储字段等）后，立即更新 `CLAUDE.md` 中涉及该行为的描述。
- `CLAUDE.md` 与 `AGENTS.md` 内容必须完全相同。任何一方发生修改，必须将完整内容同步覆盖到另一方，确保两个文件始终一致。

---

## 项目简介

网页剪藏浏览器扩展（Chrome/Firefox），支持将以下来源一键提取为 Obsidian Markdown 笔记：

- **飞书文档**（docx/wiki）
- **金山文档**（kdocs.cn）
- **任意通用网页**

同时内置书签管理功能，支持 AI 自动分类；当前仅隐藏其 UI 入口与配置项，保留代码和已有数据。宿主使用 WXT + Vue 3 + TypeScript 构建，内容发布工作台通过独立 React + shadcn 工作区包接入。

## 常用命令

```bash
pnpm dev                  # 开发模式（Chrome，热重载）
pnpm dev:firefox          # 开发模式（Firefox）
pnpm build                # 构建 Chrome 扩展
pnpm build:firefox        # 构建 Firefox 扩展
pnpm zip                  # 打包 Chrome 扩展（zip）
pnpm zip:firefox          # 打包 Firefox 扩展（zip）
pnpm compile              # TypeScript 类型检查
vitest run                # 运行全部测试（vitest 为 devDependency，无 npm script）
vitest run tests/converter/blocks.test.ts  # 运行单个测试文件
```

测试使用 jsdom 环境，测试文件在 `tests/` 目录下。

每次修改源文件后，必须运行 `pnpm build` 重新编译，确保 `.output/chrome-mv3/` 下的产物是最新的。

## 架构概览

### 消息流

```
文档页面 / 通用网页（Content Script）
  ↓ browser.tabs.sendMessage({ type: 'EXTRACT_DOC' })
Popup（entrypoints/popup/App.vue）
  ↓ useFileSave.save()
  ↓ buildFrontmatter() + blocksToMarkdown()
  ↓ 图片处理：DOWNLOAD_IMAGE → content script → base64
Obsidian Vault（File System Access API）
```

### 入口文件

- `entrypoints/content.ts` — 飞书 Content Script，注入到 `*.feishu.cn/docx/*` 和 `*.feishu.cn/wiki/*`，处理 `EXTRACT_DOC` 和 `DOWNLOAD_IMAGE` 消息
- `entrypoints/kdocs.content.ts` — 金山文档 Content Script，注入到 `*.kdocs.cn/l/*`，处理 `EXTRACT_DOC` 和 `DOWNLOAD_IMAGE` 消息
- `entrypoints/general.content.ts` — 通用网页 Content Script，注入到所有页面（`<all_urls>`），仅处理 `EXTRACT_DOC`（提取页面标题、正文，返回 `DocContent` 中的 `markdown` 字段，而非 `blocks`）
- `entrypoints/popup/App.vue` — 弹窗 UI，触发提取和保存
- `entrypoints/publisher-sidepanel/` — 内容发布工作台 React 入口；Chrome 以原生侧边栏打开，Firefox 降级为独立扩展页；从本地草稿恢复无 YAML 的完整原文 Markdown
- `entrypoints/douyin-sidepanel/App.vue` — 抖音收藏批量导入侧边栏；当前页为抖音收藏页时点击插件图标直接打开，支持抓取、勾选、刷新和批量保存到 Get 笔记
- `entrypoints/options/App.vue` — 设置页（subDir、imageMode、OSS 配置、Get笔记配置、模型配置、系统提示词管理；书签配置目前仅隐藏）
- `entrypoints/options/components/ModelConfigSection.vue` — 多平台模型配置与测试指令界面；平台不设数量上限，同一平台只配置一次；测试区用按平台分组的单一模型下拉框，测试成功后记录最后使用模型
- `entrypoints/options/components/SystemPromptSection.vue` — 系统提示词管理界面；显示本地提示词列表，编辑表单紧随对应条目，标题和内容必填，新增或编辑成功后立即持久化；不删除也不接入 AI 请求
- `entrypoints/bookmarks/App.vue` — 书签管理页，含文件夹树、书签列表、AI 分类侧边栏；当前没有 UI 入口，但页面和数据均保留；中间书签栏支持 `原始 / 域名` 排序切换
- `entrypoints/background.ts` — 后台 Service Worker；处理 `PROCESS_BOOKMARKS`、`GET_PROCESSING_STATUS`，并按当前 tab 动态切换 popup、抖音收藏侧边栏和内容发布工作台入口

### 核心模块

**提取层 `src/extractor/`**

- `collect.ts` — 飞书页面自动滚动（每步 400px，等待 300ms，超时 60s）触发懒加载，收集所有 `[data-block-type]` 元素；blob URL 图片立即用 canvas 转为 data URL，避免视口外回收
- `blocks.ts` — 飞书 DOM 块元素解析为 `Block` 结构
- `inline.ts` — 飞书行内 span 样式解析（粗体/斜体/代码/链接等）
- `general.ts` — 通用网页提取（标题、作者、发布时间、正文转 Markdown）
- `scroll.ts` — 滚动容器查找辅助
- `kdocs/collect.ts` — 金山文档滚动收集（同样 400px 步长）
- `kdocs/blocks.ts` — 金山文档块解析
- `kdocs/inline.ts` — 金山文档行内样式解析

**转换层 `src/converter/`**

- `blocks.ts` — `Block[]` → Markdown 正文（列表项用单换行，其他块用双换行）
- `inline.ts` — `Span[]` → Markdown 行内语法
- `frontmatter.ts` — 生成 YAML frontmatter（title/source/author/published/created/description/tags；未传标签时默认使用 `clippings`）
- `filename.ts` — 安全文件名（去除非法字符，处理重名冲突）

**存储层 `src/storage/`**

- `settings.ts` — 用 `browser.storage.local` 持久化设置（`Settings` 接口，含多平台 AI 配置、最后使用模型、系统提示词列表、书签配置和 Get笔记配置）；读取时自动迁移旧版单模型配置
- `vault.ts` — 用 IndexedDB 持久化 `FileSystemDirectoryHandle`（Obsidian vault 路径）
- `bookmarks.ts` — 书签数据持久化
- `folderDescriptions.ts` — 书签文件夹描述持久化
- `douyinImports.ts` — 抖音收藏批量导入断点缓存（连续成功段最后 URL、已导入 URL 集合）

**文件系统 `src/filesystem/`**

- `save.ts` — 用 File System Access API 写入 `.md` 文件和图片资源
- `paths.ts` — 路径计算辅助（`computeSharedImagePath`，用于 shared 模式下的相对路径）

**图片上传 `src/uploader/`**

- `types.ts` — `ImageUploader` 接口
- `aliyun.ts` — 阿里云 OSS 上传，用 `crypto.subtle` 做 HMAC-SHA1 签名（`x-oss-date` 头）
- `index.ts` — 工厂函数 `createUploader(settings)`，imageMode=local 时返回 null

**Get笔记集成 `src/getnote/`**

- `api.ts` — `saveLinkNote()` 调用 Get笔记 OpenAPI（openapi.biji.com）保存链接笔记；请求体只传 `linkUrl`（以及可选 `tags`），不传 `title`
- `types.ts` — `SaveLinkNoteParams` 接口（clientId、authToken、linkUrl、tags）

**AI 层 `src/ai/`**

- `types.ts` — `AIProvider` 接口；补全请求可显式选择 JSON 或普通文本响应模式
- `catalog.ts` — 基于 `@earendil-works/pi-ai` 提供浏览器可用的平台、模型与推理级别目录，并解析最后使用模型
- `pi.ts` — `PiAIProvider` 实现，统一调用 Pi 支持的模型平台；推理默认关闭，也可按模型能力传入推理程度
- `aliyun.ts` — `OpenAICompatibleProvider` 实现，支持自定义 OpenAI Chat API 兼容服务及可选推理程度；业务调用默认保留 JSON 模式，测试指令使用普通文本模式，并透传上游错误详情
- `index.ts` — `createAIProvider(platform, modelId, reasoning)` 创建指定模型，`createDefaultAIProvider(settings)` 使用最后一次成功测试的模型

**内容发布 `src/publisher/` 与 `packages/content-publishing-workbench/`**

- `src/publisher/source.ts` — 将结构化文档块或通用网页 Markdown 转为独立原文快照，元数据不写入正文
- `src/publisher/drafts.ts` — 按快照 ID 保存发布草稿，并维护来源 URL 与活动标签页的草稿索引
- `packages/content-publishing-workbench/` — 可移植的 React + shadcn 工作台包；当前提供原文 Markdown 预览壳，后续创作、分页、样式与导出能力均归此包

**书签模块 `src/bookmark/`**

- `classify.ts` — AI 自动分类书签
- `duplicates.ts` — 书签去重
- `export.ts` — 书签导出为 Markdown
- `meta.ts` — 书签元数据提取
- `sort.ts` — 书签列表排序（当前支持 `original` 原始顺序和 `domain` 按域名排序）

**Vue Composables `src/composables/`**

- `useVaultStore.ts` — vault 授权状态管理
- `useDocContent.ts` — 向 content script 发消息获取文档
- `useFileSave.ts` — 保存流程编排（下载图片 → 上传/本地存储 → 写 md 文件）
- `useSettings.ts` — 设置读写
- `useBookmarkTree.ts` — 书签树结构状态管理
- `useBookmarkSearch.ts` — 书签搜索（普通搜索匹配标题/URL/摘要/标签；AI 搜索提交标题、域名、标签，不提交摘要，并在控制台记录点击、提交、返回时间及请求/响应数据）
- `useBookmarkProcess.ts` — 书签 AI 处理流程
- `useUpdateChecker.ts` — 检查扩展新版本（轮询 version.qiushui.me，3s 超时，静默失败）

### 核心类型（`src/types.ts`、`src/publisher/types.ts`）

- `Block` — 文档块：type、spans、level、language、checked、rows、src、alt
- `DocContent extends DocMeta` — 包含 blocks 的完整文档
- `MessageRequest / MessageResponse` — Content Script ↔ Popup 通信协议
- `SourceSnapshot` — 内容发布工作台的只读原文 Markdown 与独立元数据快照
- `PublisherDraft` — 发布工作台草稿，保存原文快照、创作稿和卡片展示状态
- `PublisherLayout` — 全局三栏宽度与显隐偏好
- `CardThemeId` — 六种小红书卡片样式标识

### 图片模式

- **local / per-note 模式**（默认）：图片保存到 `{subDir}/{notename}.assets/`，Markdown 引用相对路径
- **local / shared 模式**：图片保存到统一的共享目录，Markdown 引用相对路径
- **oss 模式**：图片上传到阿里云 OSS，Markdown 引用完整 URL（支持自定义域名）。目前仅支持阿里云 OSS，不支持其他云服务商。

## Agent skills

### Issue tracker

Issues and specs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Uses a single-context domain-document layout. See `docs/agents/domain.md`.
Project vocabulary is maintained in `CONTEXT.md`.
