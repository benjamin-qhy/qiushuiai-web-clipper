# 抖音收藏批量导入设计

日期：2026-05-22
状态：已确认

## 目标

在当前扩展中新增一条仅面向抖音收藏页的批量导入路径：

- 当前页面为 `douyin.com` 且 URL 中含 `showTab=favorite_collection` 时，点击插件图标直接打开右侧侧边栏
- 侧边栏抓取抖音收藏作品列表
- 支持勾选、刷新、逐条提交状态展示
- 批量调用 Get 笔记保存链接
- 记录导入断点，下一次抓取时不重复导入已成功的前缀段

同时统一调整现有 Get 笔记链接保存行为：**所有链接保存请求只传 URL，不传标题**。

## 非目标

- 不改现有飞书、金山、通用网页提取到 Obsidian 的主流程
- 不把抖音收藏导入混入现有书签树管理流程
- 不在本次支持抖音收藏页以外的平台批量导入
- 不做并发提交、后台长任务或自动重试
- 不实现“导出/导入所有缓存”的总入口；本次只为未来统一导出导入预留清晰的存储边界

## 入口分流

点击插件图标时按当前活动 tab 分流：

| 页面类型 | 行为 |
|---|---|
| `douyin.com` 且 query 含 `showTab=favorite_collection` | 直接打开右侧侧边栏 |
| 其他页面 | 保持现有 popup 行为 |

设计要求：

- 抖音收藏页不经过 popup 中转，不出现“先弹 popup 再跳侧边栏”的过程
- 非抖音收藏页保持当前体验，不因为本功能引入回归
- 右侧侧边栏为独立页面，只服务抖音收藏批量导入

## 模块结构

新增/改动文件：

```text
entrypoints/background.ts             # 改动：点击图标分流，抖音页打开侧边栏
entrypoints/douyin-sidepanel/App.vue  # 新增：抖音收藏批量导入侧边栏
src/douyin/collect.ts                 # 新增：列表抓取、URL 归一化、页面判断
src/storage/douyinImports.ts          # 新增：断点与已导入 URL 集合持久化
src/getnote/api.ts                    # 改动：链接保存请求体去掉 title
src/getnote/types.ts                  # 改动：SaveLinkNoteParams 去掉 title
entrypoints/popup/App.vue             # 改动：单篇“保存链接到 Get 笔记”不再传 title
tests/douyin/collect.test.ts          # 新增：页面判断、URL 归一化
tests/storage/douyinImports.test.ts   # 新增：断点存储读写
tests/getnote/api.test.ts             # 改动：断言请求体不含 title
```

## 存储边界

本功能**不复用现有 `bookmarks` 记录模型**，但继续遵循当前项目“按功能域拆分存储模块”的方式，新增独立存储模块：

- `settings`：用户配置
- `bookmarks`：书签整理相关记录
- `folderDescriptions`：文件夹说明
- `douyinImports`：抖音收藏批量导入缓存

这样后续如果要做“导出/导入所有缓存”，最上层只需要把各 domain 聚合成统一结构，而不需要在一个混合模型里拆语义。

## `douyinImports` 数据模型

最小字段如下：

```ts
interface DouyinImportState {
  lastImportedUrl: string
  importedUrlSet: string[]
  lastImportAt?: string
}
```

字段语义：

- `lastImportedUrl`
  - 表示“连续成功段”的最后一条 URL
  - 只在一批任务的成功前缀段确认后推进
- `importedUrlSet`
  - 记录所有已经成功保存到 Get 笔记的规范化 URL
  - 用于兜底去重
- `lastImportAt`
  - 仅用于 UI 展示最近导入时间，不参与逻辑判断

## 页面判断与抓取

### 页面判断

命中规则：

- hostname 为 `douyin.com` 或 `www.douyin.com`
- query 中存在 `showTab=favorite_collection`

不要求 pathname 固定为某一个值，避免把判断绑死在单一路径上。

### 抓取方式

侧边栏通过 `browser.scripting.executeScript` 向当前 tab 注入页面脚本，读取 DOM 中的收藏作品信息。

抓取脚本只负责提取，不负责保存。返回最小必要字段：

```ts
interface DouyinFavoriteItemRaw {
  url: string
  title: string
  cover: string
  likesText: string
}
```

`title` 和 `cover` 只用于侧边栏展示，**不会传给 Get 笔记接口**。

### URL 归一化

抓取结果进入 UI 前先做 URL 归一化。规则保持最小化：

- 用 `new URL()` 解析为绝对 URL
- 去掉 hash
- 保留查询参数
- 输出标准化后的完整字符串

本次不额外裁剪查询参数，避免误删抖音页面识别所需信息。

## 侧边栏工作流

### 初始化

侧边栏打开后执行：

1. 读取 URL 中的 `tabId`
2. 读取 `douyinImports` 缓存
3. 校验当前 tab 是否仍为抖音收藏页
4. 若校验通过，开始抓取；否则显示“当前页不是抖音收藏页”

