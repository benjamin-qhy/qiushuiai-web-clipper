# 视频与其他平台接口进度（2026-10-09）

## 本轮范围及证据边界

用户要求保留 MultiPost 架构，由 API 参数触发所有上传、填写及按钮操作。小红书视频正式素材为 `publishing-materials/2026-10-09-cli-skill-mcp/content.json` 所列原始文件；正文由用户授权补充。视频、横版封面、竖版封面已上传本机 API 素材库，尚未上传平台。本轮不创建实际发布任务。用户选择明天重载扩展，因此新代码的真实页面验收待重载。

此前小红书图文发布及公开作品核对已通过，见 `2026-10-08-xiaohongshu-live-preflight.md`。该证据不能替代视频或其他平台验收。

## 实现状态

| 平台 | 本轮 API 范围 | 真实页面证据 / 待办 |
| --- | --- | --- |
| 小红书 | dynamic 图文既有流程；新增 video 上传、独立横竖封面、合集、原创及 finish 参数 | 已只读看到视频上传框；上传后封面槽位、视频预览及最终动作待实机验收 |
| X | dynamic 文字和最多4图，fill 只允许 stay；拒绝最终发布和视频 | 已核对用户确认的 @MPrasadh24816；附件上传后的 DOM 和填写结果待验收 |
| 抖音 | prepare 只读账号与素材检查；拒绝 fill | 创作首页可见“秋水聊AI落地”、抖音号53839747490；视频与封面填写未接入 |
| 脉脉 | prepare 只读检查；拒绝 fill | 当前发布身份显示匿名，不能据昵称确认账号；返回明确人工处理原因 |
| 公众号 | 未开放真实任务 | 浏览器工具对公众号后台返回网站安全限制；本轮不绕过限制执行 |

## 接口与执行约束

- `content.type: "video"`，`videoAssetId` 必填。封面分别传 `horizontalCoverAssetId` 和 `verticalCoverAssetId`，可同时提供；不得与通用 `coverAssetId` 混传。两个方向即使使用同一素材也分别执行。
- 小红书 dynamic/video 均支持 `collectionName`（名称完全相同且唯一）与 `declareOriginal`。`confirmation.originalAgreementAccepted` 只记录用户对本篇须知的明确同意，不能从声明原创或另一篇的确认推断。
- `confirmation.action: "fill"`；`finish: "stay" | "save_draft" | "publish"`。X 当前仅 stay；其他已开放平台仅 prepare。未验证的平台功能明确拒绝，不静默忽略参数。
- 视频仅 MP4，视频及封面合计传输预算128 MiB；素材先完整上传 API，再由后台校验摘要。视频通过最多256 KiB的块进入隔离页面，组装后再次校验完整摘要。
- 准备窗口仍为90秒，不无限延长。分块异常、取消或租约失效必须阻止上传；未开始编辑时关闭自有空页，已开始则保留原页供核对，不能新建任务重填。
- 横竖封面按明确标签定位独立槽位，分别上传与核对，提交前再次复核。平台 DOM 不符、自动裁切/转换导致无法证明一致时暂停，并保留明确原因；不拿首帧替代封面。
- X 使用保守普通帖字数预算，不自动截断。图片或视频预览无法确认完整性时停止。stay 返回需人工处理，不代表草稿或已发布。

## 验收步骤（重载后）

1. 重启本地 API 到当前源代码并重载扩展，验证连接心跳、目标账号、版本及无旧任务待执行。
2. 首次新视频任务使用 stay，核对视频、两张封面、文字话题。合集与原创按本次明确参数核对；未确认原创须知时不代为同意。
3. 补齐实际 DOM 差异与回归，再通过新任务测试指定最终动作；发布只以公开作品核对结果认定成功，提交提示只算 submitted。未知结果只核对，不重发。
4. X 先用已确认账号进行 API stay 测试；抖音、脉脉在核对稳定发布身份与表单后逐步开放填写。公众号待工具访问限制解除，不能通过其他工具绕过。

