# clip publish 发布 API：配对、素材、任务、执行与恢复

当前阶段覆盖 #29、#30、#31。支持 Node.js 24.13+、本机或服务器运行，使用 Node 内置 HTTP 与 SQLite，HTML 校验使用根目录依赖 parse5（先运行 pnpm install）。素材与模拟任务已接入；小红书真实任务只读预检已接入，小红书图文填写、暂存、发布及结果核对已实机验收；视频多次原页接续暂存已验收，最新封面临时链接失效修复待重载验证。当前进度与换电脑接续见 `docs/research/2026-10-10-publishing-handoff.md`。单个 API 实例服务一个使用者；管理、Skill、各扩展分别使用不同凭据。不自动跨实例同步。

## 启动与管理

在仓库根目录运行：

```sh
pnpm publishing:admin init
pnpm publishing:api
```

默认仅监听 `127.0.0.1:43129`。`HAIQIAI_DATA_DIR` 指定持久化目录，默认 `.haiqiai-publishing`，已从 Git 排除。管理密钥在 `admin.key`，亦可由服务端环境变量 `HAIQIAI_ADMIN_KEY` 提供（至少32字符）。数据库保存密钥摘要；含配对码/新密钥的幂等回执用 `receipt.key` 加密。整个目录包含敏感数据，应由服务账号独占，备份时同时保留数据库及密钥文件。不要将目录放在公开静态服务中。

服务器使用同样命令和数据目录，通过 HTTPS 反向代理访问；`HOST`、`PORT` 可配置监听位置。只有本机回环 HTTP 被扩展和管理客户端允许，远程必须 HTTPS；不接受重定向。没有部署或对外暴露服务的自动动作。

管理命令通过 REST 调用，`HAIQIAI_API_URL` 选择本机/远程 API，`HAIQIAI_API_KEY_FILE` 选择凭据文件，默认读取管理密钥。变更返回值保存为权限0600的新文件，不覆盖已有文件。管理命令在发请求前检查输出文件，并在旁边保存 `.request.json` 请求键与摘要；网络结果不明时原样重跑会复用原键，已存在结果文件时不会再次发送。`HAIQIAI_REQUEST_ID` 可显式指定幂等键。保留请求旁文件直至结果确认。

```sh
# computer.json: {"name":"我的电脑"}
pnpm publishing:admin POST /v1/computers computer.json computer-result.json
# pairing.json: {"computerId":"上一步返回的id","browserName":"Chrome","profileName":"工作"}
pnpm publishing:admin POST /v1/pairing-codes pairing.json pairing-result.json
# 将返回的 code 输入扩展的发布工作台；10分钟内有效。
# Edge 或其他配置另外生成配对码。已登记浏览器下新增配置时带 browserId。
# 重新配对已有配置时带 browserId/profileId，且必须先撤销原安装。
pnpm publishing:admin GET /v1/executors
# skill.json: {"name":"我的 Skill"}；返回的 key 单独保存为 Skill 的凭据文件。
pnpm publishing:admin POST /v1/keys skill.json skill-result.json
# 查看 keyId 后撤销某份 Skill 或扩展密钥；已撤销凭据即时失效。
pnpm publishing:admin GET /v1/keys
pnpm publishing:admin POST /v1/keys/KEY_ID/revoke - revoke-result.json
```

每次配对由管理端固定电脑、浏览器与用户配置 ID，扩展不能在请求中更改归属。ID 均不透明，不以名称去重；重复显示名允许，调用方须使用 ID。相同浏览器应复用发现接口中的 browserId，避免将两个同名浏览器误登记成不同对象。

## REST 协议

统一 `/v1`、JSON、`Authorization: Bearer <key>`。配对仅使用一次性码，不要求管理密钥。所有变更请求都需要 `Idempotency-Key`；身份/方法/路径/键相同且内容相同返回原结果，内容不同409。配对回执支持断线重试，不允许凭旧回执恢复已撤销安装。错误格式为 `{requestId,error:{code,message,retryable,nextAction}}`。JSON 上限64KiB；未知字段拒绝，禁止 Cookie/平台令牌字段。

