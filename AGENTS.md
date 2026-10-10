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

- 新增、删除、重命名文件或模块后，立即更新 `AGENTS.md` 中对应的描述（入口文件、核心模块、类型、图片模式等章节）。
- 修改关键行为（消息类型、滚动参数、签名算法、存储字段等）后，立即更新 `AGENTS.md` 中涉及该行为的描述。
- `AGENTS.md` 是本仓库根目录唯一维护的项目指令文件；文档更新与相关代码变更在同一次任务内完成。

---

## 项目简介

项目名称为 **海奇AI浏览器扩展**，英文 **HaiqiAI Browser Extension**。GitHub 仓库、本地目录和根包名为 `haiqiai-browser-extension`；对外发布的扩展显示名称为 **海奇AI**。当前架构见 `docs/architecture.md`，文档入口见 `docs/README.md`。

网页剪藏浏览器扩展（Chrome/Firefox），支持将以下来源一键提取为 Obsidian Markdown 笔记：

- **飞书文档**（docx/wiki）
- **金山文档**（kdocs.cn）
- **任意通用网页**

使用 WXT + Vue 3 + TypeScript 构建。保留多平台模型配置与系统提示词管理；旧内容创作工作台、图片卡片、独立预览及书签管理已移除；现有 React 发布工作台用于连接 API 和执行发布任务，不清除浏览器收藏夹或历史存储数据。

## MultiPost 发布扩展子项目

### 发布模块开发规则

1. **以 MultiPost 已有实现为基础。** 开发平台发布功能前，先检查对应内容类型的平台脚本，沿用其上传、填写和提交流程；存在问题就在原实现上修复，不另起一套重复实现。
2. **保持双方技术架构独立。** 剪藏继续使用现有 Vue/WXT 架构；发布继续使用 MultiPost 的 React、平台脚本及模块组织方式，通过统一扩展入口集成。
3. **先按内容类型区分接口，再按平台分发。** 图文、视频、文章分别使用对应 API，由平台参数调用相应平台脚本。账号、电脑、浏览器及用户配置通过参数选择；浏览器和用户配置允许使用默认值。
4. **所有发布操作由 API 触发。** 上传素材、填写文字、选择话题与合集、设置原创和封面、暂存或发布，均由 API 参数驱动扩展执行。浏览器工具用于查看页面和排查问题，不能用手动代操作冒充接口验收成功。
5. **优先复用，只补必要能力。** 主要补充任务领取、账号核对、参数校验、进度回传、防重复执行、结果确认和故障恢复。确需替换原有流程或改变架构时，先说明原因和影响，获得用户确认后实施。
6. **严格执行请求参数。** 不擅自改写、截断或删减内容；合集名称必须完全一致且唯一；横版、竖版封面分别处理；原创声明按参数和相应授权执行。不支持、缺项或超限时明确报错。
7. **最终动作必须明确。** 支持填写后保持不动、保存草稿、直接发布。测试优先保存草稿；只有平台对应内容类型确实没有草稿功能，才按已获授权直接发布。保存失败或尚未实现，不得自动改为发布。
8. **结果必须有平台证据。** 区分已存草稿、已提交／审核中、已发布、需人工处理、失败、结果未知。点击成功不等于发布成功；异常结果应说明已知原因、发生阶段及处理建议。
9. **中断后避免重复操作。** 优先检查原任务和原页面，不自动重新上传、重新填写或重复提交。只有确认前次执行已停止、页面与任务一致后，才允许从明确的位置继续；提交后结果未知时仅核对，不自动重发。
10. **逐平台、逐内容类型验收。** 先覆盖已确认范围中 MultiPost 已有的能力。代码测试通过、构建成功和真实平台验收分别记录，不能相互替代；代码与文档同步更新。

### 模块与实施状态

当前开发进度、最新封面修复与换电脑接续步骤见 `docs/research/2026-10-10-publishing-handoff.md`；跨电脑继续开发时先读取，历史待验收描述以该交接及后续真实证据为准。

`MultiPost-Extension/` 是从本机 MultiPost 源码复制的独立发布扩展，使用 Plasmo + React，保留自己的依赖与构建配置。开发该子项目时先读其 `CLAUDE.md`；根项目仅类型检查和打包显式接入的发布模块；其余上游源码保留独立构建。