## 自动化检查

已覆盖：视频接口与一次性准备意图、封面参数保留及混传拒绝、同素材双封面、封面互换阻止提交、分块顺序/摘要/期限、传输中断与取消不上传、X错误账号/已有草稿保护、其他平台最终动作拒绝。自动化测试与构建证明代码行为，不证明真实平台已适配。

最终检查：`pnpm exec vitest run --maxWorkers=2` 33个文件、213项测试通过；`pnpm compile`、根目录 `pnpm build`、MultiPost独立构建和打包、`git diff --check` 均通过；两组 AGENTS.md/CLAUDE.md 完全一致。全并发首次运行出现CLI子进程测试5秒超时与新增主页页签测试夹具不匹配，修正夹具后降低测试并发，完整重跑通过。构建仍有既有依赖体积和Browserslist数据提示。未提交Git，未重启当前API进程，未触发新平台发布任务；明天须先加载当前API代码并重载扩展。

## 用户新增优先规则（2026-10-09，待逐平台实现）

后续以保存草稿作为优先交付和验收终点；确认当前平台的对应发布类型没有草稿功能时，才按用户本次规则走直接发布。草稿功能存在但适配未完成、按钮未找到或保存失败，不得当作“平台无草稿”自动改成发布。所有上传、填写、保存或发布仍由 API 任务触发，最终动作固定在任务确认快照；保留已有显式 stay/save_draft/publish 参数。不能把保持编辑页面算作草稿，保存后必须核对草稿证据；直接发布仍须核对提交和公开结果。

最初13个平台仅小红书图文完成完整真实闭环，小红书视频待验收；抖音、脉脉仅只读预检；公众号、视频号、TikTok、微博、YouTube、即刻、今日头条号、领英、知识星球、Medium 尚未打通自建 API 执行闭环。X为后来追加，第14个平台，当前仅填写保持代码，待真实验收。既有上游脚本不等于已接通或已验收。

## 重载后的首次视频实测（00:54）

用户已重载，API已重启到新源代码。任务 `e583b15d-5fa6-48dd-9633-718772be971b`（目标 `039f7ab9-ecec-4c44-a59c-2ec5af6b01b2`）使用 save_draft，账号秋水聊AI落地，原视频与横竖封面，合集AI落地；未设置本篇原创协议同意。通过接口成功上传27 MB视频到平台，页面显示9分钟视频预览，但同一个blob视频在4个video元素展示，旧代码要求单元素而返回 VIDEO_UPLOAD_UNCONFIRMED。标题正文、独立封面尚未填写，未暂存或发布。保留Chrome编辑页2019533114，禁止重传。

已修正为就绪预览必须同源同duration，仍校验原视频字节摘要；最终动作前同样拒绝不同视频。先以4预览测试复现失败，再修复，23项准备/最终动作测试及类型检查通过。当前已加载的扩展不包含该次修复，须下次重载后再做后续验收；不能将代码通过当成实机通过。原页任务已结束，继续填写须实现有界的原页恢复协议，不能通过resume或新任务重新上传绕过。

本地结果 `.haiqiai-publishing/cli-skill-mcp/draft-observation-v1.json`；截图 `video-upload-observed.png` 位于同目录。页面还观察到PK封面引导层与 `.cover-edit-entry` 入口，下一次适配须通过API操作该入口并核对真实横竖槽位，不能依赖猜测的封面表单。

## 用户报告的登录就绪范围（2026-10-09）

用户确认公众号、视频号、微博、即刻、今日头条号、知识星球、小红书、抖音均已登录。此为用户提供的登录状态，不替代执行前读取实际账号及目标核对；不把登录认作发布适配已完成。后续优先处理这8个平台，保持API触发全部写入、优先保存草稿、确认对应类型无草稿才发布。公众号既有工具访问限制仍独立存在，不能以用户已登录绕过。此前X和脉脉开发范围保留。

