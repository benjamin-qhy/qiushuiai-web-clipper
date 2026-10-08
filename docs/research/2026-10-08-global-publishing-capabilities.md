# TikTok、YouTube、领英、脉脉、Medium 发布能力调查

日期：2026-10-08。用于“Skill → 自建 REST API → 当前剪藏扩展 → 发布平台”的开发方案；本文是桌面调研，不是已验收能力清单。未登录账号、未上传素材、未真实发布。

## 结论矩阵

| 平台 | 官方资料能够确认的网页原生类型 | 本地 MultiPost 脚本覆盖 | 自动发布及结果证据 | 规划建议（尚待决策） |
|---|---|---|---|---|
| TikTok | Studio 网页视频；网页版图片帖、纯文字帖本轮未核实，不把 App 能力等同网页 | 视频、标题/文案/话题、封面；VIDEO_TIKTOK | 根据 isAutoPublish 点击 Post/发布/發佈；没有完成状态、作品 URL 或作品 ID 检验 | 视频适配可复用；图片/文字保留未知，不能承诺支持 |
| YouTube | Studio 视频；频道帖子可发文字、图片/GIF、视频引用、投票等 | 视频上传、标题、描述、封面；VIDEO_YOUTUBE；没有社区帖子实现 | 仅查找中文“发布”按钮；未实现完整逐步上传流程、受众与可见性设置；无发布证据 | 视频适配需补完整流程；社区图文属于新增适配 |
| 领英 LinkedIn | 文字/链接、图片、视频、文档、文章；文章为桌面功能 | Dynamic 文字、图片、视频；没有文档或长文章适配 | 有 isAutoPublish 点击分支；固定等待后点击，无作品证据；部分错误仅记录日志 | 动态适配可复用；文章与文档需新增；同一条混合图片视频不能按现有实现承诺 |
| 脉脉 | 本轮未取得平台官方发布帮助证明网页当前类型；不能用平台上用户文章代替官方文档 | Dynamic 文字、最多 9 图或首个视频；有选填标题和话题 | 点击“发动态”；无上传完成和发布结果检验；错误可能只记录日志 | 文字/图文/视频列为候选，必须登录实测后才承诺；长文章未知 |
| Medium | 长文章、文章内图片、第三方视频等链接嵌入；嵌入不等于原生视频上传 | ARTICLE_MEDIUM 填标题、粘贴 HTML 正文 | 自动分支只尝试一个选择器，未覆盖官方 Publish → Publish now 两阶段；无草稿保存或公开作品证明 | 文章填充可参考；图片转换和最终发布流程需重做验证；不列原生视频支持 |

以上五个平台均没有从现有脚本中发现足以向 Skill 承诺“已发布”的完整结果确认。`isAutoPublish=false` 只表示不点击最终按钮，不等于已经保存草稿。

## 官方依据与边界

