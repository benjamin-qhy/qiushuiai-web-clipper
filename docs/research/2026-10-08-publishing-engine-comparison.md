# PostBot / MultiPost 发布能力迁移评估

日期：2026-10-08。结论基于用户提供的本地源码，并交叉核对官方 GitHub README 和许可证；未安装依赖、构建这两个项目或使用真实账号执行发布。平台注册项不代表当前线上可用，更不代表全部支持自动提交。

## 结论

推荐 **选择 MultiPost-Extension 的发布适配器作为迁移基础**，保留当前 WXT + Vue 宿主和 React 内容工作台。先接小红书图文、微信公众号稿件与知乎文章，逐个平台验证后再扩展。

PostBot 的理念值得参考，但所给 1.3.1 快照依赖仓库外核心实现，且许可证有品牌和多租户附加条件；当前不适合直接整体搬入。MultiPost 1.5.1 的公开发布脚本更容易逐个抽取，但也不是复制后就能保证发布成功的成品。

| 对比 | PostBot | MultiPost |
| --- | --- | --- |
| 扩展技术 | Plasmo、Vue 3、TypeScript、Ant Design Vue | Plasmo、React 18、TypeScript、HeroUI |
| 架构 | 插件注册、发布引擎、内容转换、平台包，模块多且核心外置 | 按文章、动态、视频、播客注册平台，后台打开网页并注入适配函数 |
| 本地可检查程度 | 保留平台脚本，但当前入口转向外部包及仓库外路径 | 注册表及平台脚本直接包含在源码中 |
| 当前项目迁移 | 需先补齐引擎依赖、核实包许可证和运行链路 | 可抽取脚本，重写少量宿主连接与可靠性机制 |
| 许可 | Apache 2.0 加额外限制 | 公开部分为标准 Apache 2.0；官方 Agent 不在本仓库中 |
| 建议 | 参考架构，暂不选作基础 | 首选，按平台渐进迁移 |

