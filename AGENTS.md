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

项目名称为 **海奇AI**，英文 **HaiqiAI**。仓库名与对外发布名称计划后续统一修改；当前目录、包名和扩展显示名称暂保留现状。

网页剪藏浏览器扩展（Chrome/Firefox），支持将以下来源一键提取为 Obsidian Markdown 笔记：

- **飞书文档**（docx/wiki）
- **金山文档**（kdocs.cn）
- **任意通用网页**

使用 WXT + Vue 3 + TypeScript 构建。保留多平台模型配置与系统提示词管理；内容发布工作台、图片卡片、独立预览及书签管理已移除，不清除浏览器收藏夹或历史存储数据。

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
- `packages/publishing-api/` 为独立 Node 24 + SQLite 发布 API；当前实现管理配对、分权密钥、发现、账号登记/观测、心跳、默认配置及目标预检，已新增素材流式上传校验及模拟任务提交/领取/事件查询；模拟恢复协议已接入，真实任务只读预检已接入，上传填写已接入，最终动作代码待实机验收。`server.mts` 提供服务，`admin.mts` 为本机/远程管理及 Skill 请求入口，`upload.mts` 流式上传并保存可重试回执，`capabilities.mts` 将首版范围标为未验证；`assets.mts` 管理完整性校验，`tasks.mts` 管理模拟任务快照/租约/证据，`recovery.mts` 管理提交意图、取消、旧执行停止确认、有限恢复和只读核对，`targets.mts` 共用目标解析，`model.mts`/`protocol.mts` 定义持久化类型和协议辅助。运行数据和凭据默认存 `.haiqiai-publishing/`（不入库）。
- 正在实施规格与19项开发任务，见[开发规格](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/27)。开发及测试范围已获用户授权；部署和真实发布仍须对应授权。
- `entrypoints/publish/` 是WXT托管的React发布入口；`MultiPost-Extension/src/haiqiai/` 使用原MultiPost的React/HeroUI体系承载本地界面及独立样式/文案。已接入配对、连接状态、账号及模拟任务列表；`simulation.ts` 仅流式核对素材并回传模拟草稿，`i18n.ts` 共用本地化文案；`rednote.ts` 只读检查当前浏览器的小红书创作页，可将指定主页稳定ID对应的小红书号与创作首页账号号交叉核对，不以昵称判定身份；上游 `src/sync/dynamic/rednote.ts` 已拆掉无提交授权的自动点击，改为严格准备入口，尚未接入真实任务或验收上传结果；真实公开发布尚未验收；上游官方服务器入口不载入整合包。
- Chrome/Edge弹窗与设置页可进入发布工作台；Firefox保持剪藏，不构建发布页。仅显式引入的发布模块参与根构建，未迁入的上游源码不自动加载。
- 发布系统规划已确认，实施顺序与验收见[开发验收决策](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/25)。用户明确要求开始前确认：实际开发、部署或真实发布须先获得对应范围的明确授权；采用规划不代表授权开工。已获授权的范围不重复询问。
- 内容字段与平台映射见[发布内容决策](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/26)：Skill 提交确认后的各平台内容，扩展不自动改写、截断或删减；超限和缺项须明确报错。MultiPost 既有静默截断行为仍待整改，不能视为已符合此规则。
- 任务接口、结果状态及恢复规则见[发布接口决策](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/24)：需人工处理、失败和结果未知必须说明原因、阶段与处理建议；提交后的未知结果仅核对、不自动重发。连接、发现及模拟任务的状态/恢复已实现；真实平台证据及页面恢复仍待逐平台验收。
- 已确认职责与素材/授权边界见[整合架构决策](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/23)：Skill 提交并查询，API 保存素材与任务，MultiPost 执行并回报；素材先上传所选 API，各端使用独立可撤销密钥，平台 Cookie 留在浏览器。连接授权已实现；素材与模拟任务传递已实现；真实发布待实现。
- 首版仅覆盖已定 13 平台中 MultiPost 已有的发布类型，尚无适配的类型暂不新增；完整范围见[首版发布类型决策](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/22)。已有脚本仍需补齐流程和结果确认，不能视为已验收。
- 发布目标规则已确定：Skill 指定平台、账号和电脑，浏览器与用户配置允许省略并使用预设默认值，最终定位独立扩展安装；细则见规划地图中的「发布授权、账号与运行环境边界」，术语见 `GLOSSARY.md`。默认解析预检已实现；模拟任务入队已固定安装；真实填写前账号复核已实现。
- 已确认整合方向：剪藏保留现有 Vue 架构；发布保留 MultiPost 的 React 页面、平台脚本和模块结构并继续开发。计划由 WXT 统一构建一个扩展，统一配置与后台入口，业务模块、消息及设置分开组织；Plasmo 专属部分按需适配。双框架入口已接入，连接后台与发现API已接入，模拟任务执行已接入，模拟故障恢复已接入，真实任务只读预检已接入，上传填写已接入，最终动作代码待实机验收。
- 已确定目标：复用 MultiPost 能力并整合进当前剪藏扩展，最终为一个扩展；当前子目录独立构建只是引入现状。规划与决策见 [多平台发布规划地图](https://github.com/benjamin-qhy/qiushuiai-web-clipper/issues/17)，涉及发布范围、接口或验收时先读取该地图及相关子议题。
- 上游为 `https://github.com/leaperone/MultiPost-Extension`，引入提交为 `9e9138831b7a3c782d9010f7dfd1ae6d474ebe11`；保留上游 LICENSE 和 README，不复制嵌套 Git 仓库。
- 根目录命令针对剪藏扩展；MultiPost 的安装与构建须在其子目录执行。

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
- `entrypoints/douyin-sidepanel/App.vue` — 抖音收藏批量导入侧边栏；当前页为抖音收藏页时点击插件图标直接打开，支持抓取、勾选、刷新和批量保存到 Get 笔记
- `entrypoints/options/App.vue` — 设置页（subDir、imageMode、OSS 配置、Get笔记配置、模型配置、系统提示词管理）
- `entrypoints/options/components/ModelConfigSection.vue` — 多平台模型配置与测试指令界面；平台不设数量上限，同一平台只配置一次；测试区用按平台分组的单一模型下拉框，测试成功后记录最后使用模型
- `entrypoints/options/components/SystemPromptSection.vue` — 系统提示词管理界面；显示本地提示词列表，编辑表单紧随对应条目，标题和内容必填，新增或编辑成功后立即持久化；不删除也不接入 AI 请求
- `entrypoints/background.ts` — 后台 Service Worker；抖音收藏页启用抖音侧边栏，其余页面使用剪藏弹窗并禁用侧边栏

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

小红书当前页面观测、单图上传填写验收与未完成项见 `docs/research/2026-10-08-xiaohongshu-editor-acceptance.md`；这不是完整自动发布验收。

正式图文发布测试选材时，读取 `publishing-materials/2026-10-08-enterprise-ai-fde/README.md`；该素材包含用户指定的原文、8个话题及按顺序保存的7张原图，`content.json` 提供图片完整性清单。

`MultiPost-Extension/src/haiqiai/preflight.ts` 处理 live/prepare 真实任务的只读预检，独立领取、核对账号、流式核对素材并持久化原因事件；prepare 不上传；fill 已实机验收自动上传填写；最终动作由下文 finish 参数控制。真实任务不会由模拟器领取；prepare/stay 不授予最终提交权限。stay 填写通过后仍为需人工处理，不能算完整真实发布验收。

小红书真实任务只读预检证据与剩余范围见 `docs/research/2026-10-08-xiaohongshu-live-preflight.md`：账号交叉核对及素材检查通过，早期只读任务因话题未验收返回需人工处理；后续7图8话题已自动填写，合集已自动选中、原创由人工辅助补齐，仍未发布。

小红书填写入口 `MultiPost-Extension/src/sync/dynamic/rednote-prepare.ts` 保留 MultiPost 平台注入架构，由 `src/haiqiai/preflight.ts` 在 live/fill 任务中调用。两次新鲜首页账号核对、素材摘要校验、新空编辑页、顺序上传、原生话题精确选择及预览核对。API prepare-intent 保存编辑页和最长90秒截止时间，防止重放；中断保留页面，禁止 resume/reconcile 重填。finish=stay 完成为 needs_attention / AWAITING_PUBLISH_CONFIRMATION，不是已存草稿或已发布。PNG/JPEG/WebP、最多18图，32 MiB总量是传输预算限制。7图8话题自动填写已验证；合集入口修复已实机验收，最终动作完整回传待重载验收，最终动作通过 confirmation.finish 单独授权；公开发表实机验收仍未完成。

小红书 dynamic 内容字段新增 collectionName / declareOriginal：合集严格名称全等且唯一，原创须知须由用户同意；携带 originalAgreementAccepted=true 时自动勾选，否则暂停；两个参数参与不可变快照/摘要并在工作台展示。填写恢复依赖原页实际 finished 标记或实际关页，不能以API服务器截止时间冒充停止；读取到明确原因后保留原原因。具体接口见 packages/publishing-api/README.md。

小红书实际7图8话题已由fill自动上传填写；合集未选中入口须同时支持 `.collection-plugin-button` 与已选中的 `.collection-plugin-choose`，此差异已修复并回归测试。当前实机最后的合集与原创设置由浏览器人工辅助完成，API仍保留原暂停原因，不代表全自动结果回传或发布已验收；详见真实预检研究记录续记。

小红书真实填写会等待唯一可见的“上传图文”入口，再确认多图上传框就绪；页面初始加载期间不立即判定入口缺失。

2026-10-08 21:43实机复测：接口fill已自动完成7图8话题及精确“AI落地”合集；按用户授权由浏览器辅助完成原创须知及“暂存离开”，草稿箱确认当前浏览器本地草稿。API仍保留ORIGINAL_AGREEMENT_REQUIRED，自动暂存和结果回传在后续代码中接入，21:43记录仍为辅助操作证据；详见真实预检研究记录。

小红书 live/fill 支持 confirmation.finish=stay（默认保持页面）、save_draft（暂存离开）、publish（发布）。confirmation.originalAgreementAccepted=true 是调用方记录用户已同意当前原创须知，不等同于 content.declareOriginal=true。rednote-finish.ts 按已核对快照、一次性 submit-intent 和唯一按钮执行；真实草稿凭页面保存证据回传 draft_saved（browser_local），发布成功提示仅回传 submitted，不能当作公开发表。断线和未知结果只核对、不再点击。新增能力的真实验收状态见 docs/research/2026-10-08-xiaohongshu-live-preflight.md。

小红书原创须知入口兼容普通链接及 `.custom-link.alink` 文字控件；文字控件必须唯一且协议提示全文匹配已观测内容，仍须 originalAgreementAccepted=true。文字入口不暴露URL，因此该校验不代表远端协议版本检测。

小红书预览图片按原顺序核对：优先比较文件摘要；字节不同则比较相同尺寸的完整解码像素摘要，只接受无损重新编码，不按视觉近似放行。像素核对限制单图2000万像素，超限或不一致仍返回 IMAGE_ORDER_UNCONFIRMED。

2026-10-08 22:48：小红书接口自动暂存端到端通过，任务40ebe6aa-d57a-4b4f-a1fc-3cf417276c9e。7图8话题、精确合集AI落地、原创同意和声明、最终暂存及draft_saved/browser_local证据回传均由执行器完成，浏览器仅只读核对。此前“待实机验收”描述按本条更新；公开发布及其他平台仍未验收。详见真实预检研究记录最后一节。

2026-10-08 22:55：用户明确授权后，小红书本套素材通过接口自动发布成功，作品6ac7aeda000000001a021cd9，任务00d66529-2ccc-4bb5-b7ae-49ef0d94e1c1。API自动回传submitted；浏览器只读核对已发布分类及作品详情确认发表。published状态与作品URL自动回传仍未完成；此前“公开发布未验收”描述仅就本次账号素材由本条更新，其他平台与场景不扩大。

发布后只读核对模块 `MultiPost-Extension/src/sync/dynamic/rednote-result.ts`（子项目内路径 src/sync/dynamic/rednote-result.ts）读取创作后台作品ID及提交时间窗口，结合公开详情作者、原文、话题和图数确认 published；模块不得上传或点击发布。实现与验收进度见研究记录。

小红书发布后由 `rednote-result.ts` 只读核对创作后台候选及公开作品，核对账号、提交时间窗口、标题、正文、话题和图片张数；通过后回传 published 和作品链接。submitted 支持再次 reconcile，仅核对，不重新上传或提交；证据不足保留已知已提交状态。工作台显示作品链接。2026-10-08 23:29，通过接口对既有作品执行只读 reconcile，已自动回传 published 和 canonical URL；审核中、拒绝等分支仍未实机验收。


### 2026-10-09 视频及多平台开发进度

`MultiPost-Extension/src/sync/media-stage.ts` 为隔离页面提供有期限、分块摘要校验的视频暂存；`rednote-prepare.ts` 新增 video 分支，横竖封面分别定位上传，合集与原创沿用精确参数，`rednote-finish.ts` 提交前复核各封面槽位。视频及封面总传输预算128 MiB，准备窗口90秒；取消或传输中断不得上传。`src/haiqiai/platform-account.ts` 负责 X、抖音、脉脉只读身份核对，`src/sync/dynamic/x-prepare.ts` 为 X 文字/最多4图填写保持入口，API拒绝其最终提交。抖音与脉脉当前仅 prepare，公众号尚未开放。新视频和 X 填写代码已实现但真实兼容性未验收，用户选择明天重载；详情见 `docs/research/2026-10-09-video-and-platform-acceptance.md`。正式视频素材清单见 `publishing-materials/2026-10-09-cli-skill-mcp/content.json`。以上不覆盖既有小红书图文发布验收结论。

视频编辑页可能包含多个同源预览 video 元素；准备与最终动作核对所有就绪预览的 currentSrc 和 duration 一致，再按原素材摘要核验。不同来源的预览仍停止。2026-10-09接口视频任务已上传到正确账号，但旧版唯一元素判断导致 VIDEO_UPLOAD_UNCONFIRMED，未填写/存草稿/发布；修复版待下一次重载，保留原编辑页不重传。

新增 `POST /v1/targets/:id/continue-video` 原页接续，限Skill/管理身份请求已停止的live小红书video、原因VIDEO_UPLOAD_UNCONFIRMED、未提交且未取消的目标。保留原内容/finish/账号/安装/editor，领取时固定previousRunId；重新获得一次性prepare-intent后仅核对原页视频摘要并继续空文案填写，不重新上传。旧页已编辑、原执行未结束、素材不符、标签页丢失均停止。普通resume仍禁止已开始填写的任务。真实原页接续待重载验收。

原页接续停止证据修正：页面临时记录可能随扩展重载消失。claim从API持久化attempt读取previousStoppedAt，可信后台传入原页入口；临时记录缺失时只允许有效的已停止证明，并继续强制原标签页、空文案、视频大小及SHA256核验。仍存在的旧记录若未停止/ID不符仍拒绝。CONTINUATION_UNVERIFIED且存在原接续链的已停止任务可再次显式请求continue-video，不能重传或改变finish。该规则替代上文“缺临时记录一律拒绝”。

发布任务创建按内容类型分入口：`POST /v1/tasks/dynamic`（文字/图文动态）、`POST /v1/tasks/video`（视频）、`POST /v1/tasks/article`（文章）。接口固定内容类型，`content.type`可省略；显式传入其他类型返回CONTENT_TYPE_MISMATCH，不能一批混合类型。每个targets条目按platform做平台字段/能力校验，再由扩展按platform+类型选择适配代码；三入口共用原任务队列、幂等、账号目标、防重复、租约和结果查询。旧POST /v1/tasks仅为既有调用兼容保留，新Skill调用必须使用类型入口，不以入口存在表示对应平台已验收。

视频正文预览修复使用 `.publish-page-preview .user-desc-wrapper2`；continue-video 对 CONTENT_MISMATCH 可原页接续，仅原标题正文完全一致且无话题时跳过写入，并继续核对视频摘要。230项测试和两种构建通过，实机接续、横竖封面与草稿仍待验收。当前API准备入口尚未收拢到上游视频脚本，后续按已确认的复用规则调整，详见视频与平台验收记录。

小红书单封面接续可由continue-video的coverSelection明确选择原横版或竖版素材；选择记录与原content分开保存且不可再次修改。原页正文、原生话题全部匹配才跳过填写；单封面画布像素核对、完成后预览及最终动作前复核均通过才继续。该路径尚待重载实机验收，详见2026-10-09视频验收记录。

小红书封面上传后还需选择button.uploaded-thumbnail候选图。COVER_IDENTITY中断的已确认单封面任务可原页接续，coverAlreadyUploaded由服务端原记录产生，执行器验证现有候选图摘要后选用，不再上传。上游video/rednote.ts同步修正新封面入口及完成按钮；实机完整保存仍待下一次加载验证。

acceptCoverCrop仅记录用户对本篇已选封面裁切的确认，不是全局偏好；原素材摘要和选中状态仍须核对，未绑定具体裁切像素。实际接续前须只读检查预览与已确认画面一致，不能宣称完整像素锁定。

小红书视频加入合集后，预览节点可能从 `.user-desc-wrapper2` 切为 `.user-desc-wrapper`，两种均须唯一且内容全等。已完成封面、已接受裁切但 PREVIEW_MISMATCH 的原页接续需调用方只读核对当前封面后提交 `confirmedCoverPreviewSha256`（背景图引用字符串摘要）；API限已停止且未提交的原任务，扩展核对摘要后保留封面，不重新上传或打开裁切。引用摘要不等于图片像素摘要；参数和验收见 publishing-api README 与视频研究记录。

2026-10-09 11:52，小红书视频原页接续实机已完成：原视频/正文/5话题、用户接受裁切的单横版封面、精确AI落地合集，经API自动暂存离开并回传draft_saved（browser_local）；草稿箱同标题9:02视频确认。此为多次接续验收，不代表新任务一次运行、双封面、视频原创或公开发布通过，详见视频验收记录。

小红书多个播放器可使用独立blob地址。素材身份只从唯一 `.hide-view-for-exact video.exact-video` 原视频节点读取，须匹配原文件大小和SHA256；其他播放器核对时长与完整地址集合稳定性，不声称逐个字节一致。准备结束再核对原节点、源地址、固定时长及集合，最终动作前要求快照一致；兼容旧单地址快照。当前实机已定位隐藏评论播放器地址读取失败，原视频节点可读性仍待重载验证，详见视频验收记录。

视频核对异常按读取地址、读取响应、读取字节、计算摘要分阶段记录；只回传固定错误码、预览序号和白名单异常类型，原始异常文本与URL不写入原因。仅既有原页接续、旧执行已停止且尚无文字/话题/封面完成标记的准备中断可重新核对；previousResultCode由服务端产生，原空文案/视频摘要检查仍执行，不重传。真实根因仍待诊断版实机采集。

小红书TOPIC_NOT_FOUND可经continue-video接续原页：API设置topicsInProgress并保留原执行停止证明；入口要求标题正文、已选原生话题前缀顺序和唯一待选#话题尾部全部匹配，跳过已填及待选文字插入，继续精确选择。单话题候选最多等待30秒，仍受总准备期限约束；验证中断链继承进行中标记，进入封面阶段清除。当前视频原文件核对已实机通过，第三个话题接续待重载验收。

2026-10-09 14:10，第二个视频测试任务经API多次原页接续已保存browser_local草稿；原视频摘要核对、5话题（含中断接续）、横版裁切确认、AI落地合集及draft_saved回传通过。草稿箱2篇对应两次授权测试。仍不是新任务单次调用全自动验收，后续需收敛初始封面参数和中断接续流程。

小红书单封面原页接续在候选临时链接失效/读取失败时，只允许对已上传、完整加载且尺寸一致的候选原图进行完整解码像素SHA256核对；与原素材像素全等才继续，画布跨域不可读或不一致仍停止。新上传不使用此回退，成功读取但字节不符仍拒绝。修复待重载实机验收。

国内平台、海外平台与整合的历史调研分别见 `docs/research/2026-10-08-domestic-publishing-capabilities.md`、`docs/research/2026-10-08-global-publishing-capabilities.md`、`docs/research/2026-10-08-publishing-integration.md`；用于查来源与边界，不覆盖当前开发规则和最新验收。