- 发布连接后台 `MultiPost-Extension/src/haiqiai/connection.ts` 通过独立 `HAIQIAI_PUBLISHING_CONNECTION` 消息处理配对/查询；仅信任发布页调用，密钥保存在限制为可信扩展上下文的 local 存储，不回传页面消息。30秒 alarm 心跳，离线/撤销明确显示，Firefox不启动该后台。
- `skills/haiqiai-publishing/SKILL.md` 是随仓库交付的发布 Skill：按内容类型调用 dynamic/video/article 接口，支持单次提交、多平台分组及有预算的原页接续；`references/requests.md` 定义参数映射与幂等调用，`references/recovery.md` 定义状态、接续白名单和结果证据。所有平台写操作均由 API 触发浏览器扩展；使用专用 Skill 凭据，运行回执存 `.haiqiai-publishing/skill-runs/`，不自动安装到全局技能目录。
- `packages/publishing-api/` 为独立 Node 24 + SQLite 发布 API；当前实现管理配对、分权密钥、发现、账号登记/观测、心跳、默认配置及目标预检，已新增素材流式上传校验及模拟任务提交/领取/事件查询；模拟恢复协议已接入，真实任务只读预检已接入，上传填写已接入，小红书图文最终动作及结果核对已有实机验收，视频与其他平台按交接记录限定范围。`server.mts` 提供服务，`admin.mts` 为本机/远程管理及 Skill 请求入口，`upload.mts` 流式上传并保存可重试回执，`capabilities.mts` 将首版范围标为未验证；`assets.mts` 管理完整性校验，`tasks.mts` 管理任务快照/租约/证据，`recovery.mts` 管理提交意图、取消、旧执行停止确认、有限恢复和只读核对，`targets.mts` 共用目标解析，`model.mts`/`protocol.mts` 定义持久化类型和协议辅助。运行数据和凭据默认存 `.haiqiai-publishing/`（不入库）。
- 正在实施规格与19项开发任务，见[开发规格](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/27)。开发及测试范围已获用户授权；部署和真实发布仍须对应授权。
- `entrypoints/publish/` 是WXT托管的React发布入口；`MultiPost-Extension/src/haiqiai/` 使用原MultiPost的React/HeroUI体系承载本地界面及独立样式/文案。已接入配对、连接状态、账号及模拟任务列表；`simulation.ts` 仅流式核对素材并回传模拟草稿，`i18n.ts` 共用本地化文案；`rednote.ts` 只读检查当前浏览器的小红书创作页，可将指定主页稳定ID对应的小红书号与创作首页账号号交叉核对，不以昵称判定身份；上游 `src/sync/dynamic/rednote.ts` 已拆掉无提交授权的自动点击，改为严格准备入口，尚未接入真实任务或验收上传结果；真实公开发布尚未验收；上游官方服务器入口不载入整合包。
- Chrome/Edge弹窗与设置页可进入发布工作台；Firefox保持剪藏，不构建发布页。仅显式引入的发布模块参与根构建，未迁入的上游源码不自动加载。
- 发布系统规划已确认，实施顺序与验收见[开发验收决策](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/25)。用户明确要求开始前确认：实际开发、部署或真实发布须先获得对应范围的明确授权；采用规划不代表授权开工。已获授权的范围不重复询问。
- 内容字段与平台映射见[发布内容决策](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/26)：Skill 提交确认后的各平台内容，扩展不自动改写、截断或删减；超限和缺项须明确报错。MultiPost 既有静默截断行为仍待整改，不能视为已符合此规则。
- 任务接口、结果状态及恢复规则见[发布接口决策](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/24)：需人工处理、失败和结果未知必须说明原因、阶段与处理建议；提交后的未知结果仅核对、不自动重发。连接、发现及模拟任务的状态/恢复已实现；真实平台证据及页面恢复仍待逐平台验收。
- 已确认职责与素材/授权边界见[整合架构决策](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/23)：Skill 提交并查询，API 保存素材与任务，MultiPost 执行并回报；素材先上传所选 API，各端使用独立可撤销密钥，平台 Cookie 留在浏览器。连接授权已实现；素材与模拟任务传递已实现；小红书图文真实发布及结果核对已有实机验收，其他范围见当前交接。
- 首版仅覆盖已定 13 平台中 MultiPost 已有的发布类型，尚无适配的类型暂不新增；完整范围见[首版发布类型决策](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/22)。已有脚本仍需补齐流程和结果确认，不能视为已验收。
- 发布目标规则已确定：Skill 指定平台、账号和电脑，浏览器与用户配置允许省略并使用预设默认值，最终定位独立扩展安装；细则见规划地图中的「发布授权、账号与运行环境边界」，术语见 `GLOSSARY.md`。默认解析预检已实现；模拟任务入队已固定安装；真实填写前账号复核已实现。
- 已确认整合方向：剪藏保留现有 Vue 架构；发布保留 MultiPost 的 React 页面、平台脚本和模块结构并继续开发。计划由 WXT 统一构建一个扩展，统一配置与后台入口，业务模块、消息及设置分开组织；Plasmo 专属部分按需适配。双框架入口已接入，连接后台与发现API已接入，模拟任务执行已接入，模拟故障恢复已接入，真实任务只读预检已接入，上传填写已接入，小红书图文最终动作及结果核对已有实机验收，视频与其他平台按交接记录限定范围。
- 已确定目标：复用 MultiPost 能力并整合进当前剪藏扩展，最终为一个扩展；当前子目录独立构建只是引入现状。规划与决策见 [多平台发布规划地图](https://github.com/benjamin-qhy/haiqiai-browser-extension/issues/17)，涉及发布范围、接口或验收时先读取该地图及相关子议题。
- 上游为 `https://github.com/leaperone/MultiPost-Extension`，引入提交为 `9e9138831b7a3c782d9010f7dfd1ae6d474ebe11`；保留上游 LICENSE 和 README，不复制嵌套 Git 仓库。
- 根目录 WXT 命令构建剪藏与 React 发布页组成的统一扩展；MultiPost 的独立 Plasmo 安装与构建须在其子目录执行。

## 常用命令

```bash
pnpm --dir MultiPost-Extension install --ignore-workspace --frozen-lockfile --ignore-scripts  # 补齐根构建所需子项目依赖（pnpm 9）
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
- `entrypoints/douyin-sidepanel/App.vue` — 抖音收藏批量导入侧边栏；当前页为抖音收藏页时点击插件图标直接打开，支持抓取、勾选、刷新和批量保存到 Get 笔记
- `entrypoints/options/App.vue` — 设置页（subDir、imageMode、OSS 配置、Get笔记配置、模型配置、系统提示词管理）
- `entrypoints/options/components/ModelConfigSection.vue` — 多平台模型配置与测试指令界面；平台不设数量上限，同一平台只配置一次；测试区用按平台分组的单一模型下拉框，测试成功后记录最后使用模型
- `entrypoints/options/components/SystemPromptSection.vue` — 系统提示词管理界面；显示本地提示词列表，编辑表单紧随对应条目，标题和内容必填，新增或编辑成功后立即持久化；不删除也不接入 AI 请求
- `entrypoints/publish/` — React 发布工作台入口；Chrome 从弹窗或设置页打开，用于配对 API、查看账号与任务、执行检查和结果核对；Firefox 隐藏入口且不注册发布后台
- `entrypoints/background.ts` — 后台 Service Worker；注册发布连接后台，抖音收藏页启用抖音侧边栏，其余页面使用剪藏弹窗并禁用侧边栏

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

- `settings.ts` — 用 `browser.storage.local` 持久化设置（`Settings` 接口，含多平台 AI 配置、最后使用模型、系统提示词列表和 Get笔记配置）；读取时自动迁移旧版单模型配置
- `vault.ts` — 用 IndexedDB 持久化 `FileSystemDirectoryHandle`（Obsidian vault 路径）
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
- `index.ts` — `createAIProvider(platform, modelId, reasoning)` 创建指定模型；设置页使用它测试配置的模型

**Vue Composables `src/composables/`**

- `useVaultStore.ts` — vault 授权状态管理
- `useDocContent.ts` — 向 content script 发消息获取文档
- `useFileSave.ts` — 保存流程编排（下载图片 → 上传/本地存储 → 写 md 文件）
- `useSettings.ts` — 设置读写
- `useUpdateChecker.ts` — 检查扩展新版本（轮询 version.qiushui.me，3s 超时，静默失败）

### 核心类型（`src/types.ts`）

- `Block` — 文档块：type、spans、level、language、checked、rows、src、alt
- `DocContent extends DocMeta` — 包含 blocks 的完整文档
- `MessageRequest / MessageResponse` — Content Script ↔ Popup 通信协议

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
Project vocabulary is maintained in `GLOSSARY.md`.

MultiPost 的平台入口回归测试位于 `MultiPost-Extension/tests/`，由根目录 `pnpm exec vitest run` 一并执行；它们继续使用子项目类型配置，不进入根项目类型检查。

根 WXT 构建和 Vitest 统一解析根目录 React/ReactDOM/HeroUI 实例，避免子项目安装独立依赖后出现重复 React 导致发布页失效。

## 当前发布状态与验收入口

最新状态与换电脑接续步骤见 `docs/research/2026-10-10-publishing-handoff.md`；协议见 `packages/publishing-api/README.md`，调用规则见 `skills/haiqiai-publishing/SKILL.md`。实施和验收状态分别记录，不能以脚本存在或构建成功代替真实平台验收。

- 小红书图文：特定账号与素材的自动暂存、发布、只读核对 `published` 和作品 URL 已有实机证据。
- 小红书视频：两次多轮原页接续保存本地草稿已通过；新任务单次完成、双封面、视频原创和公开发布未验收；最新封面链接失效修复待重载实机验证。
- X：账号核对、文字/最多4图填写保持代码已实现，最终提交未开放；抖音、脉脉仅只读预检，其他平台尚未完成 API 真实发布接入与验收。
- 发布 Skill：调用与恢复规则已编写，完整真实 Skill 流程尚未验收；能力目录仍保守标记 `verified=false`。
- 正式图文素材见 `publishing-materials/2026-10-08-enterprise-ai-fde/README.md`；视频素材清单见 `publishing-materials/2026-10-09-cli-skill-mcp/content.json`。原视频不入库，使用前核对路径和摘要。

历史问题、修复和实机证据保存在 `docs/research/`，不在本文件逐条叠加过期状态。每次改动后更新相关模块说明、协议与当前交接；保留历史记录的时间与证据边界。