- **TikTok**：[Tools for creators](https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok?lang=nl)明确区分 App 与 Web，网页 Upload 段提供视频上传与发布，注明地区/资格差异。主 `making-a-post` 帮助页被检索工具 robots 限制，部分 Studio 页无正文；检索可读的官方创作者工具文档仍支持“网页视频”，不足以证明网页图片/文字。本报告不将较旧页面中的大小、时长限制固化为接口常量。
- **YouTube**：[上传视频](https://support.google.com/youtube/answer/57407?hl=en)区分 upload 与 publish，关闭尚未选可见性的上传窗口可能留下 private 视频，故“上传完成”不能映射为公开发布；[创建帖子](https://support.google.com/youtube/answer/7124474?co=GENIE.Platform%3DDesktop&hl=en)证明桌面文字、图片/GIF及视频引用等类型。Shorts 分类应按另行核实的素材规则处理，本轮不承诺 Shorts 单独适配。
- **领英**：[开始发布](https://www.linkedin.com/help/linkedin/answer/a518996/?lang=en)列出文字、视频、图片、文章以及更多菜单中的文档；[发布文章](https://www.linkedin.com/help/linkedin/answer/a522427/publishing-articles-on-linkedin?lang=en)说明个人或有权限的 Page 身份与文章最终发布步骤。个人账号和组织 Page 不能仅按同一登录态混同。脚本的 8 个媒体上限只是实现限制，不是平台官方上限。
- **脉脉**：[脚本对应网页入口](https://maimai.cn/community/home/following)无法由本轮检索工具读取。官方域名搜索返回的是用户撰写的文章，故未作为原生能力证据。代码的 9 图限制同样只标记实现行为。
- **Medium**：[撰写与发布](https://help.medium.com/hc/en-us/articles/225168768-Writing-and-publishing-your-first-story)说明 draft 自动保存、图片插入、第三方媒体 URL 嵌入与 Publish/Publish now 两阶段；[图片帮助](https://help.medium.com/hc/en-us/articles/215679797-Using-images)说明图片上传。网页自动保存机制存在，不代表脚本运行后保存成功已得到验证。

## 本地源码依据

调查读取的是共享工作区 `MultiPost-Extension/`，项目记录上游引入提交为 `9e9138831b7a3c782d9010f7dfd1ae6d474ebe11`。该目录在调查时尚未纳入根仓库提交；研究分支只提交本文，不把研究分支基线误称为 MultiPost 源码版本。以下路径均相对此目录；对应实现以本地读取内容为准。

| 文件 | 关键证据 |
|---|---|
| `src/sync/video/tiktok.ts` | 118–155 上传视频/文案/封面；160–170 按按钮文本点击，无后续验证；错误重新抛出，但按钮缺失无失败结果 |
| `src/sync/video/youtube.ts` | 71–165 上传和填写；169–183 仅中文按钮查找，catch 不重新抛出；缺少受众/可见性/下一步流程 |
| `src/sync/dynamic/linkedin.ts` | 65–105 打开编辑器、文本填入；109 起合并媒体，最多 8 个，粘贴上传；末尾固定 5 秒等待后点击，无完成检查 |
| `src/sync/dynamic/maimai.ts` | 读取 DynamicData；图片/视频合并后如有视频只取首个，否则最多 9 张；末尾点击“发动态” |
| `src/sync/article/medium.ts` | 59–87 标题与 HTML 粘贴；89–97 单一选择器可选点击，失败仅 console.error；未建立最终发布或 draft 回执 |
| `src/sync/video.ts`、`dynamic.ts`、`article.ts` | 分别注册 VIDEO_TIKTOK、VIDEO_YOUTUBE、DYNAMIC_LINKEDIN、DYNAMIC_MAIMAI、ARTICLE_MEDIUM及其入口 |

## 对下一步方案的约束

用户已确认：Skill 展示最终内容并取得发布指令后自动执行；自用多账号/多电脑；API 同时支持本机与服务器。建议下游决策据此满足：

1. 能力按“平台 × 类型 × 账号 × 适配器版本”声明。平台原生支持、脚本存在、真实验收通过分别记录。账号登录只证明可访问，不证明有目标发布资格。
2. 任务明确账号和执行浏览器配置；执行前重新核对身份。领英个人/Page、YouTube 频道等不能以展示名称作为唯一身份。
3. 点击提交前记录提交边界；提交后断线/超时归为结果未知并核对已有作品，不能自动再次点击。已提交待处理、已保存草稿、已公开发布、需要人工处理分别表达。
4. 可复用脚本必须补“上传完成、必填项、最终确认、结果回读”；证据至少关联任务、平台账号、作品 ID/URL 或后台明确状态以及核验时间。Medium 自动保存、YouTube private 视频不得被包装成公开发布。
5. 本轮没有核验页面选择器仍有效；实现前应逐个平台、逐种内容登录验收。视频上传的大素材等待、网络中断、账号切换、验证码、浏览器重启、多电脑重复领取都要进入后续验收定义。

本研究票可以以“明确已知与未知”关闭；这不等于平台发布功能验收，也不替代后续的范围、接口、身份、重试及验收决策。
