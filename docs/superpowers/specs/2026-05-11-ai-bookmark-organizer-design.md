# AI 书签整理器 — 设计文档

## 概述

在现有飞书 → Obsidian 剪藏插件中，新增一个 AI 驱动的浏览器书签整理功能。用户平时把网站收藏到"待整理"文件夹，插件自动（或手动触发）对这些书签进行去重、死链清理、AI 内容分析，然后将书签移入浏览器分类文件夹，并导出到 Obsidian Vault。

## 工作流

### 触发方式

- **手动**：Popup 新增"整理书签"按钮，点击后打开专属 Bookmarks 页面，可手动触发处理
- **自动**：`chrome.alarms` 定时触发（用户配置间隔小时数）+ 浏览器启动时触发一次，Background Worker 静默处理

### 处理流程

```
用户收藏网站到"待整理"文件夹
  ↓ （定时 or 启动 or 手动）
Background Worker 读取"待整理"文件夹
  ├─ 去重检测 → 按 URL 去重，保留最早收藏的一条，其余直接删除
  ├─ 死链检测 → HEAD 请求失败的书签直接删除
  └─ 逐条 AI 处理（已在 IndexedDB 中的跳过）
       ↓ FETCH_PAGE 消息 → 抓取网页正文
       ↓ AI API → 返回 { summary, tags, category }
       ↓ 写入 IndexedDB
       ↓ chrome.bookmarks.move() → 移入对应分类文件夹
  ↓ 处理完成
  导出到 Obsidian：每个分类追加写入一个 .md 文件
```

### 增量逻辑

"待整理"文件夹天然是增量队列：书签处理完后被移走，下次运行只处理新加入的书签。无需额外的增量标记机制。

## 模块划分

### 新增文件

```
entrypoints/bookmarks/
  index.html
  main.ts
  App.vue                      进度展示、手动触发、结果预览

src/ai/
  types.ts                     AIProvider 接口
  aliyun.ts                    阿里云通义千问实现（OpenAI 兼容）
  index.ts                     createAIProvider(config) 工厂函数

src/storage/bookmarks.ts       IndexedDB 书签处理状态存储

src/bookmark/
  process.ts                   单条书签处理编排（抓取 → AI → 存储 → 移动）
  duplicates.ts                去重 & 死链检测
  export.ts                    生成 Obsidian 分类笔记（追加写入，跳过文件中已有的相同 URL）
```

### 修改现有文件

```
entrypoints/background.ts      新增 alarm 注册、FETCH_PAGE、PROCESS_BOOKMARKS 消息处理
entrypoints/popup/App.vue      新增"整理书签"入口按钮
entrypoints/options/App.vue    新增 AI 配置区块 + 书签设置区块
src/storage/settings.ts        新增 aiConfig、bookmarkInboxFolder、processInterval、bookmarkSubDir
wxt.config.ts                  新增权限：bookmarks、alarms
```

## 数据模型

### Settings 新增字段

```typescript
interface AIConfig {
  baseUrl: string    // 默认：阿里云 DashScope OpenAI 兼容端点
  apiKey: string
  model: string      // 默认：qwen-long
}

// Settings 接口新增：
aiConfig: AIConfig
bookmarkInboxFolder: string    // 默认："待整理"
processInterval: number        // 默认：6（小时）
bookmarkSubDir: string         // 默认："Bookmarks"（Obsidian 子目录，用户自行配置）
```

### IndexedDB 书签记录

```typescript
interface BookmarkRecord {
  id: string           // chrome.bookmarks 的节点 id
  url: string
  title: string
  summary: string      // AI 生成的一句话摘要
  tags: string[]       // AI 生成的标签
  category: string     // AI 分配的分类
  processedAt: number  // 时间戳
}
```

## AI 提供商

### 接口定义

```typescript
interface AIProvider {
  complete(prompt: string): Promise<string>
}
```

### 默认：阿里云通义千问

- 使用 OpenAI 兼容接口（`/v1/chat/completions`）
- 默认模型：`qwen-long`（支持长文本，适合网页内容）
- 用户可在设置页修改 baseUrl、apiKey、model，支持任意 OpenAI 兼容服务

### AI Prompt 设计

输入：网页标题 + 正文前 2000 字
输出 JSON：
```json
{
  "summary": "一句话描述网页核心内容（50字以内）",
  "tags": ["标签1", "标签2", "标签3"],
  "category": "分类名称"
}
```

分类由 AI 自由命名（中文），Background Worker 负责在浏览器中创建对应文件夹（若不存在）。

## 导出格式

文件路径：`{vault}/{bookmarkSubDir}/{分类名}.md`

每次运行追加写入，不覆盖已有内容。

```markdown
---
tags: [bookmarks, 技术工具]
updated: 2026-05-11
---

# 技术工具

## [Vite 官网](https://vitejs.dev)
> 下一代前端构建工具，基于原生 ES Module，启动速度极快。
**标签:** #前端 #构建工具 #性能

---

## [Tailwind CSS](https://tailwindcss.com)
> 原子化 CSS 框架，通过组合类名快速构建界面。
**标签:** #CSS #前端 #UI

---
```

首次写入该分类文件时生成 frontmatter；后续追加只添加书签条目（`## 标题` 及以下部分）。

## Bookmarks 页面 UI

```
┌─────────────────────────────────┐
│  书签整理                        │
│                                 │
│  待整理: 12 条  [立即整理]        │
│                                 │
│  ████████░░░░  处理中 8/12...    │
│  ✓ 去重: 删除 2 条重复           │
│  ✓ 死链: 删除 1 条失效           │
│  ⟳ AI 处理: 5/9 完成            │
│                                 │
│  上次整理: 2026-05-11 14:30      │
│  [导出到 Obsidian]               │
└─────────────────────────────────┘
```

- 处理过程中实时更新进度（通过 `chrome.runtime.sendMessage` 推送进度到页面）
- 自动处理时不打开页面，静默完成；用户可在下次打开页面时查看上次处理结果
- "导出到 Obsidian"与处理流程解耦，用户可随时手动触发导出

## 错误处理

- 网页抓取失败（非死链，如超时）：跳过 AI 处理，书签保留在"待整理"，下次重试
- AI API 调用失败：书签保留在"待整理"，不写入 IndexedDB，下次重试
- Obsidian Vault 未授权：导出步骤提示用户重新授权，不影响书签整理

## 新增权限

```json
{
  "permissions": ["bookmarks", "alarms"]
}
```

## 不在本次范围内

- 整理浏览器书签栏以外的收藏（如飞书、第三方服务）
- AI 分类结果的人工审核界面
- 书签搜索 / 全文检索
