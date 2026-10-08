# HaiqiAI 发布 API：配对与目标发现

当前阶段对应 #29。支持 Node.js 24.13+、本机或服务器运行，使用 Node 内置 HTTP 与 SQLite，无独立服务端依赖。任务、素材、平台账号自动读取和实际发布仍未接入。单个 API 实例服务一个使用者；管理、Skill、各扩展分别使用不同凭据。不自动跨实例同步。

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

默认解析：省略浏览器采用电脑默认；省略配置采用所选浏览器默认；只指定配置则在默认浏览器内找。缺默认、不存在、撤销、有歧义、账号不属于指定安装均明确拒绝。离线目标仍可预检，不自动改派。`targets/resolve` 的结果是预检快照，后续任务创建必须在其事务内重新解析并固定安装；此阶段没有提交任务接口。

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
