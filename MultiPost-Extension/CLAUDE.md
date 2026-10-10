# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MultiPost is a browser extension that enables one-click content publishing to multiple social media platforms. Built with Plasmo framework, it supports 30+ platforms including Zhihu, Weibo, Xiaohongshu, Bilibili, X, Instagram, and more.

## Development Commands

```bash
pnpm dev          # Start development server with hot reload
pnpm build        # Build and package extension for production
pnpm lint         # Run ESLint
pnpm lint:fix     # Auto-fix ESLint issues
```

**Note:** Run commands in `MultiPost-Extension/`. After source changes, run `pnpm build` to verify the extension. Keep this file and `AGENTS.md` identical.

## Architecture

### Content Types

The extension handles four content types, each with platform-specific implementations:

- **Dynamic** (`src/sync/dynamic/`): Short-form posts (text, images)
- **Article** (`src/sync/article/`): Long-form articles with HTML/Markdown
- **Video** (`src/sync/video/`): Video uploads with metadata
- **Podcast** (`src/sync/podcast/`): Audio content

### Core Data Structures (`src/sync/common.ts`)

- `SyncData`: Main payload containing platforms list, content data, and auto-publish flag
- `PlatformInfo`: Platform configuration including inject URL and function
- `DynamicData`, `ArticleData`, `VideoData`, `PodcastData`: Content-specific interfaces

### Platform Integration Pattern

Each platform has an `injectFunction` that:
1. Opens the platform's publishing page (`injectUrl`)
2. Uses DOM manipulation to fill in content
3. Handles file uploads and form submissions

Platform maps: `DynamicInfoMap`, `ArticleInfoMap`, `VideoInfoMap`, `PodcastInfoMap`

### Extension Components

- **Background** (`src/background/`): Service worker handling message routing, tab management, API services
- **Popup** (`src/popup/`): Extension popup UI
- **Sidepanel** (`src/sidepanel/`): Side panel interface
- **Content Scripts** (`src/contents/`): Page helpers and scrapers
- **Tabs** (`src/tabs/`): Standalone pages (publish, refresh-accounts, trust-domain)

### Message Flow

Background script (`src/background/index.ts`) routes messages:
- `MULTIPOST_EXTENSION_PUBLISH`: Opens publish popup
- `MULTIPOST_EXTENSION_PUBLISH_NOW`: Creates tabs and injects scripts
- `MULTIPOST_EXTENSION_PLATFORMS`: Returns available platforms
- `MULTIPOST_EXTENSION_GET_ACCOUNT_INFOS`: Returns logged-in account info

## Tech Stack

- **Framework**: Plasmo 0.90.5 (Manifest V3)
- **UI**: HeroUI + Tailwind CSS
- **Icons**: lucide-react (prefer over @iconify/react)
- **Storage**: @plasmohq/storage

## Code Conventions

### TypeScript
- Use interfaces over types
- Use maps instead of enums
- Use functional components with TypeScript interfaces
- Naming: PascalCase for components/interfaces, camelCase for functions/variables, SNAKE_CASE for constants

### Styling
- Mobile-first responsive design
- Use `bg-background` and `text-foreground` for theme support
- Use semantic color variables (e.g., `bg-primary-600` not `bg-blue-600`)
- Use `gap` for spacing instead of margins

### i18n
- Store translations in `/locales/[locale]/messages.json`
- Use `chrome.i18n.getMessage('key')` for all UI text
- Default locale: `zh_CN`
- Console.log statements do not need i18n

## Adding a New Platform

1. Create platform handler in appropriate directory (`src/sync/dynamic/`, `src/sync/article/`, etc.)
2. Export inject function that manipulates the platform's DOM
3. Add entry to corresponding InfoMap (e.g., `DynamicInfoMap` in `src/sync/dynamic.ts`)
4. Add account getter in `src/sync/account/` if platform requires login detection
5. Add i18n keys for platform name

## HaiqiAI integration