### 列表建模

每条作品在侧边栏中的本地状态：

```ts
type ItemStatus = 'idle' | 'skipped' | 'saving' | 'success' | 'error'

interface DouyinFavoriteItemView {
  url: string
  title: string
  cover: string
  likesText: string
  normalizedUrl: string
  selected: boolean
  status: ItemStatus
  errorMessage?: string
}
```

初始化规则：

- `normalizedUrl` 在 `importedUrlSet` 里的：
  - `status = 'skipped'`
  - `selected = false`
- 其余项目：
  - `status = 'idle'`
  - `selected = true`

用户可手动勾选或取消勾选非保存中的项目。

### 批量保存

点击“全部保存”后，按当前列表顺序串行提交到 Get 笔记。

接口调用约束：

- 复用 `saveLinkNote()`
- 只传 `linkUrl`
- **不传 `title`**

保存规则：

1. 从上到下遍历已勾选且状态为 `idle` 的项目
2. 单条开始提交时，状态改为 `saving`
3. 单条成功后，状态改为 `success`
4. 记录本次“连续成功段”中的成功 URL
5. 如果某条失败：
   - 当前项状态改为 `error`
   - 记录错误信息
   - 立即停止后续提交
6. 停止后，把本次连续成功段一次性写回 `douyinImports`

断点推进规则采用本轮确认结果：

- **只推进到连续成功段的最后一条**
- 即使失败项后面还有未处理项目，也不计入断点

这样下一次重新抓取时：

- 成功前缀会被 `importedUrlSet` 过滤掉
- 中断点及后续内容仍会保留为待处理

### 刷新

点击“刷新”后重新抓取当前页面 DOM，再次应用本地缓存：

- 已在 `importedUrlSet` 中的项继续标记为 `skipped`
- 新项标记为 `idle`
- 不保留上一次抓取时的临时勾选结果

## UI 状态机

侧边栏顶层页面状态：

- `checking`
  - 校验 tab 和读取缓存
- `ready`
  - 列表已加载，可勾选、刷新、保存
- `saving`
  - 串行提交中
- `invalid-page`
  - 当前 tab 不是抖音收藏页
- `load-error`
  - 注入失败或抓取失败

列表内每条项目显示：

- 勾选框
- 标题
- 作品链接
- 点赞文案
- 当前状态（待保存 / 已跳过 / 保存中 / 成功 / 失败）
- 失败原因（仅失败项展示）

底部操作区显示：

- 已选数量
- 刷新按钮
- 全部保存按钮
- 最近导入时间或断点说明

## Get 笔记接口收敛

当前项目已有单篇链接保存逻辑，本次统一收敛为：

- `SaveLinkNoteParams` 去掉 `title`
- `saveLinkNote()` 请求体固定只传：

```json
{
  "note_type": "link",
  "link_url": "..."
}
```

如果有 tags，则保留 `tags` 字段；本次抖音批量导入不传 tags。

受影响行为：

- popup 中“保存链接到 Get 笔记”不再提交标题
- 抖音批量导入同样不提交标题

## 错误处理

- 当前页不是抖音收藏页：
  - 侧边栏显示明确提示，不执行抓取
- 抓取失败或注入失败：
  - 页面显示错误和“刷新”入口
- Get 笔记配置缺失：
  - 禁用保存或点击后提示去设置
- 单条保存失败：
  - 当前项标红
  - 停止整个批量流程
  - 把前面的连续成功段写入断点
- 存储写入失败：
  - 提示错误
  - 不伪造成功完成状态

## 测试

新增或更新测试覆盖：

1. `tests/douyin/collect.test.ts`
   - 判断抖音收藏页 URL 是否命中
   - URL 归一化是否去掉 hash 并生成绝对地址
2. `tests/storage/douyinImports.test.ts`
   - 默认值读取
   - 写入与覆盖
   - 连续成功段写回后的结果
3. `tests/getnote/api.test.ts`
   - 链接保存请求体不含 `title`
   - 仍包含 `link_url`
4. 视情况为侧边栏的纯逻辑函数补单测
   - 例如“连续成功段推进”与“导入集合过滤”

## 验收标准

1. 在抖音收藏页点击插件图标，直接打开右侧侧边栏
2. 在非抖音收藏页点击插件图标，仍然打开当前 popup
3. 侧边栏能够抓到收藏列表并展示勾选、刷新、逐条状态
4. 批量保存到 Get 笔记时，请求只传 URL，不传标题
5. popup 中单篇“保存链接到 Get 笔记”时，请求也只传 URL，不传标题
6. 批量导入中某条失败后，停止后续提交，并只推进前缀成功段断点
7. 下一次抓取时，前缀成功项不会重复进入待保存队列

## 范围外的后续事项

- 统一导出/导入全部存储数据的页面和格式
- 抖音批量导入历史记录页
- 其他平台的收藏导入
- 保存成功后的自动标签、自动分类或 AI 摘要
