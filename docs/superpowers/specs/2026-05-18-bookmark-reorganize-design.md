# 书签 AI 整理流程重设计

**日期：** 2026-05-18  
**状态：** 已确认

---

## 背景

当前「流程 A」通过 fetch 抓取页面正文、单次 AI 调用生成 summary/tags/category，存入 IndexedDB 后移动书签。新需求要求：改用自动开关标签页获取 meta 信息、基于完整文件夹树做 AI 分类、单独生成标题、实时展示处理进度。

---

## 数据流

```
用户点击「整理」按钮
  → useBookmarkProcess.start()

  1. 查找「待整理」文件夹
     找不到 → 报错："未找到「待整理」文件夹，请在书签中创建一个"

  2. 读取「待整理」文件夹内所有书签

  3. 读取完整书签树（所有文件夹结构）

  4. 逐条串行处理（完全串行，一条完成再处理下一条）：

     a. meta.ts：自动打开标签页 → 等待加载 → 读取 title/keywords/description → 关闭标签页
        失败兜底：使用书签自带 title + url，记录警告

     b. classify.ts 第一次 AI 请求：
        输入：meta + 完整文件夹树 + 合并后提示词
        输出：{ "folder": "工作/前端/React" }
        无合适目录 → 返回 { "folder": "其他" }，自动创建「其他」文件夹

     c. browser.bookmarks.move() 移动书签到目标文件夹

     d. classify.ts 第二次 AI 请求：
        输入：meta 信息
        输出：{ "title": "GitHub - 代码托管与协作平台" }

     e. browser.bookmarks.update() 更新书签标题

     f. UI 实时追加当前条目结果
```

---

## 新增 / 修改文件

### 新增

**`src/bookmark/meta.ts`**  
职责：自动开关标签页，读取页面 meta 信息。

```ts
interface PageMeta {
  title: string
  keywords: string
  description: string
}

async function fetchPageMeta(url: string): Promise<PageMeta>
```

流程：`browser.tabs.create({ url, active: false })` → 监听 `tabs.onUpdated` 等待 `status === 'complete'` → `browser.scripting.executeScript` 读取 `document.title`、`meta[name=keywords]`、`meta[name=description]` → `browser.tabs.remove(tabId)`。

超时（30 秒）或失败时抛出异常，由调用方用书签原始 title + url 兜底。

---

**`src/bookmark/classify.ts`**  
职责：两次 AI 调用，分类 + 标题生成。

```ts
async function classifyBookmark(
  meta: PageMeta,
  folderTree: object,
  systemPrompt: string,
  aiProvider: AIProvider,
): Promise<{ folder: string }>

async function generateTitle(
  meta: PageMeta,
  aiProvider: AIProvider,
): Promise<{ title: string }>
```

提示词合并规则（分类请求）：
```
{用户配置的系统提示词}

当前书签文件夹结构：
{folderTree JSON}

输出格式（仅输出 JSON，不要其他内容）：
{"folder": "路径/子路径"}
```

标题请求无用户可配置提示词，直接内置：
```
根据以下网页信息，生成一个简洁的书签标题，格式为「网站名 - 简短描述」，15字以内，中文。
...
输出格式（仅输出 JSON）：{"title": "..."}
```

---

### 修改

**`src/bookmark/process.ts`**  
移除旧的 fetch + 单次 AI 逻辑，改为调用 `meta.ts` + `classify.ts` 的编排函数。

**`src/composables/useBookmarkProcess.ts`**  
- 移除 `fetchPageText`
- 调用新的 `processBookmark`（meta → classify → move → updateTitle）
- 日志条目新增 `warning` 状态（meta 获取失败但流程继续）
- `progress` 追加当前处理项信息

**`src/storage/settings.ts`**  
新增字段：
```ts
bookmarkSystemPrompt: string  // 默认值见下方
```

默认值：
```
你是一个书签整理助手。根据网页的标题、关键词、描述和 URL，从给定的文件夹结构中选出最合适的目录路径。
```

**`entrypoints/options/`**  
书签配置区新增「系统提示词」多行文本框，位于 Model 字段下方，placeholder 说明："此处可追加自定义指令，文件夹结构和输出格式由系统自动附加"。

---

## UI 变更（AISidebar.vue）

**处理中：**
```
正在处理第 3 / 12 个
► example.com - 正在获取页面信息...
```

**日志条目（处理完一条追加一条）：**

| 图标 | 含义 |
|------|------|
| ✓ | 完全成功 |
| ✗ | 有警告但完成（meta 获取失败用兜底） |
| ⊘ | 失败（移动或 AI 请求失败） |

示例：
```
✓  GitHub - 代码托管平台          工作/前端/工具
✗  某网站（meta获取失败，已兜底）  学习/英语
⊘  另一个网站                     移动失败：权限不足
```

**完成汇总：**
```
完成：12 条，成功 10 条，警告 1 条，失败 1 条
```

---

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 找不到「待整理」文件夹 | 终止，显示错误提示 |
| 标签页打开/读取超时 | 警告，用书签原始 title+url 兜底继续 |
| AI 返回非法 JSON | 兜底放入「其他」文件夹，记录警告 |
| 「其他」文件夹不存在 | 自动创建 |
| 书签移动失败 | 记录失败，跳过，继续下一条 |

---

## 不在本次范围内

- 并发处理
- 处理结果写入 IndexedDB（当前需求不需要持久化）
- 撤销/回滚操作
