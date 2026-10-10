# 小红书真实任务只读预检验收

## 范围与结论

2026-10-08，#32 部分交付。接通本机 API → 已配对 Chrome 扩展 → 小红书页面账号只读核对 → 素材完整性核对 → 原因回传。未接入图片上传、话题填写、草稿保存、最终提交或平台发表结果确认，不能关闭 #32 或将 capability 标为 verified/autoPublish。

## 素材与目标

- 素材：`publishing-materials/2026-10-08-enterprise-ai-fde/`，标题“企业AI落地，别只问多久能上线”，7 张原 PNG、8 个独立话题；原文字和图片顺序完整保留。
- 用户先提供“我叫秋水”的主页，经页面核对为小红书号 27786321025，不等于当前创作账号；未错误绑定。
- 用户随后明确选择“秋水聊AI落地”，提供正确主页：
  `https://www.xiaohongshu.com/user/profile/6a275c1f0000000001007c00`。
- 主页及创作首页均观测到小红书号 27731394763。稳定 ID 来自指定主页 URL，小红书号用于跨页面交叉核对，昵称不作为身份凭证。临时链接参数不登记到 API。
- 执行端：用户电脑 Chrome / 用户配置 1，安装 ID `d98d3117-903f-4fe4-a1e7-9d29c368093d`。
- 本机开发 API：`http://127.0.0.1:43129`，数据及凭据存忽略目录 `.haiqiai-publishing/`。不是远程部署或常驻生产服务。

## 实际证据

- 7 张图片使用独立 Skill 凭据流式上传，全部 ready；长度、SHA-256 与素材包清单一致。
- 任务 `69b867ce-98b1-4aab-a54a-d821b2ec9cf9`，目标 `8eff732f-95da-4746-83de-2a14721cc5b4`。
- `executionMode=live`，`confirmation.action=prepare`。publish/save-draft 未开放。
- 第一次扩展领取返回 ACCOUNT_UNVERIFIED：当时个人主页已切换至首页。重新打开正确主页，通过 resume 恢复同一目标，没有新建重复任务。
- 第二次账号观测 `matched`，服务器时间 `2026-10-08T11:57:08.921Z`。扩展完成 API 素材长度/摘要核对。
- 当前状态 `needs_attention`；阶段 `validation`；原因 `UNSUPPORTED_FIELD`：
  “账号及素材已核对；content.tags 的独立话题填写尚未验收，全部话题已保留，未上传或发布。”
- 接口完整回执在 `.haiqiai-publishing/real-task-observed.json`，不入 Git；恢复后应查询最新状态，不把此记录当实时状态。

## 测试与审查

- 全套 28 文件 / 177 测试通过；后续补充真实预检素材损坏和事件回执丢失断言后，发布相关 23 测试再次通过。
- 根类型检查、Chrome 构建通过；Firefox 构建跳过发布页，保留剪藏。
- 双轴 code-review：规范审查发现真实任务异常误用模拟提示，已修复；规格审查未发现只读范围内的阻断问题，但明确完整发布尚缺。
- 模拟器缺省只领取 simulation；live 显式领取，共用安装单执行锁。
- live 不得获得提交意图，不得声明模拟草稿、草稿保存或发表成功。
- 真实预检仅执行 DOM 读取及 API 下载，因此当前 recover 的停止证明仅适用本范围。未来加入页面写入必须重新设计/验证，不能直接复用。

## 浏览器操作限制与后续

浏览器工具拒绝访问 chrome-extension 内部地址，并明确禁止通过其他自动化界面绕过。用户已手动完成配对，后续通过 REST 与扩展 alarm 验收；并未伪造扩展配对或直接写入浏览器存储。

需继续实现：新鲜登录会话复核、真实图片上传完成/顺序/预览核对、独立话题精确选择、提交前授权、页面停止和恢复、平台草稿/提交/审核/已发表证据及未知结果核对。当前 DOM 账号匹配只是一份页面快照，不是后续发布许可。

## 后续开发：上传填写（尚待扩展重载后实机验收）

新增独立 `confirmation.action=fill`，原 `prepare` 保持只读。填写仍不发布、不主动保存草稿。新适配入口为 MultiPost 的 `src/sync/dynamic/rednote-prepare.ts`，按顺序上传，使用实际观测的标题、正文与原生话题选择器，逐项精确匹配话题，再核对手机预览；不覆盖已有内容的编辑页。页面可能自动保存。