| 接口 | 身份 | 用途 |
| --- | --- | --- |
| POST /computers | 管理 | `{name}` 登记电脑 |
| POST /pairing-codes | 管理 | `{computerId,browserName,profileName,browserId?,profileId?}` 生成10分钟一次性码 |
| POST /executors/pair | 配对码 | `{pairingCode,installationId,extensionVersion}` 换取专属凭据 |
| POST /keys、GET /keys | 管理 | 创建 Skill 密钥 `{name}`、列出不含密钥的登记记录 |
| POST /keys/{id}/revoke | 管理 | `{}` 撤销 Skill 或安装凭据 |
| GET /executors | Skill/管理/安装 | 安装、电脑、默认值、服务实例ID和在线状态；安装只能查询自身及所属电脑 |
| POST /accounts | 管理 | `{executorId,platform,platformAccountId,displayName}` 登记账号；不表示当前已登录 |
| GET /accounts?executorId=... | Skill/管理/所属安装 | 账号及观测状态 |
| GET /capabilities?executorId=... | Skill/管理/所属安装 | 首版范围，当前全部 verified=false、autoPublish=false |
| PATCH /computers/{id}/defaults | 管理 | `{version,defaultBrowserId,defaultProfiles:{browserId:profileId}}`；旧版本409 |
| POST /executors/{id}/heartbeat | 所属安装 | `{extensionVersion,accountObservations:[{accountId,platformAccountId:string或null}]}`；服务端记录时间 |
| POST /targets/resolve | Skill/管理 | `{computerId,platform,accountId,browserId?,profileId?}` 预检解析，不创建任务 |

默认解析：省略浏览器采用电脑默认；省略配置采用所选浏览器默认；只指定配置则在默认浏览器内找。缺默认、不存在、撤销、有歧义、账号不属于指定安装均明确拒绝。离线目标仍可预检，不自动改派。`targets/resolve` 的结果是预检快照，后续任务创建必须在其事务内重新解析并固定安装；任务创建复用同一解析规则，在同一事务内固定目标，后续默认修改不会改派。

心跳每30秒，服务端90秒未收到显示离线。离线不等于发布失败。常规心跳不读取平台账号；小红书真实预检读取创作首页与指定个人主页，账号号匹配后回传观测；管理端登记账号会显示“尚未核对实际登录账号”。后续平台适配接入账号观测后，状态为 matched/mismatch/logged_out，执行前仍需重新核对。

平台标识：`weixin`、`weixinchannel`、`xiaohongshu`、`douyin`、`tiktok`、`weibo`、`youtube`、`okjike`、`toutiao`、`linkedin`、`maimai`、`zsxq`、`medium`。类型详见 capabilities 接口；存在上游脚本不代表可以自动发布。

## 扩展与验证

React 发布页发送独立消息到后台；后台执行 API 请求并保管凭据，拒绝普通网页/内容脚本调用。`storage.local` 限制为可信扩展上下文（设置页等扩展内部页面仍属于可信上下文），不向网页发送密钥。定时 alarm 唤醒 Service Worker，浏览器休眠/关闭时不保证准点心跳，服务端按最后心跳如实判断离线。

```sh
pnpm exec vitest run tests/publishing
pnpm compile
pnpm build
```

HTTP 测试使用临时 SQLite 和真实监听端口，覆盖配对/权限/幂等/撤销/重启/默认解析/过期/离线；扩展消息测试调用真实 API，Chrome/Edge 实装另外记录。测试不登录、不上传素材、不发布平台内容。

## 素材与模拟任务（阶段 #30）

Skill 入口见仓库 `skills/haiqiai-publishing/SKILL.md`。使用 Skill 专用密钥调用同一客户端；模拟器仅访问所选 API，不访问任何真实平台。模拟使用 `executionMode: "simulation"`；真实只读预检使用 `executionMode: "live"` 与 `confirmation.action: "prepare"`。模拟的 `draft_saved` 在界面显示“模拟草稿已保存（未发布）”，不能作为平台结果证据。

```sh
# HAIQIAI_API_KEY_FILE 指向 Skill 密钥文本文件；勿将密钥放进请求正文。
pnpm publishing:upload /绝对路径/图片.png image/png upload-result.json
pnpm publishing:admin POST /v1/tasks confirmed-task.json task-result.json
pnpm publishing:admin GET /v1/tasks/TASK_ID
```

