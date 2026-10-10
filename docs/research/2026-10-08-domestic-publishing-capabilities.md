# 国内八个平台发布能力调研

> 历史调研快照（2026-10-08）：平台能力与架构建议不代表当前实现或验收。当前采用剪藏Vue/WXT、发布MultiPost React独立架构并统一扩展入口；开发状态以[2026-10-10交接](2026-10-10-publishing-handoff.md)及AGENTS.md为准。

日期：2026-10-08。范围：Wayfinder「核实国内平台发布类型与自动化边界」。这是桌面调研，不是运行验收；没有登录、上传或发布。用户已决定整合进剪藏扩展、Skill 确认后自动发布、自用多账号/多电脑、本机和服务器 API 均支持。

## 结论和证据边界

MultiPost 源码可作为适配器起点，不能把存在脚本、点击按钮、跳转管理页当成已经发布成功。公众号当前仅创建内容并跳编辑页；知识星球文章明确标记 experimental；头条文章只点击“预览并发布”，是否还有确认步骤未核实。其余脚本也缺少可统一依赖的最终发布证据。

本次审阅的是共享工作区 `MultiPost-Extension/src/sync/` 的文件；它们尚未被根仓库跟踪，因此下文源码路径是本机审计定位，而不是假装已存在的 GitHub 文件链接。引入记录的上游提交为 `9e9138831b7a3c782d9010f7dfd1ae6d474ebe11`，不能据此保证本机副本完全相同。发布页很多需要登录或为动态页面；官方网页无法读取时明确列为未知，未以第三方教程代替官方确认。

## 类型及完成程度矩阵

“脚本覆盖”只代表静态实现存在；全部尚未完成本项目真实账号验收。“原生类型”区分官方确认的平台能力与当前网页入口，避免把 App / API 能力直接等同电脑网页能力。

| 平台 | 官方原生能力及当前网页核实 | MultiPost 脚本覆盖 | 自动操作终点 | 缺少的验收证据 |
|---|---|---|---|---|
| 公众号 | 官方发布页本轮无法打开；文章/图片消息由代码体现，当前原生网页全部类型未知 | article/weixin.ts 富文本文章；dynamic/weixin.ts 图片动态 | 调用 operate_appmsg 得 appmsgid，跳到编辑页；未执行正式发表/群发 | 草稿持久化读取；正式发表授权/扫码路径；作品 ID 与公开链接。不得报 published |
| 视频号 | 官方网页本轮无法打开；图文、视频入口由代码体现，现行网页类型需账号核实 | dynamic/weixinchannel.ts 图片动态；video/weixinchannel.ts 视频 | 自动模式点“发表”；视频支持填写定时时间 | 提交响应、作品 ID、审核/发表状态；图文是否全账号可用 |
| 小红书 | 官方分享平台确认图文和视频，但这是 App 分享；创作者网页可访问登录页，登录内类型未核实 | dynamic/rednote.ts 图文；video/rednote.ts 视频 | 点发布，固定等待后主动跳管理页 | 跳转不是成功证据；需笔记 ID、管理页条目与状态；长文入口未核实且无独立脚本 |
| 抖音 | 官方 API 确认视频、权限表含单图；创作者网页无可读内容，网页多图由代码体现 | dynamic/douyin.ts 至少一张图的图文；video/douyin.ts 视频 | 点发布；视频有定时填写 | 作品 ID、审核状态；定时不能记立即公开；纯文本不能直接走现有图文脚本 |
| 微博 | 官方客服确认电脑端头条文章及个人主页/文章列表回查；普通动态/视频网页能力本轮未从官方帮助单独核实 | dynamic/weibo.ts 文本/图片；video/weibo.ts 视频；article/weibo.ts 文章 | 动态/视频点发布；文章有草稿接口及 DOM 下一步/发布路径 | 草稿保存与正式发布分离；DOM 返回 true 仍仅代表点击，需 mid/文章 ID 与回查 |
| 即刻 | 官方网页无可读编辑器；原生网页类型未独立核实 | dynamic/okjike.ts 文本/图片；video/okjike.ts 视频 | 动态点发送；视频点发布；有上传等待 | 帖子 ID、详情地址、账号/圈子一致性；不应把话题搜索首项回退当成用户选择 |
| 今日头条号 | 官方开放平台确认视频及存在头条图文；当前网页无可读内容，微头条入口由源码体现 | article/toutiao.ts 文章；dynamic/toutiaohao.ts、dynamic/toutiao.ts 微头条；video/toutiaohao.ts 视频 | 文章点预览并发布；微头条/视频点发布 | 文章后续确认步骤未知；作品 ID、审核状态；统一 Toutiao 与 Toutiaohao 平台别名，避免重复投递 |
| 知识星球 | 官方确认主题文字/图片/附件/音频，视频有角色及申请限制；长文章存在。具体网页编辑权限需登录核实 | dynamic/zsxq.ts 文字/图片主题；article/zsxq.ts 文章（实验） | 自动模式点发布；无独立视频/附件/音频适配器 | 星球 ID、角色权限、主题 ID 与回读；文章选择器线上有效性未知 |

## 源码定位