填写前打开新的创作首页复核账号；下载完成后再核对一次。素材长度与 SHA-256 在后台验证，页面只接收图片字节，不接收 API 密钥。当前单任务图片总大小受传输预算限制为 32 MiB（不是平台限制）。适配器接受 PNG/JPEG/WebP，最多18图，具体上传与预览仍以页面结果为准。

API `prepare-intent` 持久化编辑页编号及最长90秒的写入截止时间，只授权一次。后台重启/注入响应丢失不能再次上传；重启后读取原页的实际结束标记，有明确结果则保留原因；页面未确认停止时不释放执行锁。API返回durationMs，执行端从请求开始时刻换算本机截止时间；页面逐次写入检查，续租失败请求停止。API服务器时间到期本身不算停止证明。已开始填写的任务禁止 resume/reconcile 重新领取；当前只能人工检查原页面，自动只读恢复核对仍待补齐。`AWAITING_PUBLISH_CONFIRMATION` 是需人工处理原因，不是已存草稿或已发布。

已从实际创作页验证：输入话题后，建议列表在 `#creator-editor-topic-container .item .name`；选中精确名称后生成 `a.tiptap-topic[data-topic]`，名称可从 `data-topic.name` 核对。仍须通过新构建的扩展对7图8话题完整运行，单元测试不能替代此验收。


### 合集与原创参数

小红书 dynamic 的 `content.collectionName?: string` 和 `content.declareOriginal?: boolean` 随不可变内容快照传递，并参与内容摘要。其他平台拒绝这两个参数。合集名称最多200字符、不能为空；保留原值、不做模糊匹配。列表中必须只有一个完全同名合集；找不到/重名/选中未确认分别回传明确原因。省略字段不主动设置，false 明确关闭原创开关。

`declareOriginal:true` 打开原创开关后，如果出现“原创声明须知”弹窗，回传 ORIGINAL_AGREEMENT_REQUIRED，并保留页面供用户确认，不自动同意须知或点击声明按钮。开关已勾选但弹窗尚在，不算声明完成。两项参数在工作台内容快照中展示。

页面图片预览的 blob 字节按顺序和原素材摘要核对；若平台压缩或重排导致无法一致，返回 IMAGE_ORDER_UNCONFIRMED，需人工检查，不能声称已自动确认原顺序。

### 本轮验证结果

- 28个测试文件、183项测试通过；根类型检查、Chrome构建及MultiPost独立构建打包通过。Firefox构建仍保留剪藏入口。
- 双轴审查发现并修复：远端时间差不能用作停止证明、多段正文换行核对、图片顺序与原素材摘要核对、能力说明及中文原因、重启后明确原因保留。复核均无阻断项。
- 真实页面已读取合集列表及原创声明弹窗；集合项为 `.collection-plugin-popover-content .item-label`，原创控件为标签“原创声明”对应的 `.custom-switch-card .d-switch`。开启时弹出《原创声明须知》，未接受须知，已关闭弹窗并恢复未勾选状态。旧合成测试页的既有“AI落地”合集保持原状。
- 本机开发API已用新代码重启，Skill只读请求200、Chrome安装在线。未提交新的fill任务；等待用户重载扩展及确认本套素材的合集/原创参数。浏览器工具内部页面限制不能通过改用电脑控制绕过。
- 未点击发布或主动保存草稿。7图8话题及新增设置的完整实机执行仍未验收，不关闭#32。

## 实机填写验收续记（21:00后）

用户确认扩展已重载，原prepare目标恢复后返回 READONLY_CHECKED，证明新代码生效。用户明确本套素材加入“AI落地”合集并声明原创。

- 新fill任务：`7b6bde32-907f-4f1d-9ec4-52aa1c814893`；目标：`94659799-0d46-4f22-935d-ea171f460672`；原编辑页：`2019532863`。
- 扩展自动完成7张图片上传、标题、完整正文和8个原生话题。页面显示7/18，七张均解码为1086×1448；截图缩略图顺序与素材包相符。原生话题的data-topic.name按顺序与输入一致，编辑器和手机预览textContent一致。
- 自动执行在合集处回传 needs_attention / COLLECTION_CONTROL_MISSING。根因：未选合集时入口为 `.collection-plugin-button`，已选时才是 `.collection-plugin-choose`。已用该差异使测试失败，再增加两种入口支持，8项平台入口测试、根类型检查和Chrome构建通过。此修复尚未在已装扩展重载后重新执行；未重新上传或新建重复fill任务。
- 通过浏览器UI在原页精确选择唯一“AI落地”，打开原创须知。用户明确同意本篇《原创声明须知》后，勾选协议并点击“声明原创”；随后弹窗已关闭、原创开关checked=true。未点击发布、未主动存草稿。
- 页面截图：`/tmp/haiqiai-xhs-seven-images-filled.png`；完整请求/回执存 `.haiqiai-publishing/fill-task*.json`。最终页面设置由人工辅助完成，API保留原始暂停原因，不伪造扩展成功事件。
- 原图blob摘要顺序核对尚未由执行器走完：执行器在合集处先停止；当前只有DOM和可视顺序证据，不能把截图当逐字节完整性证据。只读页面复核回传、最终授权提交及平台发表结果仍需继续开发和验收；#32不关闭。

