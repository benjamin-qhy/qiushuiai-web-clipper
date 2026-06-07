# UI 重设计 · 设计规范

**日期：** 2026-05-15  
**范围：** Popup、Settings（改为全屏独立页）、Bookmarks 三个页面的视觉重设计

---

## 设计系统

### 颜色

| Token | 值 | 用途 |
|---|---|---|
| `--color-bg` | `#ffffff` | 卡片/面板背景 |
| `--color-surface` | `#fafafa` | 输入框、侧边栏背景 |
| `--color-base` | `#f7f7f5` | 页面背景 |
| `--color-text` | `#1a1a1a` | 主文字 |
| `--color-text-secondary` | `#888888` | 次要文字 |
| `--color-text-muted` | `#bbbbbb` | 提示文字、placeholder |
| `--color-border` | `#e8e8e8` | 普通边框 |
| `--color-border-light` | `#f0f0f0` | 分隔线 |
| `--color-accent` | `#f97316` | 橙色强调色（按钮、活跃状态、标签） |
| `--color-dark` | `#1a1a1a` | 主操作按钮背景 |

### 字体

- **UI 标签 / 导航 / 按钮**：系统无衬线 `system-ui, -apple-system, sans-serif`，大写字母 + `letter-spacing`
- **内容正文 / 预览**：`Georgia, serif`，用于文档预览区域
- **字号层级**：
  - 页面标题：14–16px，`font-weight: 700`
  - 区块标题：10–11px，`font-weight: 700`
  - 字段标签：6.5–7px，`text-transform: uppercase`，`letter-spacing: 1px`
  - 正文：8–9px
  - 辅助说明：6.5–7px，`color: var(--color-text-muted)`

### 线条与阴影

- 边框统一使用 `1px solid var(--color-border)`，**不使用粗线**
- 激活状态指示：`2px solid var(--color-accent)`（左侧竖线）或底部下划线
- 卡片阴影：`box-shadow: 0 1px 8px rgba(0,0,0,0.07)`
- `border-radius`：`2px`（按钮、tag）、`3px`（卡片内元素）

### 交互元素规范

- **主按钮**：`background: #1a1a1a; color: #fff`，hover 时 `opacity: 0.85`
- **强调按钮**：`background: #f97316; color: #fff`（保存、发送等）
- **次要按钮**：`border: 1px solid var(--color-border); color: #888`
- **输入框**：无边框，仅底部 `1px` 下划线；激活时下划线变为橙色
- **标签/Badge**：橙色描边 + 橙色文字，`border: 1px solid #f97316; color: #f97316`

---

## 页面设计

### 1. Popup（弹窗，380×580px）

**布局结构：**
```
┌─────────────────────────────┐
│ Header: Logo + 设置/书签按钮  │  border-bottom: 1px
├─────────────────────────────┤
│ 文档标题（加粗）               │
│ 来源标签（橙色小字）            │
├─────────────────────────────┤
│ 属性字段区（可折叠）            │
│   Title  ________________   │
│   Author ________________   │
│   Tags   ________________   │
├─────────────────────────────┤
│ 内容预览（fafafa 背景，衬线字体）│
├─────────────────────────────┤
│ [Save to Obsidian] 黑底白字   │  fixed footer
└─────────────────────────────┘
```

**关键细节：**
- 移除所有左侧色块装饰
- 字段标签右对齐，宽度固定，与输入框用 gap 分隔
- 预览区：`background: #fafafa; border: 1px solid #f0f0f0`，无其他装饰
- Header 右侧：「设置」按钮黑底，「书签」按钮橙底

---

### 2. Settings（设置页，全屏独立页）

**架构说明：** `entrypoints/options/` 已通过 `browser.runtime.openOptionsPage()` 以全屏独立页打开，无需新建入口。本次改动是将其 UI 从居中小卡片（max-width: 560px）改为占满全屏的两栏布局。

**布局结构：**
```
┌──────────┬────────────────────────────────┐
│ 左侧导航  │ 右侧内容区（单页连续滚动）         │
│ 180px    │                                │
│          │  ## Vault                      │
│ General  │  Vault Path _______________    │
│ > Vault  │  Sub Directory _____________   │
│   Images │  ──────────────────────────    │
│   AI     │  ## Images                     │
│          │  [ Local ] [ OSS ]             │
│ Bookmarks│  ──────────────────────────    │
│   Org    │  ## AI Model                   │
│   Inbox  │  Base URL __________________   │
│          │  API Key  ••••••••••••••••      │
│          │  Model    __________________   │
│          │  ──────────────────────────    │
│ v2.0.0   │  ## Organization               │
│          │  Inbox Folder ______________   │
│          │  Sub Directory _____________   │
│          │  ──────────────────────────    │
│          │  ## Inbox                      │
│          │  Process Interval __________   │
│          │  [Save Settings]               │
└──────────┴────────────────────────────────┘
```

**左侧导航行为：**
- 固定不滚动（`position: sticky; top: 0`）
- 点击导航项 → `scrollIntoView({ behavior: 'smooth' })` 跳转到对应 section
- 当前激活 section 用橙色左竖线（`2px`）标记，通过 `IntersectionObserver` 监听滚动自动更新
- 分两组：General（Vault / Images / AI Model）和 Bookmarks（Organization / Inbox）

**右侧内容区：**
- 所有 section 连续排列，section 之间用 `border-top: 1px solid #f0f0f0` + `margin` 分隔
- 每个 section 有标题（10px bold）+ 副标题（7px muted）
- 页面底部统一放一个「Save Settings」橙色按钮

**入口注册：** 无需改动 `wxt.config.ts`，Popup 已通过 `browser.runtime.openOptionsPage()` 打开 options 页。

---

### 3. Bookmarks（书签管理，全屏）

**布局保持三栏不变，视觉统一：**

```
┌──────────┬────────────────────┬───────────┐
│ 左：文件树 │ 中：书签列表         │ 右：AI侧边 │
│ 145px   │ flex:1             │ 155px+   │
└──────────┴────────────────────┴───────────┘
```

**统一改动：**
- 顶部 header 统一：Logo 小字橙色 + 页面标题黑色粗体，`border-bottom: 1px solid #e8e8e8`
- 左侧文件夹树背景 `#fafafa`，选中项黑底白字，当前橙色文字
- 书签列表：每项 `border-bottom: 1px solid #f5f5f5`，已整理 badge 改为橙色描边
- AI 侧边栏：消息气泡白底细边框，Proposal 卡片细边框，发送按钮橙色
- 拖拽、resize 等交互逻辑不变，只改视觉

---

## 文件变更范围

| 文件 | 变更类型 |
|---|---|
| `entrypoints/popup/App.vue` | 视觉重构 |
| `entrypoints/popup/style.css` | 重写 |
| `entrypoints/options/App.vue` | 视觉重构（两栏布局，占满全屏） |
| `entrypoints/bookmarks/App.vue` | 视觉统一 |
| `entrypoints/bookmarks/components/FolderTree.vue` | 视觉统一 |
| `entrypoints/bookmarks/components/BookmarkList.vue` | 视觉统一 |
| `entrypoints/bookmarks/components/AISidebar.vue` | 视觉统一 |
| `entrypoints/bookmarks/components/ai/*.vue` | 视觉统一 |
| `wxt.config.ts` | 新增 settings 页面入口 |

---

## 不在本次范围内

- 任何功能逻辑变更
- 路由、状态管理改动
- 后端/内容脚本改动
- 测试更新（纯视觉变更）
