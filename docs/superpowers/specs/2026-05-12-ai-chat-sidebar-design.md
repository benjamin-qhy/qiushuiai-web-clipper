# AI Chat Sidebar Design

**Date:** 2026-05-12
**Feature:** bookmarks 页面右侧 AI 整理 Chat 界面重设计

## Overview

将 bookmarks 页面右侧的 `AISidebar` 从简单状态面板改造为完整的 chat 界面，支持"开始整理"和"重新整理分类"两个核心 AI 工作流。

---

## 1. 布局调整

### AISidebar 宽度
- 默认宽度：360px（原 220px）
- 支持拖拽调整，范围限制：260px – 600px
- 宽度不持久化，每次打开重置为 360px

### 导出到 Obsidian
- 从 AISidebar 移出，放到 `App.vue` 的 `.pane-main` header 区域作为独立按钮

### AISidebar 整体结构
```
┌── header ────────────────────────┐
│ AI 整理        [新建会话]  [⚙]  │
├── messages ──────────────────────┤
│  (可滚动，消息从上到下)           │
│                                  │
│  [空闲时显示快捷命令区]           │
│                                  │
├── input ─────────────────────────┤
│  [textarea]            [发送 ↵] │
└──────────────────────────────────┘
```

---

## 2. 消息类型

| 类型 | 样式 | 说明 |
|------|------|------|
| 用户消息 | 右对齐，紫色背景 | 用户输入的文字 |
| AI 普通消息 | 左对齐，白色背景，支持 markdown | AI 回复 |
| AI 思考/进度流 | 浅灰色小字，可折叠 | 逐条处理书签的实时输出 |
| 目录建议卡片 | 嵌套在 AI 消息内的特殊卡片 | 见下方详细说明 |
| 完成汇总消息 | AI 普通消息 | 整理完成后的统计 |

### 思考/进度流（think 模式）
```
▼ 正在处理... (点击折叠)
  ✓ github.com/vuejs/vue — 归入「前端框架」
  ✓ news.ycombinator.com — 归入「资讯」
  ✗ broken-link.com — 死链，跳过
  ...
```
- 浅灰色，字号比普通消息小
- 默认展开，可点击折叠
- 失败条目标红

### 目录建议卡片
```
┌── 建议目录结构 ─────────────────┐
│  📁 前端开发                    │
│    📁 框架与库                  │
│    📁 工具链                    │
│  📁 设计                        │
│  📁 资讯                        │
│                                 │
│  处理完成后，原目录：            │
│  [保留原目录] [删除原目录]       │
│                                 │
│         [修改] [确认执行]        │
└──────────────────────────────────┘
```
- "修改"：聚焦输入框，用户用文字描述修改意见，AI 重新输出新卡片
- "确认执行"：需先选择原目录处理方式，才可点击

### 完成汇总消息
```
✓ 整理完成：共处理 156 条书签，
  新增 8 个分类，移动 143 条，
  跳过 13 条（死链/重复）
```

### 空闲状态（无消息时，居中显示）
```
        [🔄 重新整理分类]
        [▶  开始整理    ]
```

---

## 3. Composable 架构

### `useAIChat`
基础聊天层，管理消息列表和输入状态。

```ts
interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  type: 'text' | 'thinking' | 'category-proposal' | 'summary'
  content: string
  thinkingLines?: ThinkingLine[]      // type === 'thinking' 时使用
  categoryTree?: CategoryNode[]       // type === 'category-proposal' 时使用
  collapsed?: boolean                 // thinking 是否已折叠
}

// 暴露
messages: Ref<ChatMessage[]>
input: Ref<string>
isLoading: Ref<boolean>
sendMessage(text: string): void
appendAIMessage(msg: Partial<ChatMessage>): string   // 返回 id
updateMessage(id: string, patch: Partial<ChatMessage>): void
newConversation(): void
```

### `useBookmarkProcess`
"开始整理"工作流。