`src/haiqiai/` holds the integrated React/HeroUI publishing workspace, local messages and styles. The root WXT build hosts it through `entrypoints/publish/` and copies its messages into extension locales. Run integrated checks and `pnpm build` from the repository root when editing this module. Original Plasmo entrypoints remain upstream reference and are not loaded by WXT. The workspace pairs with a self-hosted API through `connection.ts`, registered by the root background. It uses a separate message namespace and trusted-context local storage, reports 30-second heartbeats, and displays accounts without claiming login verification. `simulation.ts` consumes only explicit simulation tasks, checks assets as a stream and persists claim/event recovery data before reporting a simulated draft. `i18n.ts` shares localized messages. The workspace lists task snapshots and reasons. The simulation worker queries saved attempts after restart, renews leases every 30 seconds during downloads, persists bounded retry times, records submit intent, and only reconciles after intent. The workspace exposes read-only reconciliation and interruption reasons. Live finishing uses one-shot submit intent and page stop/result evidence; installed-extension acceptance remains pending. The API lives in root `packages/publishing-api/`; management and protocol instructions are in its README.

`src/haiqiai/rednote.ts` inspects the sole open Xiaohongshu creator tab through the trusted workspace message. It returns only selected DOM observations, never uploads, submits, or treats the visible creator account number as verified platform identity.

`src/sync/dynamic/rednote.ts` is preparation-only: it rejects `isAutoPublish`, missing images and unverified tag/video fields; any image download/size/type failure stops before assigning the file list. It no longer clicks publish or navigates to the note manager. This upstream entry is not yet wired into live API execution, and upload completion/draft/result verification remains pending platform acceptance.

MultiPost 的平台入口回归测试位于 `MultiPost-Extension/tests/`，由根目录 `pnpm exec vitest run` 一并执行；它们继续使用子项目类型配置，不进入根项目类型检查。

`src/haiqiai/preflight.ts` handles explicit live/prepare tasks as read-only preflight: separate claims, public-profile/creator-home account-number cross-check, streamed asset verification and durable reason events. This read-only action never injects uploads or submission; the separate fill action is described below. The read-only action reports READONLY_CHECKED as needs_attention; no draft/publish success is permitted. `rednote.ts` accepts an expected profile ID and returns ACCOUNT_MATCHED only when that profile's account number matches the creator home. Missing/ambiguous evidence remains unverified. This is a snapshot, not final-submit authorization.

`src/sync/dynamic/rednote-prepare.ts` is the isolated upload/fill entry. The integrated runner retains read-only prepare and separately authorizes live/fill: fresh creator-home checks, verified image bytes, a new empty editor, exact native topics and preview comparison. API prepare-intent permits one injection with a maximum 90-second deadline. Interrupted preparation never reuploads automatically; keep the original page for inspection. For finish=stay, success means needs_attention / AWAITING_PUBLISH_CONFIRMATION, not saved draft or published. PNG/JPEG/WebP, up to 18 images, combined 32 MiB transport budget. Automatic 7-image/8-topic filling was observed; the collection selector fix was verified; parameter-driven finishing and complete result reconciliation still require installed-extension acceptance.

Xiaohongshu dynamic supports optional collectionName and declareOriginal. Match exactly one collection label; never fuzzy-select. The originality agreement modal returns ORIGINAL_AGREEMENT_REQUIRED unless originalAgreementAccepted=true records explicit user consent. Recovery reads the actual finished flag or confirms the page closed; API clock expiry alone is not stop proof. Preserve any saved page result and its concrete reason. Preview image bytes or full decoded pixels must match the ordered originals; lossy platform recompression remains unconfirmed.

The initial Xiaohongshu collection chooser uses `.collection-plugin-button`; after selection it becomes `.collection-plugin-choose`. Support both states. The real 7-image/8-topic fill reached collection selection; remaining collection/originality settings were completed through browser UI, not an executor success event. See the root live-preflight acceptance log for this boundary.

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