## 接口重新填写并暂存验收（21:21后）

用户要求通过接口重新测试，填好后点击“暂存离开”；本轮只授权草稿，不授权公开发布。

- 重载后新建fill任务 `19c7224b-94a4-4110-8c92-20ad9a671aab`，目标 `5ca499cd-ea5d-41db-9559-e02e20410520`，页面 `2019532878`。账号核对及素材下载后，返回 needs_attention / PAGE_NOT_READY。页面仍在默认视频上传页，没有上传图片或填写正文。
- 代码原先只在切换图文前立即检查一次入口，页面延迟渲染会提前退出。增加延迟出现入口的回归场景后复现 PAGE_NOT_READY；改为等待唯一可见入口，随后等待多图上传框。9项平台测试、根类型检查、Chrome构建及MultiPost独立构建通过。现场原因与延迟渲染吻合，但仍须重载后真实验证。
- 未复用失败任务做再次上传；等待用户加载修复版，再发新的明确重测任务。

## 重载后的接口填写与暂存结果（21:43）

- 新任务 `ecf21200-814c-46a0-bdde-d3a4e107e71e`，目标 `81a8a830-7451-4d12-abe4-f78a9023e55d`。本机API未运行时请求连接拒绝；恢复服务后沿用同一幂等回执提交。账号预检因个人主页关闭暂停；重新打开已确认主页后resume恢复同一任务。
- 编辑页 `2019532919`：扩展自动完成7图、标题、正文、8个原生话题、唯一全等“AI落地”合集。等待入口及合集修复实机通过，API返回 `needs_attention / ORIGINAL_AGREEMENT_REQUIRED`。
- 按此前对同一篇内容及须知的明确授权，由浏览器辅助完成原创声明，页面显示“已声明原创”；七图均1086×1448，正文和话题已核对。
- 按本轮授权点击“暂存离开”，平台显示“保存成功”，草稿箱图文笔记(3)出现本篇，保存时间2026-10-08 21:43:04。旧草稿未删除，未点击发布。截图 `/tmp/haiqiai-xhs-draft-saved.png`。
- 平台说明草稿保存在当前浏览器本地，清除浏览器数据会删除。确认的是本地草稿保存，不是云端发表。
- API仍保留原创须知的原暂停原因，未伪造已存草稿事件。自动暂存/结果回传未接入；执行器最后的blob摘要顺序核对因原创弹窗先停止而未完成，不能宣称全自动端到端验收。

## 参数化完成动作开发（22:12）

- `confirmation.finish` 支持 `stay`（默认）、`save_draft`、`publish`；`content.collectionName` 严格全等且唯一，`content.declareOriginal` 控制原创。`confirmation.originalAgreementAccepted` 单独记录已取得的原创须知同意，不以原创开关推定同意。
- `rednote-finish.ts` 在准备快照复核、新鲜账号复核、一次性 submit-intent 后点击指定按钮。保存成功且离开编辑器才能报 `draft_saved`，存储范围 `browser_local`；发布成功提示只能报 `submitted`，不冒充公开发表。
- 响应丢失不重复上传或点击；过期迟到回执先确认停止再排队只读核对。原页可观察晚到成功，但用户输入、原标题元素/值变化或无成功证据的离开编辑器会停止结果归属，避免另一篇保存串入原任务。
- 195 项测试、根类型检查、Chrome/Firefox 构建和 MultiPost 独立构建通过；双轴审查发现的问题已修复并复核。测试包含三类断线、租约过期迟到回执、超时后成功及编辑另一篇不误判成功。
- API已使用新代码重启；当前等待扩展重新加载，再用此前确认的同一套素材自动暂存。此时仍不能宣称参数化暂存实机通过，未公开发布。

## 参数化暂存首次实机复测（22:27）

