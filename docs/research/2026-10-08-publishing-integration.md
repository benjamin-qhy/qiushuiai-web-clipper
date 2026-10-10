# MultiPost 脚本整合调查

> 历史调研快照（2026-10-08）：平台能力与架构建议不代表当前实现或验收。当前采用剪藏Vue/WXT、发布MultiPost React独立架构并统一扩展入口；开发状态以[2026-10-10交接](2026-10-10-publishing-handoff.md)及AGENTS.md为准。

日期：2026-10-08。性质：Wayfinder 研究结论，供后续架构决策；没有实施业务代码，也没有以真实账号试发。

## 已确认的目标

最终是一个 WXT/Vue 剪藏扩展，复用 MultiPost 平台脚本。Skill 展示内容并得到用户发布指令后自动执行；支持自用多账号、多台电脑；API 同时支持本机和服务器部署。本文不重新决定这些前提。

## 结论

推荐保留根项目 WXT/Vue，逐个平台移植发布适配器，新增自有任务执行层。不要直接合并两个扩展后台或把 React 发布界面整体嵌进去。MultiPost 的价值主要在页面填写/上传逻辑、平台地址和字段映射；现有任务调度、账号缓存及“完成”语义不足以作为可靠 API 发布系统。

“复制源码”只是研究材料到位，根项目现在没有发布工作台。根项目入口仍是剪藏弹窗、抖音收藏侧栏和设置页，不能沿用旧工作台已存在的设计前提。[根后台](../../entrypoints/background.ts)、[构建配置](../../wxt.config.ts)

## 源码事实与改造边界

调查已逐文件核对：原始 MultiPost 仓库 228 个跟踪文件均与提交 `9e9138831b7a3c782d9010f7dfd1ae6d474ebe11` 一致；复制目录中 227 个文件字节一致，仅 `CLAUDE.md` 的构建说明调整并新增 `AGENTS.md`，发布源码没有改动。以下 MultiPost 证据链接固定到该上游提交；根项目证据使用仓库内相对路径。

| 范围 | 已查事实 | 对整合的影响 |
|---|---|---|
| 框架 | MultiPost 使用 Plasmo、React、HeroUI、`@plasmohq/storage`；根项目 WXT/Vue | 只搬脚本及必要类型，不需要引入完整 React UI；替换 `~` 路径别名、存储包装和 Plasmo 入口配置 |
| 平台脚本 | 小红书图文、抖音视频的注入函数仅导入类型，辅助函数写在函数体内 | 有直接复用价值；函数注入不能依赖外部闭包，若抽共享工具必须改为打包 content script |
| 发布协调 | `createTabsForPlatforms` 建标签页、分组并监听加载事件；注入调用没有收集结果 | 不能把标签页创建、回调返回视为发布成功；加载竞态、超时、取消和页面跳转都需要重做 |
| 类型 | `SyncData` 只有平台列表、内容和 `isAutoPublish`；注入接口为 `Promise<void>` | 缺任务/子任务、账号目标、确认快照、尝试编号、租约、结构化结果 |
| 状态 | `currentSyncData`、`tabsManagerMessages` 为后台内存变量 | 浏览器或 worker 重启后无法可靠恢复，必须持久化并与 API 对账 |
| 账号 | `Record<accountKey, AccountInfo>` 按平台覆盖；部分平台没有账号刷新器 | 不等于多账号系统；需设备/浏览器配置实例与平台账号分别建模，执行前重新验证账号 |
| 素材 | `FileData` 主要是 URL，脚本在页面 `fetch(url)` 后创建 File；视频另有 `videoFile` | 原始本机路径、跨设备 blob URL、File 对象都不能直接作为 REST 传输协议 |

证据：[package.json](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/package.json)、[common.ts](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/common.ts)、[小红书图文](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/dynamic/rednote.ts)、[抖音视频](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/video/douyin.ts)、[后台](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/background/index.ts)、[标签管理](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/background/services/tabs.ts)、[账号](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/account.ts)。

### 官方服务器耦合不能只改一个 URL

后台 API 服务把生产 host 固定为 `https://multipost.app`，以 apiKey、extensionClientId 定时 ping；收到 NEW_TASK 后只是打开服务器给定页面，不是领取完整、排他的任务。安装流程打开官方安装页，并初始化官方信任域；刷新账号也会调用 ping。必须替换这些入口，同时清理关联设置和授权页的调用链。[API 服务](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/background/services/api.ts)、[后台](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/background/index.ts)、[账号](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/account.ts)

页面桥梁目前接受 window.postMessage，经后台验证发起域后转发。这是网页控制扩展的通道；自建 API 拉取模式不需要原封不动保留。若保留调试或网页提交能力，必须单独设计来源检查、消息白名单和任务确认校验，不能让任意网页直接发自动发布命令。[页面桥梁](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/contents/extension.ts)

### 结果语义是最大缺口