官方交叉核对：[PostBot 仓库](https://github.com/gitcoffee-os/postbot)、[MultiPost 仓库](https://github.com/leaperone/MultiPost-Extension)、[PostBot LICENSE](https://raw.githubusercontent.com/gitcoffee-os/postbot/main/LICENSE)、[MultiPost LICENSE](https://raw.githubusercontent.com/leaperone/MultiPost-Extension/main/LICENSE)。判断具体快照行为以本地源码为准。

## 当前项目具备什么，缺什么

当前项目已经具备来源 Markdown、AI 创作稿、图片卡片渲染、逐页 PNG 与 ZIP 导出。但还没有社交平台发布任务、账号状态、平台能力表和发布结果回执。

证据：

- [工作台契约](/Users/qiushui/work/qiushui/qiushuiai-web-clipper/packages/content-publishing-workbench/src/types.ts:78)：`WorkbenchAdapters` 提供生成、保存、下载等接口，没有发布接口。
- [宿主适配器](/Users/qiushui/work/qiushui/qiushuiai-web-clipper/src/publisher/adapters.ts:12)：浏览器能力集中在宿主侧，适合增加发布入口。
- [卡片导出](/Users/qiushui/work/qiushui/qiushuiai-web-clipper/packages/content-publishing-workbench/src/export/exportCards.ts:129)：可复用 `renderCardToPng` 生成图片素材，不必先下载 ZIP 再解压。
- [扩展配置](/Users/qiushui/work/qiushui/qiushuiai-web-clipper/wxt.config.ts:14)：已有 tabs、scripting 和站点权限；MultiPost 使用的 tabGroups、剪贴板能力要按所选适配器增补或去除依赖。
- [架构约定](/Users/qiushui/work/qiushui/qiushuiai-web-clipper/docs/adr/0001-isolate-the-react-content-publishing-workbench.md:1)：React 工作台通过适配器与 WXT 宿主隔离，应延续此边界。

## 推荐迁移方式

这是建议方案，尚未实施。

```text
当前工作台：创作稿 / 卡片图片
    ↓ 发布适配接口
WXT 宿主：素材转换、任务保存、打开目标网页
    ↓
从 MultiPost 抽取的平台脚本
    ↓
目标平台编辑页：填写 / 保存草稿 / 提交
    ↓
逐平台显示可核实的结果
```

1. **保留现有 UI 和构建体系。** 不迁入 Plasmo、HeroUI 或其整套编辑器；把需要的平台脚本和最少工具代码移入宿主发布层。React 18 与当前 React 19 的差异因此不构成核心障碍。
2. **建立内容转换。** Markdown 文章转换为标题、正文 HTML、Markdown、封面；小红书卡片转换为标题、正文、图片列表。标题、摘要、封面和标签需可人工调整，不能直接把整篇长文当作所有平台的短文案。
3. **处理图片传递。** MultiPost 小红书脚本使用 `fetch(fileInfo.url)` 获取图片；扩展页的临时 Blob URL 不能未经验证就假设能跨站读取。需要可跨上下文传递的素材方案，小图可使用 data URL，大素材采用持久化及受控传递；先验收图片上传再扩展视频。
4. **重做最小任务状态。** 持久化任务 ID 和每个平台的阶段，区分等待登录、填写完成、草稿保存、发布确认、失败。不要照搬“打开标签页便返回 success”的语义。提交后不自动盲目重试，以免重复发布。
5. **先 Chromium，后 Firefox。** Chrome/Edge 与原项目的 chrome API 最接近；Firefox 需要单独处理 tabGroups、侧边栏以及脚本/剪贴板差异，不能因为当前剪藏支持 Firefox 就认定发布也支持。
6. **保留纯 Web 预览边界。** 普通 Vite 预览不能直接调用扩展权限；继续使用模拟适配器。真实发布放在扩展宿主，未来确需网页调用时再增加通信桥。

不需要把 MultiPost 官方 API Key、官网轮询、账号绑定和远程任务入口带入当前产品。本地页面发布脚本可作为独立能力使用；官方 REST 服务与闭源 Agent 不在本次可复用范围中。[官网轮询源码](/Users/qiushui/Downloads/testfiles/MultiPost-Extension/src/background/services/api.ts:1)。

## 第一阶段验收建议

- 小红书：当前工作台生成的卡片可完整上传，标题正文正确，先停在待确认页面。
- 微信公众号：封面和正文进入稿件编辑页；明确显示“稿件已创建”，不能显示“已群发”。
- 知乎：文章内容、图片和格式正确进入编辑页，保存/提交状态分别确认。
- 未登录、页面改版、图片失败、侧栏关闭与任务重试有明确结果；不能在点击发布按钮后直接报告成功。

当前没有视频选取、视频持久化与音频编辑链路，第二阶段再考虑抖音、视频号、B站、快手等视频平台。迁移难度判断为：少量图文平台中等；完整覆盖全部注册项较高，主要成本在逐平台真实验收和后续维护。

## 许可与运行限制

MultiPost 的公开代码可按 Apache 2.0 条件复用，分发时保留许可证、适用的版权/NOTICE，并标记修改。其官方发行版的闭源 Agent 不随本仓库提供。PostBot 本地 LICENSE 的额外条款对多租户运营及前端品牌修改作出限制，不能仅凭 GitHub 的 Apache 标识视为同等许可；单独抽取代码仍需核对相关条款及外部包授权。

两者都需要目标网站的有效登录状态。网页自动操作和站内接口依赖平台现状，网站改版、验证或接口变化会使脚本失效。本次是源码可行性评估，未证明任何平台在当前账号下可成功发布。

## 本地源码详细证据与完整平台注册清单

源码快照：PostBot `49e55ad7332e6f6be4f1f108c51eda8ea14e8af8`；MultiPost `9e9138831b7a3c782d9010f7dfd1ae6d474ebe11`。本节 PostBot 相对路径以 `/Users/qiushui/Downloads/testfiles/postbot` 为根，MultiPost 相对路径以 `/Users/qiushui/Downloads/testfiles/MultiPost-Extension` 为根。

## PostBot

- Plasmo 0.90.5 + Vue 3.5 + Ant Design Vue + TS + Tailwind，版本 1.3.1；大量核心在 @gitcoffee 包，含 publish-engine、publisher-cn/it/industry、后台、媒体、存储与 AI 修复。证据：`/Users/qiushui/Downloads/testfiles/postbot/package.json:4-50`。
- 发布链：`src/background/index.ts:1-21` 初始化插件/后台；`src/plugins/index.ts:1-12` 引擎插件；`src/tabs/index.ts:33-35` 标签页；`src/media/publisher/publisher.script.ts:80-150` 注入发布器、AI 选择器修复、失败后端上报。
- **checkout 缺关键源码**：`src/media/publisher/publisher.script.ts:16` 和 `src/plugins/index.ts:2` 都导入仓库外 `/Users/qiushui/Downloads/packages/postbot-engine/publisher-cn/src/index`。已验证该路径及 `.ts` 文件不存在，不能把 checkout 当成可独立构建交付。其他 @gitcoffee 包未安装/验证其实现与单独许可。
- 本地旧脚本如 `src/media/publisher/platform/moment/xiaohongshu.publisher.ts:175-214` 上传图片、219-244 填写、247-255 点击发布、305-307 受 isAutoPublish 控制。但当前发布器从外部 publisherEntries 合并（publisher.script.ts:16-39），不能认定旧脚本就是运行版。

本地目录 `src/media/platform/index.ts:310-571` 共 41 个内容类型注册项（非验证结果）：

- 文章 14：公众号、今日头条、小红书、知乎、微博、百家号、企鹅号、视频号、抖音、快手、B站、豆瓣、简书、知识星球。
- 动态 12：微博、今日头条、小红书、百家号、知乎、公众号、视频号、抖音、快手、B站、豆瓣、知识星球。
- 视频 9：抖音、快手、B站、视频号、今日头条、企鹅号、小红书、微博、知乎。
- 音频 6：网易云音乐、QQ音乐、喜马拉雅、蜻蜓FM、荔枝FM、小宇宙。

README.md:60-61 对国际平台用“可轻松扩展兼容”，不能据此认定已有 X/Facebook/Instagram/TikTok/YouTube/LinkedIn 实现。IT/行业扩展依赖源码不在此 checkout，完整运行覆盖未知。

## MultiPost-Extension

- Plasmo 0.90.5 + React 18.2 + HeroUI 2.7.8 + TS 5.2 + Tailwind，版本 1.5.1；Readability/Turndown 提取/转换，@plasmohq/storage 持久化。证据 `/Users/qiushui/Downloads/testfiles/MultiPost-Extension/package.json:4-48`。
- `src/sync/common.ts:18-94` 定义 SyncData（platforms、isAutoPublish、图文/文章/视频/播客）、HTML/Markdown 文章、FileData、平台 injectUrl/injectFunction。
- `src/sync/common.ts:136-229` 打开创作页、分组、等待加载、chrome.scripting.executeScript 注入函数；依赖浏览器登录态，不是统一官方 API。
- 小红书 `src/sync/dynamic/rednote.ts:47-134` 获取文件、上传/填表/模拟粘贴、可自动点发布。公众号 `src/sync/article/weixin.ts:178-228,426-438,560-585` 登录态私有接口上传、创建文章草稿后跳编辑页，**没有群发发布**。“文章同步成功”不代表公开发布。
- 稳定性需修整：`src/sync/common.ts:168-196,213-226` 只等待后续 complete 事件，没有已完成检查/超时，可能错过事件或挂起；executeScript 未 await 结果。`src/background/services/tabs.ts:12` 内存保存任务，不是持久任务系统。
- 不整搬后台、网站桥接、keep-alive 或 UI。`src/background/index.ts:24-41` 有 multipost.app 默认信任域和安装跳转，这些不适合带入当前项目。

### 已注册平台

来源 `/Users/qiushui/Downloads/testfiles/MultiPost-Extension/src/sync/{article,dynamic,video,podcast}.ts`，显示名由 `locales/zh_CN/messages.json` 解析；每项均挂载分类目录中的函数。

- 文章 42：博客园、CSDN、知乎、掘金、简书、思否、阿里云、腾讯云、火山引擎、百家号、今日头条、企鹅号、豆瓣、微信公众号、WordPress、哔哩哔哩、少数派、51CTO、雪球、微博、东方财富、Substack、Medium、开源中国、InfoQ、什么值得买、人人都是产品经理、格隆汇、健康界、凯迪网、汽车之家、美篇、同花顺、懂车号、知识星球、网易号、搜狐号、大鱼号、顶端号、快传号、一点号、X。
- 动态 31：哔哩哔哩、抖音、X、小红书、微博、雪球、知乎、Instagram、脸书、领英、即刻、Reddit、Pinterest、快手、搜狐视频、百家号、今日头条、Threads、微信视频号、BlueSky、V2EX、豆瓣、得到、微信公众号、Webhook、知识星球、小黑盒、今日头条号、Substack、脉脉、掘金。
- 视频 30：哔哩哔哩、抖音、YouTube、小红书、Tiktok、微信视频号、快手、百家号、微博、即刻、BlueSky、知乎、东方财富、小黑盒、今日头条号、企鹅号、车家号、得物、易车、搜狐号、搜狐视频、网易号、大鱼号、支付宝、一点号、拼多多、vivo视频、爱奇艺、优酷、腾讯视频。
- 播客 7：QQ音乐（TME）、荔枝、喜马拉雅、小宇宙、蜻蜓 FM、网易云音乐播客、Spotify。

文章目录明确标注实验/待线上验证：阿里云、腾讯云、火山引擎、企鹅号、格隆汇、健康界、凯迪网、美篇（文件名 jianpian）、同花顺、懂车号、知识星球、网易号、搜狐号、大鱼号、顶端号、快传号、一点号、X。见 `src/sync/article.ts:112-145,170-180,347-524`。火山引擎明确仅填标题正文、不自动提交。其余平台亦未在此次做真机验收。