- 任务 `0c54f826-321b-4591-99f2-fd78fc11ca6e`、目标 `90f8fa67-bbeb-4507-b6fa-4a2d7a11eaa2`。请求回执 `.haiqiai-publishing/finish-draft-result.json` 确认 finish=save_draft、originalAgreementAccepted=true 已入队。
- API最初未监听，重新启动开发服务后提交成功；目标主页仍为秋水聊AI落地、小红书号27731394763。
- 编辑页 `2019532934` 自动完成7图、原题正文、8话题和AI落地合集，API随后返回 needs_attention / ORIGINAL_AGREEMENT_REQUIRED。原创须知弹窗未勾选，未点击暂存或发布。截图 `/tmp/haiqiai-api-original-paused.png`。
- 新源码仅在未收到 originalAgreementAccepted=true 时返回该原因，而请求回执已确认true；表现与Chrome仍运行旧构建相符，尚未读取实际构建版本证实。等待明确重载后验收。本次不算自动暂存通过，不人工补操作或伪造成功；保留原页，不自动重放上传。

## 明确重载后的暂存复测（22:33）

- 任务 e6e67c7e-0a26-4b06-89d0-e919a3d1116e，目标29d9236a-6e03-43f8-890b-26afc20fae2e，编辑页2019532945。原创参数已进入新逻辑，返回 ORIGINAL_AGREEMENT_CHANGED；没有最终提交意图，未点击暂存或发布。
- 原创须知实际为 span.custom-link.alink，没有a/href。浏览器点击文字只读打开后，URL仍为已确认的45ba4b7117054e64b0e730b81e1a4864文档。此次是识别代码误报，不能将原因当成平台真的修改协议。
- 新增真实文字结构测试复现误报；修复为兼容普通链接与唯一文字控件。文字方式核对完整可见协议提示，并仍要求显式同意；不宣称通过无URL控件检测远端协议版本。另有提示变化拒绝场景。
- 原任务保留暂停结果，不手工代点声明/暂存，不篡改API成功。新构建需重载后再验收。
- 修复后12项平台入口测试、根类型检查、Chrome构建和MultiPost独立构建通过。截图 /tmp/haiqiai-original-control-mismatch.png；实机自动暂存仍待修复版重载。

## 原创声明自动完成后的图片检查（22:40）

- 任务2b416e44-1e14-4d45-aeba-fd2028f7cbdf，目标f35b0f90-e7db-4948-bece-823dba56cd19，编辑页2019532960。新版自动完成原创须知勾选和声明，弹窗消失、原创checkbox=true；合集AI落地，7图原题正文和8话题仍在。
- 执行器随后返回 IMAGE_ORDER_UNCONFIRMED，未记录最终提交意图，未点击暂存/发布。所有预览均为1086×1448的同源blob。现有浏览器资源工具无法下载blob，不能据此断言平台压缩或重排。截图 /tmp/haiqiai-original-complete-image-check.png。
- 图片校验原来仅比较文件字节，无法容纳无损重新编码；新增字节不同但解码像素相同测试，先失败后修复。现在同位置文件摘要不同则比较尺寸及全分辨率RGBA像素摘要；不采用相似度容差，有损变化仍暂停。每图上限2000万像素以限制解码内存。
- 13项平台测试、根类型检查、Chrome及MultiPost独立构建通过。图片校验修复仍需扩展重载实机验证，自动暂存尚未验收。

## 接口自动暂存端到端通过（22:48）

- 任务40ebe6aa-d57a-4b4f-a1fc-3cf417276c9e，目标0bdaccea-7005-483c-9e01-2731b9cce953，编辑页2019532971。请求及入队回执保留在 .haiqiai-publishing/finish-pixels-task.json、finish-pixels-result.json。
- 仅以Skill凭据提交live/fill、finish=save_draft、originalAgreementAccepted=true，目标秋水聊AI落地（稳定ID6a275c1f0000000001007c00）、Chrome配置1、合集AI落地、declareOriginal=true。执行器自行完成账号复核、素材校验、7图上传、原题正文、8原生话题、合集精确选择、原创协议勾选及声明、预览和像素顺序核对、提交前账号复核、一次性暂存。此轮浏览器工具只读取结果，没有人工补填或点击暂存。
- API返回draft_saved / reconciliation；submitIntentAt=2026-10-08T14:48:19.389Z，observedAt=2026-10-08T14:48:19.869Z，证据为platform_receipt、finish=save_draft、storage=browser_local，标题与内容摘要关联一致。
- 实际草稿箱显示本篇保存于2026-10-08 22:48:19。截图 /tmp/haiqiai-api-draft-saved-224819.png。列表共7篇，包括此前测试留下的草稿；未删除旧数据。草稿仅在当前浏览器本地保存。
- 小红书本套图文的参数化自动暂存及结果回传已通过。公开发布按钮、审核状态和公开作品链接未实机验收；不能扩大为全部13平台或公开发表验收。