## 原页接续开发（01:08）

用户再次重载后原视频编辑页仍在，标题正文为空。接口原先没有原页恢复能力，普通resume按设计拒绝。新增受限continue-video流程，不改变原save_draft确认，不重传视频；平台入口检查原视频摘要以及空编辑器。API测试覆盖权限、旧运行未结束、重复入队；集成测试验证第二次沿用原标签页、只有首次分块上传、最终动作仍为草稿。修复代码尚未加载，未调用真实接续接口；旧任务仍needs_attention，不能报告草稿成功。

原页接续最终验证：221项测试、类型检查通过；两轴审查通过。额外覆盖原记录缺失/ID错误/未停止拒绝，及prepare-intent已成功但后台在注入前重启的故障；恢复会写入新run停止标记阻止延迟注入，返回中断而非锁死安装。服务仍是上次启动的源代码快照，真实调用前须重启API并重载最新扩展；本轮没有接续原任务、没有另建任务、没有再上传素材、没有保存草稿或发布。

## 06:28 原页接续实测

用户重载后API重启到含continue-video的源代码。通过Skill凭据请求目标039f7ab9-ecec-4c44-a59c-2ec5af6b01b2接续；新attempt 8879fd98-64af-421e-b53a-e845213d8cc4返回 CONTINUATION_UNVERIFIED。原页仍显示已上传视频、空标题正文；隔离页旧执行记录无法确认（缺失或不匹配），停止于准备阶段，未重复上传、未填写、未保存草稿、未发布。保留原页面。继续重载无法重建该记录，已请用户明确选择是否另做一次同素材save_draft测试；同意前不新建任务绕过防重复规则。

回执与当前结果：`.haiqiai-publishing/cli-skill-mcp/continue-result-v1.json`、`continue-observation-v1.json`。

## 06:38 重载接续设计缺陷诊断

原执行ae1aca85-62fd-4ad5-86ca-885808725641的API记录明确stoppedAt=2026-10-08T16:55:40.805Z、seq=1，无submitIntentAt。新增video-reloaded回归模拟原视频仍在、页面临时记录消失而API停止证明有效，旧代码返回CONTINUATION_UNVERIFIED，稳定复现。修复让claim携带服务端持久化停止证明，后台沿原页传入；仍保留原内容、账号、标签页和素材摘要校验。若现存页面记录冲突则拒绝；无停止证明、非法/未来停止时间均拒绝。该修复解决临时记录缺失路径，但实机当前通用错误不能区分缺失与ID不符，尚不能断言现场是哪一种；需加载后原页验证。

本轮224项全量测试、类型检查、整合扩展及MultiPost构建、两轴代码审查均通过。只读实查原标签页仍为4个同blob的542.763秒就绪视频预览，标题正文为空。API已重启到持久化停止证明修复版；尚未调用新的continue-video。已请求用户加载最终构建，待回执后原页实测；不以自动化测试代替草稿保存证据。

## 06:42 接续实测与用户确认的类型路由

用户加载后第二次continue-video已成功复用原视频并写入正确标题正文，没有再次上传。任务随后返回CONTENT_MISMATCH；只读页面验证标题正文与确认内容相同，代码仍使用图文预览选择器 `.scroll-container .title`，视频预览结构不同，待独立适配修复。话题、独立横竖封面和合集尚未完成，未存草稿或发布。API回执 `continue-result-v2.json`，结果 `continue-observation-v2.json`。

用户明确要求先按内容类型使用不同接口，再根据platform执行不同平台适配。已实现dynamic/video/article三创建入口，保持共用基础任务设施；先以真实HTTP集成测试复现404，再验证类型补全、多平台快照、混合类型拒绝及幂等重放。此为接口结构调整，不把现有视频填写问题标成已解决。