```ts
// 状态
state: Ref<'idle' | 'processing' | 'done' | 'aborted'>

// 方法
start(chatHooks: AIChatHooks): Promise<void>
abort(): void
```

流程：
1. 读取所有浏览器书签（URL + 标题）
2. 逐条（或小批量）调用 AI，返回 `{ category, tags, summary }`
3. 每条结果实时 append 到 think 流消息
4. 全部完成后 append 汇总消息

### `useBookmarkReorganize`
"重新整理分类"状态机。

```ts
// 状态
state: Ref<'idle' | 'analyzing' | 'proposing' | 'awaiting_confirm' | 'executing' | 'done'>

// 方法
start(chatHooks: AIChatHooks): Promise<void>
submitModification(userText: string): Promise<void>  // 用户提修改意见
confirm(keepOldFolders: boolean): Promise<void>      // 用户确认执行
abort(): void
```

状态流转：
```
idle → analyzing（读取全量书签）
     → proposing（AI 输出目录树 JSON，渲染为建议卡片）
     → awaiting_confirm（等待用户操作）
          ↓ 用户点"修改" + 输入文字
     → proposing（AI 重新输出）
          ↓ 用户点"确认执行"
     → executing（创建目录 + 移动书签，显示 think 流进度）
     → done（汇总消息）
```

---

## 4. AI 调用机制

### 配置
复用现有 `getSettings()` 获取 `aiConfig.apiKey` 和 `model`，composable 层直接 fetch AI API。

### 目录树 JSON 格式
```json
[
  {
    "name": "前端开发",
    "children": [
      { "name": "框架与库" },
      { "name": "工具链" }
    ]
  },
  { "name": "设计" },
  { "name": "资讯" }
]
```

### "重新整理分类" Prompt 策略
- **分析调用**：提供全量书签列表，要求输出目录树 JSON
- **修改调用**：提供原目录树 JSON + 用户修改意见，要求输出新目录树 JSON

### "开始整理" 调用策略
- 逐条或小批量（每批 ≤10 条）调用 AI
- 返回格式：`{ category: string, tags: string[], summary: string }`
- 支持 `AbortController` 中途取消

### 错误处理
- API Key 未配置 → 快捷命令按钮置灰，空闲区显示配置提示
- 单条书签失败 → think 流标红，继续下一条，汇总计入"失败"数
- 网络错误 → AI 消息显示错误提示，状态回到 idle

---

## 5. 拖拽调整宽度

### 实现
- AISidebar 左边缘 4px 透明 drag handle
- hover 显示 `col-resize` 光标和竖线视觉提示
- 拖拽时 `body` 加 `user-select: none`

### 逻辑
```
mousedown on handle:
  startX = e.clientX
  startWidth = currentWidth

mousemove on document:
  newWidth = clamp(startWidth - (e.clientX - startX), 260, 600)
  currentWidth = newWidth

mouseup on document:
  end drag, remove listeners
```

---

## 6. 文件结构变更

```
entrypoints/bookmarks/
  App.vue                              ← 新增导出按钮，sidebar 宽度改为 360px
  components/
    AISidebar.vue                      ← 重写为瘦容器（布局 + 拖拽）
    BookmarkList.vue                   ← 不变
    FolderTree.vue                     ← 不变
    ai/
      ChatMessages.vue                 ← 渲染消息列表（含各类型消息）
      ChatInput.vue                    ← 底部输入框 + 发送按钮
      EmptyState.vue                   ← 快捷命令区（两个按钮）
      CategoryProposal.vue             ← 目录建议卡片组件

src/composables/
  useAIChat.ts                         ← 新增
  useBookmarkProcess.ts                ← 新增
  useBookmarkReorganize.ts             ← 新增
```

---

## 7. 不在本次范围内

- 聊天记录持久化（不做）
- 多会话管理（不做）
- 书签处理结果写入 Obsidian（保留现有导出按钮，不通过 chat 触发）