## 用户要求再测一次（22:51）

- 相同账号、素材及设置，新任务32798a4d-cc54-44b1-972a-aef3b0eab145，目标5b6e5763-2fae-4344-8584-8de48937e1a1，编辑页2019532986。首次请求误用了仅适用于未知结果的replacesTargetId，422整批未入队；移除该字段后按用户明确要求新建一次重复验收任务，未重复执行失败请求。
- 全程接口驱动、无浏览器补填或代点；API返回draft_saved/browser_local，observedAt=2026-10-08T14:51:47.771Z。草稿箱新增本篇保存于22:51:47，图文草稿总数8，旧草稿未删除。截图 /tmp/haiqiai-api-draft-repeat-225147.png；最终回执 .haiqiai-publishing/finish-repeat-final.json。
- 连续两次自动暂存端到端通过。未公开发布，本次未修改源代码。

## 用户授权正式发布通过（22:55）

- 用户明确要求本次直接点击发布。沿用此前确认内容、秋水聊AI落地账号、Chrome配置1、AI落地合集及原创声明，任务00d66529-2ccc-4bb5-b7ae-49ef0d94e1c1，目标66b48ac3-7e41-4e79-87bc-7668c5d40d2c，编辑页2019533001。confirmation.finish=publish，执行器自动完成整套填写、原创声明、核对和一次性发布。浏览器工具没有代点发布。
- API返回submitted，平台成功提示observedAt=2026-10-08T14:55:19.279Z；最终回执 .haiqiai-publishing/finish-publish-final.json。
- 浏览器只读后验：创作后台已发布分类包含本篇，时间2026-10-08 22:55；账号个人主页出现本篇，打开作品详情显示对应作者、原标题正文、8个话题和1/7图片。作品ID6ac7aeda000000001a021cd9，规范链接 https://www.xiaohongshu.com/explore/6ac7aeda000000001a021cd9 。截图 /tmp/haiqiai-api-published-2255.png。
- 已确认真实发布成功。API当前仍为submitted：公开作品后验由本轮浏览器只读完成，尚未自动回传published和作品URL，不手工伪造执行器事件。其他平台及多账号、多电脑场景未因本次通过而视为验收完成。

### 发布结果自动核对开发（2026-10-08 23:24）

新增独立只读 `rednote-result.ts`，发布提示后核对账号、创作后台唯一标题/提交时间窗口候选、公开详情作者/正文/话题/图片张数，确认后返回 published 和 canonical URL。审核/拒绝也先核对内容，证据不足保留已知 submitted；不重发。submitted 可再次请求 reconcile。重复素材按原图片列表计数，核对期间续租。

本轮类型检查、202项测试、根WXT和子项目Plasmo构建通过；Standards及Spec复核均无剩余阻塞。等待Chrome重新加载后，对任务 00d66529-2ccc-4bb5-b7ae-49ef0d94e1c1 / 目标 66b48ac3-7e41-4e79-87bc-7668c5d40d2c 执行只读reconcile验收，不创建新发布任务。尚未宣称自动回传实机通过。

### 2026-10-08 23:29 自动结果核对实机通过

用户确认重载后，通过 Skill 凭据 POST /v1/targets/66b48ac3-7e41-4e79-87bc-7668c5d40d2c/reconcile，扩展领取只读核对，未创建新发布任务。核对 attempt 为 b5ab4bd5-b6a8-487a-8080-e30ccb840623。GET 原任务于 2026-10-08T15:29:28.485Z 返回 published，evidence.signal=published，evidence.url=https://www.xiaohongshu.com/explore/6ac7aeda000000001a021cd9，摘要仍为 a190bc38481bdc01e6d1209ab9ddcac5fc8a3faa810abd07f37978beae7137b5。

API 回执确认已核对后台发布时间、作品ID以及公开详情的作者、正文、8个话题、7张图片数量；页面核对全部由扩展执行，没有手动补写结果。证据保存在本机不入库的 .haiqiai-publishing/published-reconcile-result.json 与 published-reconcile-observation.json。本次证明已提交作品的只读核对和结果回传通过；不宣称审核中、拒绝或新发布后即时自动核对分支已完成实机验收。