上传客户端先流式计算摘要，再声明素材，最后流式传输字节；不将大视频装进 JSON。默认单文件上限512MiB，可用 `HAIQIAI_MAX_ASSET_BYTES` 配置。长度或 SHA-256 不符、上传中断均不 ready；临时文件不会被下载或用于任务，失败可重传。ready 的字节不可修改。媒体类型来自声明并与内容字段核对；本阶段没有进行图片解码或视频格式探测，真实适配前仍需验证文件格式及平台限制。

| 接口 | 身份 | 说明 |
| --- | --- | --- |
| POST /assets | Skill/管理 | `{filename,mediaType,sizeBytes,sha256}` → `{assetId,ready:false,maxSizeBytes}` |
| PUT /assets/{id}/content | Skill/管理 | 带 Idempotency-Key 的原始二进制流，完整校验后 ready |
| GET /assets/{id}、/assets/{id}/content | Skill/管理/被指定安装 | 元数据/二进制；安装只能访问指定给自己的任务所引用的素材 |
| POST /tasks | Skill/管理 | 全部目标统一校验后入队；固定内容快照、摘要及 executorId |
| GET /tasks?cursor=...&limit=...、/tasks/{id} | Skill/管理/被指定安装 | 任务由新到旧分页；安装只看自己的目标；返回逐项状态和计数 |
| POST /executors/{id}/claims | 所属安装 | 原子领取一项；已有运行目标时不再领取；返回120秒租约 |
| POST /attempts/{id}/renew | 所属安装 | `{leaseToken}` 续租，过期或已结束409 |
| POST /attempts/{id}/events | 所属安装 | `{leaseToken,eventId,seq,stage,state,evidence?,reason?}`；事件去重、顺序校验及归属校验 |

请求示例（素材 ID、账号和电脑 ID 替换为本服务发现结果，时间使用真实确认时间）：

```json
{
  "executionMode": "simulation",
  "confirmation": {"confirmedAt": "2026-10-08T07:00:00Z", "contentRevision": "rev-1"},
  "targets": [{
    "clientTargetId": "xiaohongshu-a",
    "platform": "xiaohongshu",
    "accountId": "ACCOUNT_ID",
    "computerId": "COMPUTER_ID",
    "content": {"type": "dynamic", "title": "模拟标题", "content": "模拟正文", "imageAssetIds": ["ASSET_ID"], "tags": []}
  }]
}
```

支持首版白名单内 dynamic/article/video 的公共内容结构（决策 #26），不修改正文或截断素材。数组可省略，正文中的图片使用 `asset://ASSET_ID` 并在 imageAssetIds 声明；模拟文章仅接受基础静态标签和安全链接，未知属性明确拒绝。任一目标不合法时422附 fieldErrors，整批不入队；同请求重复的平台/账号/内容目标拒绝。不支持的 platformOptions/destination 等字段也明确拒绝，后续对应适配器验收后再开放。

本阶段验证公共结构、类型与素材引用，不冒充已验证平台字数/图片数量等限制。capabilities 的 verified/autoPublish 仍为 false，真实任务不能借模拟验收获得发布权限。

扩展每30秒检查一次，逐个执行；素材使用流式 SHA-256 核对，保留原任务内容快照，事件证据固定 `kind=simulation_receipt`。领取请求编号、当前尝试和待回传事件先保存到本机再发请求；没有真实提交动作。API与扩展重启不会丢失已保存记录。模拟任务的恢复、取消、submit-intent、reconcile、resume 已接入；真实平台页面的停止证明与平台结果核对须逐平台验收。

服务端流式写独立临时文件，校验后原子改名再标 ready；进程被强制终止可能留下 `.partial` 文件，首版不自动清理历史，文件不会变为 ready。生产部署仍需另外授权与实际HTTPS/跨电脑验收。

## 取消与安全恢复（模拟范围）

| 接口 | 调用方 | 规则 |
|---|---|---|
| GET /attempts/{id} | Skill/管理/所属安装 | 当前阶段、租约期限、提交意图与目标；不返回租约凭据 |
| POST /attempts/{id}/submit-intent | 所属安装 | `{leaseToken,contentDigest,accountId,assetsChecked:true}`；有效执行且未取消才接受，返回授权仅限 simulation |
| POST /tasks/{id}/cancel | Skill/管理 | `{}`；等待中的目标直接取消，执行中的目标等待安装确认停止；已有提交意图只能核对 |
| POST /attempts/{id}/recover | 所属安装 | `{leaseToken,executionStopped:true,pageClosed:true,retryNotBefore?,downloadRetryCount?}`；同一安装确认旧执行已停止及页面不再可提交，废止旧尝试 |
| POST /targets/{id}/resume | Skill/管理 | `{}`；提交前重新核对原账号/素材后恢复，提交意图后只安排核对 |
| POST /targets/{id}/reconcile | Skill/管理/所属安装 | `{}`；只安排原安装读取已有记录，不授予再次提交权 |