以下路径均以 `/Users/qiushui/work/qiushui/qiushuiai-web-clipper/MultiPost-Extension/src/sync/` 为前缀。注册表为 `dynamic.ts`、`article.ts`、`video.ts`；不是只根据 README 认定覆盖。

- 公众号：`article/weixin.ts:560-588`、`dynamic/weixin.ts:307-327`。拿到 appmsgid 后导航编辑器，“同步成功”文案不证明正式发布。
- 视频号：`dynamic/weixinchannel.ts:330-380`、`video/weixinchannel.ts:515-534`。图片有附件数量检查，但最终仅派发发表操作。
- 小红书：`dynamic/rednote.ts:118-139`、`video/rednote.ts:245-264`。管理页跳转由脚本发起，不能用于判定发布成功。
- 抖音：`dynamic/douyin.ts:30-37,125-136`；`video/douyin.ts:205-257`。至少一图要求是本脚本边界，不能外推平台原生限制。
- 微博：`article/weibo.ts:565-592,639-689`，`dynamic/weibo.ts:146-170`、`video/weibo.ts:207-236`。文章 DOM 路径点击后直接 return true。
- 即刻：`dynamic/okjike.ts` 的 `createImageFiles`、`handleTopicSelection` 和自动发送分支；`video/okjike.ts:89-115`。图片截到九张与话题首项回退须在接入时显式处理，不能静默丢素材或改圈子。
- 头条：`article/toutiao.ts:139-150`、`dynamic/toutiaohao.ts:119-132`、`video/toutiaohao.ts:162-181`。
- 知识星球：`article/zsxq.ts:3-6,69-78`、`dynamic/zsxq.ts:113-127`。实验标记必须保留为能力状态，不得展示成已验证支持。

## 官方来源（访问于 2026-10-08）

- [小红书分享能力](https://agora.xiaohongshu.com/doc/ability)：确认 App 图文/视频分享；[JS SDK 文档](https://agora.xiaohongshu.com/doc/js)明确分享 SDK 不再支持自动填充标题、文案、话题。这个限制属于官方 SDK，不能直接推导 DOM 自动化能否工作。[创作者网页](https://creator.xiaohongshu.com/)本轮仅见登录界面。
- [抖音创建视频](https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/create/create-video)：创建后会审核，审核中仅自己可见；调用需要权限与用户授权。[权限表](https://open.douyin.com/platform/resource/docs/accession-guide/type-and-permission)列出单图与视频；不是网页端多图的验证。[创作者中心](https://creator.douyin.com/)未返回可读正文。
- [头条发布视频](https://open.douyin.com/platform/resource/docs/openapi/video-management/toutiao/create-video/publish-video)：发布后审核，重复 video_id 不生成新视频；这是官方 API 特性，不能挪用于 DOM 重试。[内容发布方案](https://open.douyin.com/platform/resource/docs/ability/content-management/douyin-publish-solution/)提及头条图文。[头条号网页](https://mp.toutiao.com/)重定向到 profile_v4，未返回编辑器正文。
- [微博官方客服：头条文章](https://kefu.weibo.com/faqdetail?id=20850)：确认电脑入口、个人主页及文章列表回查；[头条文章常见问题](https://kefu.weibo.com/faqdetail?id=21667)确认定时功能和部分字段权限因用户而异。
- [知识星球产品介绍](https://www.zsxq.com/)确认文字、图片、文件、音频；[官方常见问题](https://help-docs.zsxq.com/faq/faqs.html)列主题与视频；[角色权限](https://doc.zsxq.com/member-role-permissions.html)明确视频需申请且角色受限；[官方长文章提及](https://doc.zsxq.com/planet-repost-feature.html)。这些资料不保证网页和 App 完全等价。
- [公众号](https://mp.weixin.qq.com/)、[视频号](https://channels.weixin.qq.com/)本轮检索/打开失败；[即刻网页](https://web.okjike.com/)未返回可读正文。未知必须保留，不能把网络不可读说成平台不支持。

## 提供给后续决策的建议（尚非产品决策）

1. 能力表按“平台 + 内容类型 + 账号/星球权限”维护，分别记录 native、implemented、verified、autoPublish、draft、evidence；本报告所有 verified=false。对尚未验证的类型先展示“待验证”，而不是承诺自动发布。
2. 提交不等于公开：至少区分 filled、draft_saved、submitted、under_review、published、needs_attention、failed、outcome_unknown。确认按钮点下后若断线，归入 outcome_unknown，先查结果，不自动重复发布。
3. 每项类型上线门槛：目标账号校验、素材完整、一次真实测试（需另行发布指令）、返回平台 ID、可回查状态、验证码暂停、超时及重复任务不会重复发。公众号草稿与正式发表须分别验收。
4. 用户确认应绑定内容版本、平台、账号、目标圈子/星球。不能让即刻话题回退、截断图片等脚本行为悄悄改变已确认内容。多电脑必须靠任务租约和平台账号绑定，不用脚本内 isAutoPublish 代替确认记录。

本研究票可结为“桌面调研已完成，证据与未知已列清”；不代表八个平台达到发布验收。后续需把登录态类型探测及结果确认纳入开发方案的验证任务。
