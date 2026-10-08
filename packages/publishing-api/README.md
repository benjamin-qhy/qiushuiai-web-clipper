# HaiqiAI 发布 API：配对、素材与模拟任务

当前阶段覆盖 #29、#30、#31。支持 Node.js 24.13+、本机或服务器运行，使用 Node 内置 HTTP 与 SQLite，HTML 校验使用根目录依赖 parse5（先运行 pnpm install）。素材与模拟任务已接入，平台账号自动读取和实际发布仍未接入。单个 API 实例服务一个使用者；管理、Skill、各扩展分别使用不同凭据。不自动跨实例同步。

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

心跳每30秒，服务端90秒未收到显示离线。离线不等于发布失败。当前扩展心跳不读取平台账号，因此观测数组为空；管理端登记账号会显示“尚未核对实际登录账号”。后续平台适配接入账号观测后，状态为 matched/mismatch/logged_out，执行前仍需重新核对。

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

Skill 入口见仓库 `skills/haiqiai-publishing/SKILL.md`。使用 Skill 专用密钥调用同一客户端；模拟器仅访问所选 API，不访问任何真实平台。`executionMode: "simulation"` 为必填；当前所有真实任务都拒绝。模拟的 `draft_saved` 在界面显示“模拟草稿已保存（未发布）”，不能作为平台结果证据。

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

本阶段验证公共结构、类型与素材引用，不冒充已验证平台字数/图片数量等限制。capabilities 的 verified/autoPublish 仍为 false，真实任务不能借模拟验收进入平台。

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
- 如确实要重新提交未知目标，使用新请求键，并在目标内传 `replacesTargetId`，确认记录传 `duplicateRiskAccepted:true`，明确经过用户重复风险确认；原记录保留。当前仍只允许 simulation。
- 页面显示取消请求、提交意图、原因代码和阶段；“核对已有结果”按钮不触发重新发布。恢复/取消管理动作由 Skill API 发起。