- 服务处理请求时检查过期租约和撤销状态；没有后台定时改派。提交前过期显示需人工处理，安装确认停止后最多自动恢复两次，分别至少等待5秒、15秒；超限需 Skill 请求恢复。恢复不改变账号、浏览器或安装；retryNotBefore/downloadRetryCount 保留较长等待和已消费下载重试次数。
- 扩展下载时每30秒续租；临时网络/408/429/5xx故障最多重试两次，等待5秒、15秒，若 Retry-After 更长则遵守更长等待。等待时间和次数保存在本机，浏览器睡眠时可延后。素材摘要不符、权限拒绝等不自动重试。模拟执行不打开平台页面，因此可确认自身停止；此证明不能直接用于未来真实页面适配。
- 扩展先保存提交意图请求编号，再请求授权。授权响应不明时不完成新的模拟草稿；重启查询发现提交意图后，只核对已保存的证据。待回传事件原样重放，已接受事件不会重复推进。
- 意图后中断返回 outcome_unknown，原因说明未知和禁止重发。过期旧尝试仅可补交关联的模拟完成证据，保存为待核对材料，不能直接覆盖状态或恢复执行权。新的核对尝试可据该材料确认模拟草稿；没有材料仍保持结果未知。一旦未知，reconcileOnly 标记防止后续核对过期时又恢复为执行。
- 每安装同时最多一个未确认停止的执行；取消与意图在同一事务中互斥。任务及证据不删除。撤销密钥不代表能撤回平台行为。
- 如确实要重新提交未知目标，使用新请求键，并在目标内传 `replacesTargetId`，确认记录传 `duplicateRiskAccepted:true`，明确经过用户重复风险确认；原记录保留。真实任务 prepare 只读，fill 按下文 finish 参数决定保持页面、暂存或提交。
- 页面显示取消请求、提交意图、原因代码和阶段；“核对已有结果”按钮不触发重新发布。恢复/取消管理动作由 Skill API 发起。

## 小红书真实任务预检（#32 部分交付）

在原任务结构中使用 `executionMode: "live"`，确认记录增加 `action: "prepare"`。当前仅接受小红书 dynamic、非空标题及图片，不接受视频。prepare 只读；fill 的完成动作见下文。

- 领取传 `{executionMode:"live"}`；缺省保持 simulation，防止旧模拟器领取真实任务。两种模式共用同一安装的单执行锁。领取及查询返回真实模式。
- 原文、8个话题、图片顺序等内容全部作为不可变快照保存；扩展不会删减。
- 打开小红书创作后台首页，以及指定账号的个人主页。扩展从主页 URL 取得稳定 ID，读取主页小红书号，与创作首页账号号交叉核对。不同号返回 ACCOUNT_MISMATCH；昵称不用于身份判断。缺少主页或账号字段返回 ACCOUNT_UNVERIFIED；账号观测只是本次页面快照，不代替未来提交前重验。
- 核对通过后流式下载所选 API 的素材，检查长度与 SHA-256。网页不接收 API 密钥、Cookie 不上传。prepare 的中断恢复仅证明只读执行停止，fill 另行核对原页面执行状态。
- prepare 核对完成返回 needs_attention / READONLY_CHECKED，不上传。独立的 action:fill 打开新鲜创作首页两次核对账号，验证素材后打开新空编辑页，按原顺序上传、填写完整文字、精确选择原生话题并核对预览。PNG/JPEG/WebP、最多18图，32 MiB图片总量是当前传输预算限制，不是平台上限。
- POST /attempts/:id/prepare-intent 接受 leaseToken、contentDigest、accountId、assetsChecked:true、editorTabId，仅 live/fill 可用。一次性记录 preparationStartedAt、editorTabId、preparationDeadline；最长90秒，逐次写入检查，禁止重复授权。
- finish=stay 填写完成返回 needs_attention / AWAITING_PUBLISH_CONFIRMATION，阶段 preparation；不是草稿或发表成功。异常保留原页，禁止自动重填。已开始填写但未记录提交意图的目标 resume/reconcile 返回 PREPARATION_REVIEW_REQUIRED；提交后仅安排原页面结果核对。recover 在原安装核对写入函数实际结束（preparationStopped:true）时可接受 pageClosed:false，保留原页面供检查，不自动排队。
- 7图8话题及合集自动填写已实机通过。新完成动作见下文；其真实端到端验收及公开发表结果确认尚未完成，capabilities 保持未验证。


