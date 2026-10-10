# clip publish 架构

本说明按 2026-10-10 当前代码整理。GitHub 仓库和根包名为 `qiushui-clip-publish`，扩展显示名称为“clip publish”；当前检出目录为 `qiushui-clip-publish`。

## 模块边界

| 模块 | 入口与职责 |
| --- | --- |
| WXT 宿主 | `wxt.config.ts` 统一构建 Chrome/Firefox 扩展，接入 Vue 与 React |
| 剪藏 | `entrypoints/content.ts`、`kdocs.content.ts`、`general.content.ts` 提取页面；`popup/App.vue` 编排预览、保存、复制 Markdown 与另存为 |
| 设置 | `entrypoints/options/` 配置笔记库、图片、Get 笔记、模型与系统提示词 |
| 抖音收藏 | `entrypoints/douyin-sidepanel/` 配合 `src/douyin/` 收集、选择、断点导入 Get 笔记 |
| 发布页面 | `entrypoints/publish/main.tsx` 接入 `MultiPost-Extension/src/haiqiai/PublishingWorkspace.tsx` |
| 发布执行后台 | 子项目 `src/haiqiai/connection.ts` 处理配对、心跳、任务与可信消息；`simulation.ts` 处理模拟任务，`preflight.ts` 处理真实任务 |
| 平台适配 | 子项目 `src/sync/` 保留 MultiPost 图文、视频、文章脚本；当前 API 真实填写接入 `dynamic/rednote-prepare.ts`、`rednote-finish.ts`、`rednote-result.ts` 和 `x-prepare.ts`，抖音、脉脉仅只读预检 |
| 发布 API | `packages/publishing-api/` 独立 Node 24.13+ HTTP/SQLite 服务，保存身份、素材、不可变任务快照、租约与证据 |
| 发布 Skill | `skills/qiushui-publishing/` 调用 API；不自动安装到全局技能目录 |

`MultiPost-Extension/` 保留上游 Plasmo 配置、依赖、LICENSE 与 README；根 WXT 打包显式接入的发布模块，其余上游代码仍独立构建。根构建与 Vitest 共用 React/ReactDOM/HeroUI 实例，避免重复 React。干净检出时也需安装子项目依赖，否则根 WXT 构建无法解析 `plasmo/templates/tsconfig.base`；安装步骤见根 README。

已删除 `packages/content-publishing-workbench/`、`packages/publisher-playground/`、`src/publisher/`、创作侧边栏及书签管理模块；相关历史文档不表示当前可用功能。浏览器收藏夹与历史存储数据不主动清除。

## 剪藏数据流

1. 弹窗通过 `tabs.sendMessage(EXTRACT_DOC)` 请求当前页。飞书与金山文档滚动触发懒加载，返回结构化文档块；通用网页直接返回 Markdown。
2. `src/extractor/` 解析页面，`src/converter/` 将块和行内样式转换为 Markdown、生成 frontmatter 与安全文件名。
3. `useFileSave.ts` 获取图片，经本地保存或 OSS 上传生成引用；`src/filesystem/` 使用 File System Access API 写入授权笔记库。
4. 直接保存 Get 笔记链接由 `src/getnote/api.ts` 调用链接笔记接口。抖音收藏批量导入保存进度后可继续。

图片模式为 `local/per-note`、`local/shared`、`oss`；OSS 当前仅阿里云，HMAC-SHA1 签名使用 Web Crypto。

## 发布数据流

开发发布功能前必读 [MultiPost 发布技术架构](multipost-architecture.md)，其中说明职责分工、任务参数与默认测试范围。

1. 管理端登记电脑、账号、浏览器配置与默认目标，生成一次性配对码和独立 Skill 密钥。
2. Chrome 发布页发送 `HAIQIAI_PUBLISHING_CONNECTION` 消息；后台只接受本扩展 `publish.html` 调用，保存安装专属凭据，每 30 秒发送心跳。普通网页不能通过该消息获取密钥。
3. Skill 上传素材并通过 `/v1/tasks/dynamic`、`/v1/tasks/video` 或 `/v1/tasks/article` 创建任务，目标包含平台、账号、电脑和可选浏览器配置。API 校验权限、幂等键、内容类型与素材，固定执行安装及快照。
4. 扩展领取模拟或真实任务，核对当前账号和素材，再按明确授权进行只读准备、上传填写、保持页面、保存草稿或发布。平台脚本负责实际浏览器操作。
5. 执行事件与结果回传 API。`draft_saved`、`submitted`、`published`、需人工处理、失败、结果未知分别表示不同证据；`reconcile` 只读核对已有结果。视频 `continue-video` 在原任务、原安装和原页面上按白名单接续，不能作为重发入口。

模拟草稿仅保存在 API；它不能证明平台已保存草稿。提交后结果未知时保留任务并核对，避免重复上传或提交。完整字段、幂等、租约、授权及接续参数见 [API 文档](../packages/publishing-api/README.md)。

## 存储与平台差异

- `browser.storage.local`：剪藏设置、AI 平台与提示词、抖音导入进度；发布后台另存连接和执行状态，存储访问限制为可信扩展上下文。
- IndexedDB：已授权的 `FileSystemDirectoryHandle`。
- 用户笔记库：Markdown 和本地图片；OSS 模式图片在云端。
- `.haiqiai-publishing/`：SQLite、管理密钥、回执密钥、素材和 Skill 运行回执，已从 Git 排除；改项目目录时随目录移动，跨电脑不会由 Git 同步。
- 平台登录 Cookie、原编辑标签页和浏览器本地草稿保留在执行浏览器。

抖音收藏页点击扩展图标打开侧边栏，其他页面使用剪藏弹窗。Chrome 从弹窗或设置页进入发布工作台；Firefox 隐藏发布入口且不注册发布连接后台。

## 代码与真实验收

根目录 `pnpm compile` 检查 WXT/Vue 及显式接入的代码；子项目保留自己的类型配置。`pnpm exec vitest run --maxWorkers=1` 覆盖 `tests/` 和 `MultiPost-Extension/tests/`。`pnpm build`、`pnpm build:firefox` 构建根扩展；`pnpm --dir MultiPost-Extension build` 构建独立上游子项目。

API 测试需要 Node 24.13+，使用临时 SQLite 与本地 HTTP 监听；运行测试不等于真实平台发布验收。当前小红书图文已有自动暂存、发布及只读结果核对证据；视频多轮原页接续暂存已有证据，新任务单次完成与最新封面修复仍待验收。X、抖音、脉脉及其他平台不能由上游脚本存在推定为完整可用。详见 [当前交接](research/2026-10-10-publishing-handoff.md)。

## 文档维护与兼容名称

根 `AGENTS.md` 只维护长期规则和按任务读取的入口；发布开发细则见 [发布开发规则](agents/publishing-development.md)，子项目规则见 `MultiPost-Extension/AGENTS.md`。技术说明、接口文档、术语与带日期验收各自更新，导航见 [文档入口](README.md)。

更新服务仍使用 `http://version.qiushui.me/qiushuiai-web-clipper.json`。这是已有外部接口，未随仓库名称迁移；重命名不会更改凭据字段、数据库标识、浏览器账号或任务 ID。