类型入口最终检查：225项全量测试、类型检查、根构建通过，文档双份同步，API已重启加载三个内容类型入口。本次接口调整不要求扩展重新加载，不新增发布任务。原视频页面仍保留，接续填写后的截图为 `.haiqiai-publishing/cli-skill-mcp/video-text-observed.png`。


## 视频文字预览与原页接续修复（2026-10-09）

只读实查视频正文预览在 `.publish-page-preview .user-desc-wrapper2`，不是图文页的 `.scroll-container`。测试夹具改为实际视频结构后，5个场景失败；修复按内容类型检查预览后通过。continue-video 新增正文核对中断的受限接续：服务端从原失败原因生成 textAlreadyFilled，执行器仅在原标题、正文完全一致且未插入话题时跳过文字写入；仍核对原视频摘要，不重新上传。新增已修改标题、正文、已有话题的拒绝测试，以及真实 HTTP/执行器接续参数链测试。

当前230项测试通过，类型检查、WXT构建及MultiPost独立构建打包通过。新版本尚未加载到Chrome，本次没有发起接续任务，原编辑页仍保留视频和已填写文字，未保存草稿或发布。`.cover-edit-entry` 为现场确认的新版封面入口，已加入定位；打开后横竖封面控件、话题最终预览及草稿结果仍待真实验收。

已对照上游 `src/sync/video/rednote.ts`：原脚本包含上传、标题正文、话题、单封面与发布流程。当前自建API的准备函数仍是另外的入口，尚未完成向原脚本收拢；不得宣称仅保留技术架构就等于已复用原流程。后续按根AGENTS.md的发布模块开发规则调整。


## 08:00 原页接续到封面窗口

用户重载后，通过API对原目标执行第三次continue-video。执行器保留已上传视频、原标题正文，自动补齐人工智能、AI智能体、CLI、MCP、Skill五个原生话题，并打开 `.cover-edit-entry`。没有重复上传或重复填写正文。随后返回 VIDEO_COVER_CONTROL_UNVERIFIED，未保存或发布。