### 合集与原创参数

小红书 dynamic 的 `content.collectionName?: string` 和 `content.declareOriginal?: boolean` 随不可变内容快照传递，并参与内容摘要。其他平台拒绝这两个参数。合集名称最多200字符、不能为空；保留原值、不做模糊匹配。列表中必须只有一个完全同名合集；找不到/重名/选中未确认分别回传明确原因。省略字段不主动设置，false 明确关闭原创开关。

`declareOriginal:true` 打开原创开关后，如果出现“原创声明须知”弹窗，只有 confirmation.originalAgreementAccepted:true 且须知链接匹配已支持版本才自动勾选并声明；否则回传 ORIGINAL_AGREEMENT_REQUIRED 并保留页面。开关已勾选但弹窗尚在，不算声明完成。两项参数在工作台内容快照中展示。

页面图片预览的 blob 字节按顺序和原素材摘要核对；若平台压缩或重排导致无法一致，返回 IMAGE_ORDER_UNCONFIRMED，需人工检查，不能声称已自动确认原顺序。

## 小红书填写后的完成动作

小红书 live/fill 支持 confirmation.finish=stay（默认保持页面）、save_draft（暂存离开）、publish（发布）。confirmation.originalAgreementAccepted=true 是调用方记录用户已同意当前原创须知，不等同于 content.declareOriginal=true。rednote-finish.ts 按已核对快照、一次性 submit-intent 和唯一按钮执行；真实草稿凭页面保存证据回传 draft_saved（browser_local），发布成功提示仅回传 submitted，不能当作公开发表。断线和未知结果只核对、不再点击。新增能力的真实验收状态见 docs/research/2026-10-08-xiaohongshu-live-preflight.md。

```json
{
  "executionMode": "live",
  "confirmation": {
    "action": "fill",
    "finish": "save_draft",
    "originalAgreementAccepted": true,
    "confirmedAt": "2026-10-08T14:00:00Z",
    "contentRevision": "confirmed-v1"
  },
  "targets": [{
    "clientTargetId": "xiaohongshu",
    "computerId": "电脑ID",
    "accountId": "账号ID",
    "platform": "xiaohongshu",
    "content": {
      "type": "dynamic",
      "title": "已确认的标题",
      "content": "已确认的正文",
      "imageAssetIds": ["已上传的素材ID"],
      "tags": ["人工智能"],
      "collectionName": "AI落地",
      "declareOriginal": true
    }
  }]
}
```

finish 必须为 stay、save_draft、publish 之一，只允许 action=fill；省略时 stay。参数与内容保存在不可变任务中。originalAgreementAccepted 只用于用户对当前已支持须知的明确同意；缺失时遇到弹窗暂停。

live submit-intent 除 leaseToken/contentDigest/accountId/assetsChecked 外要求 editorTabId、preparationChecked:true、finish；必须已通过填写，且与任务动作及页面一致。服务端只授予一次最长30秒的执行窗口；相同HTTP幂等请求可取原回执，执行器失去回执后只查结果，不重复点击。

真实完成 evidence 使用 platform_receipt，包含 platform/accountId/observedAt/detail/finish/editorTabId/title/signal，草稿另含 storage:browser_local。submitted 表示平台收到提交，不证明公开可见；缺少证据返回 outcome_unknown 并附原因。准备后不恢复上传；已提交任务的 reconcile 只读核对结果，不重复点击。发布成功提示后自动核对创作后台与公开作品：账号、标题、提交时间窗口、正文、话题和图片张数均匹配才回传 published 及 canonical URL。核对不充分时保留已知 submitted；不能把未找到作品解释为审核中或失败。submitted 可再次请求 /targets/:id/reconcile。明确审核中/未通过也须先完成作品身份和内容核对；未通过使用 platform_rejection 证据并注明原因，未知具体原因不得猜测。


## 2026-10-09 视频与其他平台增量（待真实验收）