小红书和抖音示例存在点击发布按钮后结束的路径，没有统一作品 ID、链接、审核状态和成功证据回传。小红书图片逐张上传失败后会记录日志继续，因此“函数执行完”甚至不保证素材齐全。公众号文章脚本调用后台接口创建文章并跳到编辑页，界面写“文章同步成功”；这只能作为草稿/编辑阶段的证据，不能表述为已公开发布。[小红书](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/dynamic/rednote.ts)、[抖音](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/video/douyin.ts)、[公众号](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/src/sync/article/weixin.ts)

建议适配器报告阶段与证据，明确区分：填写完成、草稿已保存、提交成功待审核、公开发布、需要人工处理、失败、结果未知。不是每个平台都能自动证明所有状态；未知结果不得自动重新点击发布。

## 推荐架构（提案，待决策）

Skill → REST API（任务真相源）→ 扩展执行器（领取、持久化、续租、事件回传）→ 平台适配器（账号校验、填写、上传、提交、验证）。Vue 界面只负责设备绑定、任务进度和人工处理入口；剪藏功能保持独立模块。

1. **服务端拆子任务**：每个平台 × 账号 × 内容版本为一个发布目标；用户确认绑定不可变快照，修改正文、素材或目标需重新确认。API 提交幂等键与执行租约分别解决重复提交、多人领取，不能混为一件事。
2. **设备按浏览器配置实例注册**：同电脑多个浏览器 profile 是不同执行器；不要假设同一 cookie 会话能同时登录同平台多个账号。API 路由只给匹配账号的在线执行器，发布前验证实际账号。当前脚本不足以证明所有平台均能提取稳定账号 ID，这一缺口必须进入平台验收。
3. **两种部署共用协议**：本机 API 可处理本地素材；服务器 API 先接收上传并发可下载资产引用。远端电脑不能访问另一台机器的 localhost。一个任务只能隶属一个 API 命名空间，禁止在本机/服务器之间自动镜像执行。
4. **素材先验证再提交**：使用资产 ID、文件名、媒体类型、字节数、摘要以及受控下载 URL。明确访问范围、过期刷新和失败规则；大型视频应支持流式/分块策略，不能默认把整段视频 base64 放入消息。执行环境要实测 CORS 与下载权限，不能假定扩展的 host 权限自动授权页面 fetch。
5. **执行可恢复**：状态落盘；后台采用事件/alarms 驱动轮询与恢复，持久化正在执行的标签页、阶段与回传待办。不复用“量子保活”定时写 storage。Chrome 文档说明 worker 会终止、全局状态会丢失，必须按可中断设计。[worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
6. **提交边界单独保护**：填写阶段可按规则重试；发布点击前必须获得当前有效执行权并记录提交意图。点击后崩溃、租约过期或回传丢失均进入核对流程，不自动交给第二台电脑重发。浏览器发布无法靠 API 幂等键保证平台端严格 exactly-once。
7. **消息和权限**：新增独立消息命名空间，并验证发送者、任务和标签页关联。根项目已有 tabs、scripting、storage、sidePanel 和广泛 host 权限；alarms 是否新增、tabGroups 是否保留、剪贴板是否确需使用应逐项评估。默认 isolated world；只有确需页面对象时使用受限 MAIN 桥梁，API 密钥不进入页面。[权限现状](../../wxt.config.ts)、[content script 隔离](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

Chrome 官方指出 content script 的跨域请求仍受页面来源约束；有 host 权限的扩展后台可承担受控下载，但不得做接受任意 URL 的通用代理。自建 API 凭据留在扩展后台，平台登录凭据留在执行浏览器。

## 选项比较

| 选项 | 收益 | 成本/结论 |
|---|---|---|
| WXT/Vue + 移植平台适配器 | 一个包，一个后台，沿用当前界面体系；可逐个平台验收 | 需改任务与结果接口；推荐进入架构决策 |
| WXT 中同时携带整套 React 发布 UI | 可短期保留原界面 | 双 UI 依赖、存储和消息重叠；原结果/调度问题仍须重写，不推荐默认采用 |
| 继续两个扩展互相通信 | 上游更新分离 | 不符合用户“整合一个扩展”的终点，仅可作开发对照，不作为交付方案 |

## 后续决策与验收输入

待人机决策：发布任务入口与人工处理界面放哪里；浏览器支持范围（既有 Firefox 构建不等于新发布流程已支持 Firefox）；多账号如何绑定与核验；各平台哪些类型承诺自动发布、哪些只到草稿；素材保留/部署认证；并发和恢复策略。

至少验证：同任务重复提交只产生一个目标任务；两设备抢领只有一个执行；发布前账号切换能阻止错发；素材不全不提交；worker/浏览器重启恢复；发布后断网不重发；验证码回报人工处理；草稿/审核中不冒充公开成功；剪藏与抖音收藏入口仍可使用；断开官方服务器后流程正常。

本次没有改产品源码，不需要构建验收；研究结论不能替代各平台当前页面的真实浏览器验收。移植时保留现有 Apache-2.0 LICENSE 和上游来源说明，逐个记录脚本变更。[随附许可证](https://github.com/leaperone/MultiPost-Extension/blob/9e9138831b7a3c782d9010f7dfd1ae6d474ebe11/LICENSE)