只读检查设置封面窗口：仅一个 input[aria-label="上传封面图片"]，accept为 image/png, image/jpeg, image/*，与上游VideoRednote的封面上传选择器一致；完成按钮文本为“完成”，旧脚本使用“确定”。当前窗口没有观测到横版、竖版独立槽位，不能将两张图顺序上传到同一位置。已询问用户本篇选择哪张封面，选择前不修改任务素材快照或上传封面。后续需显式处理任务变更和原页接续，不直接改数据库。

回执continue-result-v3.json、结果continue-observation-v3.json、截图video-cover-dialog-v3.png位于.haiqiai-publishing/cli-skill-mcp/。浏览器只读取页面，没有代替API填写或点击。


## 单封面选择与原页接续

用户确认本篇只用横版封面。continue-video可传coverSelection=horizontal或vertical，仅允许原任务封面控件中断、前次已停止、尚未提交时选择原素材之一，并以coverSelection（含assetId和确认时间）保存一次性执行选择；原content、摘要、两张素材记录保留。调用者不能更改正文、账号或最终动作。

接续读取原页完整正文与原生话题，顺序和名称全部匹配才跳过话题填写；原视频继续摘要核对。单封面上传沿用上游VideoRednote的文件输入与change/input触发方式，修正当前“上传封面图片”和“完成”控件；先比对.hide-view-for-exact canvas完整尺寸和像素，再完成，等待外部封面背景更新，最终动作前再核对背景值。平台裁切、压缩或不同渲染导致无法确认时暂停，不跳过封面保存。

当前只是代码实现与测试，尚未加载/实机验证这条单封面路径。准备请求.haiqiai-publishing/cli-skill-mcp/continue-request-v4.json未发送。当前API准备入口尚未整体收拢至上游视频入口，不将操作方式复用说成架构整改完成。

单封面最终检查：234项全量测试、类型检查、WXT和Plasmo构建打包通过；两轴复核发现的二次接续话题标记继承与多段正文换行问题已修复并有回归测试，复核通过。API已重启加载单封面选择协议。横版接续请求尚未发送，等待扩展加载；未上传本次选定封面、未暂存或发布。


## 09:58 横版上传实测与候选选择修复

第四次API原页接续接受用户horizontal选择，保留原视频、正文和5话题，上传1672×941横版封面，随后COVER_IDENTITY_UNCONFIRMED。只读DOM证明上传图位于button.uploaded-thumbnail，存在uploaded-thumbnail-inactive-mask，尚未选为当前封面；hide-view-for-exact仍1920×1080旧画布。未点击完成、未暂存或发布。回执continue-result-v4.json、continue-observation-v4.json及截图video-horizontal-cover-v4.png存于本地素材目录。

将测试改为上传只产生未选候选、点击才更新画布后复现失败。修复先核对唯一已上传图尺寸与源文件SHA，再点击缩略图、等待inactive-mask消失，继续像素与完成结果核对。原页接续允许已确认单封面且前次话题完成的COVER_IDENTITY中断，由API生成coverAlreadyUploaded，复用现有图而不再次上传。上游src/sync/video/rednote.ts同步修改封面入口、上传后选图、完成按钮；自建API完整准备入口尚未整体收拢，仍如实记录此边界。

本轮236项全量测试、类型检查、WXT与Plasmo构建打包通过，两轴复核无新增阻塞。API已重启，尚未发起第五次接续，待扩展重载。已上传封面保留，不重传；未完成实机草稿验收。


## 第五次原页接续：封面已选中，实际预览裁切

用户重载后以空对象调用continue-video，回执continue-result-v5.json。执行器复用已上传横版封面，尺寸与文件摘要核对后点击候选图。只读实查uploaded-thumbnail-inactive-mask已消失，原图尺寸1672×941；没有重复上传、没有重复填写文字或话题。随后仍为COVER_IDENTITY_UNCONFIRMED：hide-view-for-exact画布仍为1920×1080，当前可见编辑画布为1908×1348并有clip-path。

对比原始横版封面和video-horizontal-selected-v5.png，红框内左侧C及部分文字被裁掉；不能把这个情况简单当作纯尺寸缩放而放宽检查。已向用户询问保持完整（缩放/留白）或接受当前裁切。决定前不点完成、不暂存、不发布，保留原页。API结果continue-observation-v5.json与截图同在.haiqiai-publishing/cli-skill-mcp/。本次没有修改源代码。


## 用户接受本篇封面裁切

用户明确接受当前裁切，后续制作封面时注意。新增continue-video参数acceptCoverCrop:true，仅当前已选择原素材、旧执行已停止且coverAlreadyUploaded=true的COVER_IDENTITY中断可一次性记录cropAcceptedAt。保留原素材尺寸、摘要、候选active核对，不重传或重选，只免除与原图逐像素相同的要求；最终动作仍save_draft。该参数不是全局默认。

238项全量测试、类型检查及两套构建通过。复核指出裁切确认未绑定具体渲染像素，不能声称能检测所有后续人为裁切调整；浏览器DOM读取工具不提供canvas.toDataURL，未绕过工具读取隐藏状态。实际接续前须再次只读核对当前可见预览与用户接受的截图一致，改变则暂停。此限制保留，不将代码测试等同实机通过。准备请求continue-request-v6.json未发送，等待新版扩展加载。

## 第六次接续：封面完成与合集成功，预览选择器中断

用户重载后，只读截图与已确认裁切一致；通过 continue-video 发送 acceptCoverCrop:true。原页自动完成封面，精确选中“AI落地”合集，未重复上传视频、封面或填写5话题。最终 PREVIEW_MISMATCH，未产生提交意图、未暂存或发布。回执和最终状态见本地 continue-result-v6.json / continue-observation-v6-final.json。

真实 DOM 显示加入合集后 `.user-desc-wrapper2` 改为 `.user-desc-wrapper`；后者标题加正文与编辑器完全一致，5原生话题保留，封面编辑器已关闭。回归用例模拟选合集切换类后失败，修复兼容两类但仍要求唯一与全文匹配。新增已完成封面引用摘要的原页接续，调用方先只读核对已确认裁切，提交 confirmedCoverPreviewSha256；只允许本阶段原已停止任务，扩展全量核对原视频/文案/话题与封面引用后继续，changed-cover 用例拒绝。该摘要仅绑定引用字符串，不宣称像素身份；原素材与裁切授权链保留。240项测试通过，两轴复核无新增阻塞。当前尚未加载修复版，未存草稿。

最终类型检查、WXT构建及Plasmo构建打包通过，API已重启。封面完成后的页面截图 video-cover-completed-v6.png 已保留；下次加载后须只读核对画面与引用，再生成接续请求。未发送第七次接续。

## 11:52 第七次原页接续：视频草稿保存通过

用户重载后，只读核对封面仍为已接受裁切、背景引用未变、标题正文预览相等、合集AI落地、封面编辑器关闭。调用continue-video传confirmedCoverPreviewSha256，沿用原任务e583b15d-5fa6-48dd-9633-718772be971b / target 039f7ab9-ecec-4c44-a59c-2ec5af6b01b2。原视频、正文、5原生话题、已完成横版封面和合集均保留，没有重新上传或人工点击。

API自动执行finish=save_draft，11:52:02出现“保存成功”并退出编辑器，草稿箱视频笔记(1)显示《CLI、MCP、Skill怎么选》、时长9:02、保存于2026-10-09 11:52:02。API于03:52:03.367Z回传draft_saved，platform_receipt / storage=browser_local / finish=save_draft。回执continue-result-v7.json、continue-observation-v7-final.json及截图video-draft-saved-v7.png均存.haiqiai-publishing/cli-skill-mcp/。浏览器工具仅只读核对，保存由API触发扩展。

验收结论：本次小红书视频经分阶段原页接续，完成上传、文案、5话题、单横版封面、精确合集与自动保存本地草稿及API回传。不是新任务一次执行的全流程回归，不证明双封面、视频原创声明或公开发布通过；本任务未请求原创、未公开发布。API准备入口收拢至MultiPost原视频入口仍未完成。本轮未修改运行源码，无需新增构建。

## 新任务重复测试：多个独立blob预览

用户要求再测一次。POST /v1/tasks/video新任务df7f15ef-4084-43cc-9e51-4718e5a7da5e、target b953fd52-c9c0-42cd-aba3-39e734777153，沿用同素材与账号，单横版图、AI落地合集、save_draft。回执draft-result-v2.json，原页2019533367。视频上传成功，正文尚空；旧判断要求所有currentSrc相同，实际4个预览各有不同blob URL、同542.763秒、readyState=4，导致VIDEO_UPLOAD_UNCONFIRMED。未再次上传、未暂存或发布。

新增回归复现不同URL同原文件也被拒绝。改为逐个唯一blob URL校验size/SHA256，准备完成前再次核对URL集合及duration，快照记录videoSources；finish要求集合完全匹配并兼容旧单地址快照。不同文件、后续引用替换仍拒绝。44项针对性测试、类型检查与WXT/Plasmo构建通过；当前待重载，实机尚未使用新判断。已保存草稿的上一次任务不受影响。本次完整新任务仍未通过，不能称为一次调用成功。

## 多blob修复加载后的原页接续仍中断

用户重载后，对新任务df7f15ef-4084-43cc-9e51-4718e5a7da5e / b953fd52-c9c0-42cd-aba3-39e734777153通过continue-video原页接续。回执retest-v2-continue-result-1.json，结果retest-v2-observation-3.json为needs_attention / PREPARATION_INTERRUPTED，无明确底层错误。只读DOM：4个不同blob预览均readyState4、时长542.763；上传input的files为空，标题正文仍空。没有重新上传或点击保存、发布。页面日志仅见GeolocationPositionError和AbortError，不能直接认定为本次扩展中断根因。

本次新任务重复测试未通过；上次已保存的草稿保留。当前错误映射吞掉非枚举异常，缺少定位具体失败操作的证据；下一步需补充分阶段异常原因，再修正真实素材身份核对，不能放宽检查或凭时长认定通过。本轮未改源代码、未再次要求重载。原页面2019533367保留。

## 视频核对诊断版准备

本轮补充读取预览地址、响应体、字节及摘要的阶段和序号；只允许内部固定错误码以及白名单异常类型，preflight仅接受严格格式诊断详情，并通过正常event/recovery原因持久化。新测试模拟TypeError携带私密URL字样，证明旧代码只报PREPARATION_INTERRUPTED；修复后能定位video_preview_fetch且不泄漏。审查发现旧正则可将大写PRIVATE_TOKEN冒充错误码，新增红测试并改显式错误码白名单。

增加受限原页再核对：仅已存在接续链、旧执行已停止、尚无文案话题封面完成标记的准备中断；仍严格原空文案、原视频摘要、未提交及旧结果匹配。真实中断根因尚未证实，诊断版需重载后采集；未重新上传或生成新任务。

诊断版最终247项测试、类型检查、WXT和Plasmo构建打包通过，两轴复核新增问题已修复。API已重启，新版扩展待用户重载；未发送下一次接续请求。

## 诊断实测与原视频节点核对修复

本次用户重载后通过API原页continue-video，回执retest-v2-continue-result-2.json，结果retest-v2-observation-4.json。明确失败在video_preview_fetch / preview=1 / TypeError，code=VIDEO_PREVIEW_FETCH_FAILED，标题正文仍空，未暂存或发布。按排序该地址对应隐藏comment-video播放器；4个video中只有1个可见，其余用于原视频取帧和评论预览。页面存在唯一.hide-view-for-exact video.exact-video原节点。浏览器downloadMedia不支持blob下载，未绕过工具；不能认定所有blob都失效或已证明原节点可读。

回归模拟其他播放器blob不可作为文件读取、原视频文件可读，旧代码报VIDEO_PREVIEW_FETCH_FAILED。修复仅对唯一原视频节点读取大小/SHA256；其他播放器仍需时长一致，完整URL集合保持稳定。完成前核对原节点对象及固定src/duration、集合；最终动作按原节点与快照确认，兼容旧单地址。新增原文件字节不符和核对后替换原视频地址拒绝用例。此修复替代上文逐个播放器blob核对字节的规则，不声称其他播放器字节身份已证实。两轴复核无新增阻塞；实际原节点可读性仍待新版重载。

最终248项测试、类型检查、WXT与Plasmo构建打包通过。本轮仅扩展源代码变更，API无需重启；原页保留，尚未发送下一次接续。

## 原视频实机核对通过，第三个话题等待中断

重载后retest-v2-continue-result-3.json接续成功读取唯一原视频，大小及SHA核对通过并自动填写标题正文、前两个原生话题。retest-v2-observation-6.json为TOPIC_NOT_FOUND。只读DOM核对：人工智能/AI智能体为原生标签，尾部#CLI尚未选中；#creator-editor-topic-container .item .name确有精确#CLI候选。因此不改选择器，也不宣称选择器错误，候选到达超过等待时间是待验证解释。未传封面、选合集或存草稿。

新增从严格匹配的已选话题前缀和待选尾部接续，保留正文与视频；候选等待从15延长至30秒，受90秒总期限约束。测试覆盖不重复insert和HTTP标记；审查指出CONTINUATION_UNVERIFIED重试丢标记，已增加仅此分支继承并补链路测试。当前接续尚未实机执行，新版待重载。

话题接续最终251项测试、类型检查及两套构建通过。两轴复核新增问题已修复，API已重启，尚未发起新接续，待新版扩展加载。

## 14:10 第二个视频测试任务草稿保存成功

重载后，通过API continue-video从TOPIC_NOT_FOUND原页接续，完成CLI、MCP、Skill三个话题，5原生话题全部匹配。随后按已有协议指定横版封面、复用已上传封面，核对截图裁切与用户先前接受的同篇素材一致，传acceptCoverCrop:true。扩展自动完成封面、精确选择AI落地合集并暂存离开。全程网站写入和点击由API下发给扩展，浏览器工具只读观察。

本任务df7f15ef-4084-43cc-9e51-4718e5a7da5e / target b953fd52-c9c0-42cd-aba3-39e734777153于2026-10-09 14:10:18保存成功；API06:10:19.245Z回传draft_saved / platform_receipt / browser_local，原editorTabId2019533367，内容摘要17ba99b69953b883717c31172a756389f1a2d5664e0f8e76c4bf6060a616fab0。retest-v2-observation-12.json及retest-v2-draft-saved.png为结果证据；continue-4至7各次请求与回执均保留。草稿箱现有2篇同标题9:02视频，时间分别11:52:02及14:10:18，对应用户要求的两次测试，未删除旧草稿、未公开发布。

本次实机证明原视频节点摘要核对、部分话题接续和最终草稿回传通过。但仍经历多次API显式接续，不能视为新任务单次调用全自动成功；单封面选择/裁切确认仍为中断后接续协议。后续需收敛初始接口参数与单次执行流程再做全新任务一遍通过的验收。未请求视频原创，本次不证明原创或视频公开发布。


### 2026-10-10 Skill 实际执行续测

按仓库 haiqiai-publishing Skill 执行，任务 `2d8a779c-d24f-48d2-b636-c8ad49483e0b`，目标 `034ab86b-e136-47db-93ea-040cb3999244`，结束动作 save_draft。复用同一API已ready的视频与横版封面，账号秋水聊AI落地，合集AI落地。已通过接口完成上传、原文及5话题填写，两次原页接续固定横版并复用已上传封面；当前 needs_attention / COVER_IDENTITY_UNCONFIRMED，未提交、未保存草稿。API停止后在本次恢复启动，Chrome执行器在线。原编辑页2019533516的浏览器检查连接返回Debugger unattached；未获得当前裁切画面核对，因此未提交acceptCoverCrop，也未新建任务或重复上传。运行记录位于 `.haiqiai-publishing/skill-runs/2026-10-09-skill-test-1/`。首次确认时间+00:00格式被API拒绝且未入队，改为原时间的Z格式后成功入队；Skill参数参考已补充UTC格式约束。


2026-10-10续测：用户恢复浏览器后，原页2019533516只读截图确认仍是此前接受的横版裁切。第3次continue-video传acceptCoverCrop=true，API已记录cropAcceptedAt；执行仍停止在COVER_IDENTITY_UNCONFIRMED，未产生submit-intent。封面编辑器与已上传1672×941候选仍在，尚未保存草稿；此错误不能再解释为仅缺少用户裁切同意，需定位候选文件身份核对失败。保留原页与任务，不重复上传。


2026-10-10封面修复：只读下载当前候选临时地址显示HTTP403，浏览器返回后原页内容仍在。新增已上传原页候选的加载像素核对回退，仅网络读取失败且原图完整加载、尺寸一致时比较原素材全像素摘要；画布不可读/像素不符拒绝。新增链接403一致及不同像素两项实际入口测试，修复前一致用例失败，修复后40项入口测试通过；类型检查与根WXT/子Plasmo构建通过。须重载后继续原任务实机验收，尚未保存草稿。