小红书 live 支持 dynamic/video。video 使用 `videoAssetId`，横竖封面分别使用 `horizontalCoverAssetId`、`verticalCoverAssetId`；两者可同时传，不能再混传 `coverAssetId`。支持 `collectionName` 精确唯一匹配及 `declareOriginal`。原创协议必须有本篇明确同意才能传 `confirmation.originalAgreementAccepted:true`。

视频及封面合计128 MiB预算，仅MP4视频；准备期限90秒。超时/取消/摘要错误停止，不自动重填。finish 仍为 stay/save_draft/publish；视频真实页面上传、封面及最终动作尚待重载验收。

新增 X dynamic 的 live/prepare 与 live/fill/stay，最多4张PNG/JPEG/WebP；保守普通帖字数预算280（大多数中文字符计2），不自动截断；话题不含空格或井号。X拒绝 save_draft/publish 和视频。抖音、脉脉仅允许 live/prepare，拒绝fill。抖音账号标识使用明确命名空间 `handle:<抖音号>`，不冒充sec_uid；脉脉匿名发布身份无法确认时返回人工处理。公众号未开放真实任务。

新范围的接口可用不代表平台验收通过；详细证据与下一步见 `docs/research/2026-10-09-video-and-platform-acceptance.md`。

新增 `POST /v1/targets/:id/continue-video` 原页接续，限Skill/管理身份请求已停止的live小红书video、原因VIDEO_UPLOAD_UNCONFIRMED、未提交且未取消的目标。保留原内容/finish/账号/安装/editor，领取时固定previousRunId；重新获得一次性prepare-intent后仅核对原页视频摘要并继续空文案填写，不重新上传。旧页已编辑、原执行未结束、素材不符、标签页丢失均停止。普通resume仍禁止已开始填写的任务。真实原页接续待重载验收。

接口请求体为 `{}`；权限不足403，不满足接续条件409。返回原editorTabId及uploadAllowed:false；结果仍通过原taskId查询。不得以此重发未知结果或修改原任务最终动作。

原页接续停止证据修正：页面临时记录可能随扩展重载消失。claim从API持久化attempt读取previousStoppedAt，可信后台传入原页入口；临时记录缺失时只允许有效的已停止证明，并继续强制原标签页、空文案、视频大小及SHA256核验。仍存在的旧记录若未停止/ID不符仍拒绝。CONTINUATION_UNVERIFIED且存在原接续链的已停止任务可再次显式请求continue-video，不能重传或改变finish。该规则替代上文“缺临时记录一律拒绝”。

## 按内容类型调用（当前推荐入口）


发布任务创建按内容类型分入口：`POST /v1/tasks/dynamic`（文字/图文动态）、`POST /v1/tasks/video`（视频）、`POST /v1/tasks/article`（文章）。接口固定内容类型，`content.type`可省略；显式传入其他类型返回CONTENT_TYPE_MISMATCH，不能一批混合类型。每个targets条目按platform做平台字段/能力校验，再由扩展按platform+类型选择适配代码；三入口共用原任务队列、幂等、账号目标、防重复、租约和结果查询。旧POST /v1/tasks仅为既有调用兼容保留，新Skill调用必须使用类型入口，不以入口存在表示对应平台已验收。

| 入口 | 主要内容参数 |
| --- | --- |
| `/v1/tasks/dynamic` | `content`、`imageAssetIds`、`tags`，支持字段由平台决定 |
| `/v1/tasks/video` | `videoAssetId`、`title`、`content`、`horizontalCoverAssetId`、`verticalCoverAssetId`、`tags` |
| `/v1/tasks/article` | `title`、`htmlContent`（必填）、`markdownContent`（可选保留）、`coverAssetId`等平台支持字段 |

平台参数仍在 `targets[].platform`，账号/电脑/浏览器/用户配置也保持原结构；合集和原创是平台选项，不对不支持的平台静默忽略。最终动作由 `confirmation.finish` 固定。比如小红书视频：

```json
{
  "executionMode": "live",
  "confirmation": {
    "action": "fill",
    "finish": "save_draft",
    "confirmedAt": "<本次确认UTC时间>",
    "contentRevision": "<内容版本>"
  },
  "targets": [{
    "clientTargetId": "xhs-video",
    "platform": "xiaohongshu",
    "accountId": "<账号ID>",
    "computerId": "<电脑ID>",
    "content": {
      "title": "视频标题",
      "content": "视频说明",
      "videoAssetId": "<视频素材ID>",
      "horizontalCoverAssetId": "<横版封面素材ID>",
      "verticalCoverAssetId": "<竖版封面素材ID>",
      "collectionName": "AI落地"
    }
  }]
}
```

此请求发往 `/v1/tasks/video`。相同内容类型可包含多个平台目标；图文和视频须分别提交。状态仍由 `GET /v1/tasks/{taskId}` 查询，取消和接续接口不变。接口拆分不会自动放开尚未适配的平台或最终动作。

原页视频接续 `POST /v1/targets/:id/continue-video` 也允许已停止且未提交的 CONTENT_MISMATCH 准备中断；服务端固定原页与快照，执行器只在标题正文完全一致且未插入话题时跳过已完成的文字填写，不重传视频。页面内容不同则暂停，不覆盖。

小红书视频封面控件中断后，可用 `POST /v1/targets/:id/continue-video`，请求 `{ "coverSelection": "horizontal" }`（或 `vertical`）选择原任务的一张封面。仅限已停止且未提交的 `VIDEO_COVER_CONTROL_UNVERIFIED`，一次性记录 `target.coverSelection`，保留原content与素材；不能改为新素材或更改finish。执行器保留完全匹配的现有正文与全部原生话题，单封面上传后仍需核对才能暂存/发布。

已选择单封面的COVER_IDENTITY_UNCONFIRMED中断，在前次执行已停止、话题已完成且未提交时，可再次以空对象调用continue-video；执行器复用并核对现有已上传候选封面，不重传。选择记录不变。

本篇用户接受平台裁切后，可在上述已上传封面中断接续请求中传 `acceptCoverCrop: true`。API一次性记录所选原素材的cropAcceptedAt；仍核对原图尺寸/SHA和active候选，跳过原图与裁切画布的逐像素一致检查，不重新上传/选图，不更改finish。该确认不是全局偏好，也不保存具体裁切渲染像素，调用方须在确认/接续前检查当前可见裁切。

### 已完成封面后的原页预览核对接续

`POST /v1/targets/:id/continue-video` 可传 `confirmedCoverPreviewSha256`，值为只读核对当前已完成封面后，对唯一 `.cover.cover--row > .default.row` 的 `style.backgroundImage` 原样 UTF-8 字符串做 SHA256（64位小写hex）。这是调用方确认当前封面引用，不是图片像素或源文件摘要，调用方须先核对画面符合已确认裁切。

仅允许已停止、未提交、已选单封面、已接受裁切、原次 coverAlreadyUploaded=true 且原因 PREVIEW_MISMATCH 的任务，一次性记录后接续原页。缺少摘要、摘要格式错误或阶段不符拒绝。扩展复核原视频大小/摘要、正文/原生话题、唯一封面引用摘要及无封面编辑器，随后复核合集和最终状态；封面不重传/重开。finish 与原任务一致。

### 视频原页接续的错误诊断

视频核对失败区分 `VIDEO_PREVIEW_FETCH_FAILED`、`VIDEO_PREVIEW_BODY_FAILED`、`VIDEO_PREVIEW_BYTES_FAILED`、`VIDEO_PREVIEW_HASH_FAILED`。原因消息附带固定步骤、预览序号和白名单异常类型，不保存原始异常message、URL或凭据；这些代码指出失败位置，底层原因未证实时causeKnown=false。

已存在videoContinuation的目标若PREPARATION_INTERRUPTED或上述诊断错误中断，且前次没有textAlreadyFilled/topicsAlreadyFilled/coverAlreadyUploaded标记，可以再次请求continue-video。仍要求原执行已停止、未提交、未取消、原安装有效；页面代码核对旧结果码、空标题正文及原视频摘要。新尝试previousResultCode由服务端旧原因生成，调用方不能传入或覆盖。此路径只核对原视频并继续原页，不重新上传。

`TOPIC_NOT_FOUND` 可使用原页 `continue-video`（空请求体）接续。服务端生成topicsInProgress；扩展只接受完整标题正文、按原顺序已选的话题前缀及末尾唯一的下一个`#tag`，直接选择当前候选，不重输已填内容。CONTINUATION_UNVERIFIED再次接续继承进行中标记；进入后续阶段清除。候选等待30秒，不突破原准备总截止时间。
