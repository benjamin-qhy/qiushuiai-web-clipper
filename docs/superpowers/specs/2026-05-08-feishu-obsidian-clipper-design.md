# 飞书文档 → Obsidian Clipper 浏览器插件设计文档

**日期**: 2026-05-08  
**技术栈**: WXT + Vue 3 + TypeScript  
**目标浏览器**: Chrome、Edge、Firefox、Safari

---

## 一、项目目标

在飞书文档页面，一键将文档内容转换为 Markdown 并保存到 Obsidian vault 的指定目录，frontmatter 格式与 Obsidian Web Clipper 完全兼容。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────┐
│               飞书文档页面                        │
│  ┌──────────────────────────────────────────┐   │
│  │  Content Script                           │   │
│  │  匹配: *://*.feishu.cn/docx/*             │   │
│  │  - 提取 #mainBox .bear-web-x-container    │   │
│  │  - 返回结构化 JSON（blocks + metadata）   │   │
│  └──────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────┘
                   │ chrome.tabs.sendMessage
┌──────────────────▼──────────────────────────────┐
│  Popup（Vue 3）                                  │
│  - 展示 frontmatter 属性（可编辑）               │
│  - 目标目录输入（默认 Clippings）                │
│  - 「保存到 Obsidian」主按钮 + 「复制 MD」选项   │
└──────────────────┬──────────────────────────────┘
                   │ File System Access API
┌──────────────────▼──────────────────────────────┐
│  Obsidian Vault / {目录} / {标题}.md             │
└─────────────────────────────────────────────────┘
```

**数据流**：
1. 用户在飞书文档页打开 Popup
2. Popup 向 Content Script 发消息，Content Script 提取 DOM 返回结构化数据
3. Popup 组装 frontmatter + 将 blocks 转换为 Markdown 字符串
4. Popup 调用 File System Access API，写入 vault 目录

---

## 三、Content Script

### 匹配规则
```
*://*.feishu.cn/docx/*
*://*.feishu.cn/wiki/*
```

### DOM 提取

飞书文档使用自定义富文本编辑器，内容容器选择器：
```typescript
'#mainBox .bear-web-x-container'
```

支持的 block 类型（参考 cloud-document-converter MIT 开源实现）：

| block 类型 | DOM 属性 | 转换结果 |
|------------|----------|----------|
| page | data-block-type="page" | 文档标题 |
| heading1~9 | data-block-type="heading1~9" | # ~ ######### |
| text | data-block-type="text" | 正文段落 |
| bullet | data-block-type="bullet" | - 列表项 |
| ordered | data-block-type="ordered" | 1. 列表项 |
| todo | data-block-type="todo" | - [ ] / - [x] |
| code | data-block-type="code" | \`\`\`lang\`\`\` |
| quote_container | data-block-type="quote_container" | > 引用 |
| divider | data-block-type="divider" | --- |
| table | data-block-type="table" | GFM 表格 |
| image | data-block-type="image" | ![](url) |
| callout | data-block-type="callout" | > 高亮块 |

行内格式：加粗、斜体、删除线、行内代码、超链接、字体色。

### 虚拟滚动处理

飞书文档使用虚拟滚动，长文档需先滚动到底部触发全部 block 加载，再提取 DOM：
```typescript
// 滚动容器到底部，等待渲染完成后再提取
async function scrollToLoadAll(container: Element): Promise<void>
```

### 返回数据结构

```typescript
interface DocContent {
  title: string
  url: string
  author?: string        // 从页面 meta 或文档信息区提取
  published?: string     // 文档创建时间（ISO 日期字符串）
  blocks: Block[]
}

interface Block {
  type: BlockType
  text?: string
  spans?: Span[]         // 行内格式片段
  level?: number         // 列表缩进层级
  language?: string      // 代码块语言
  checked?: boolean      // todo 状态
  rows?: Cell[][]        // 表格数据
  src?: string           // 图片 URL
}
```

---

## 四、Popup UI（Vue 3）

### 组件结构

```
App.vue
├── composables/
│   ├── useVaultStore.ts     # vault 目录句柄持久化（chrome.storage.local）
│   ├── useDocContent.ts     # 向 content script 请求文档内容
│   ├── useMarkdown.ts       # blocks → Markdown 字符串转换
│   └── useFileSave.ts       # File System Access API 写文件
└── components/
    ├── PropertiesPanel.vue  # frontmatter 属性编辑区（可折叠）
    ├── ContentPreview.vue   # 内容预览（前 5 行，只读）
    ├── FolderInput.vue      # 目标目录输入框
    └── SaveButton.vue       # 主按钮 + 下拉菜单
```

### 界面布局

```
┌─────────────────────────────────────┐
│  飞书文档标题（大字，多行展示）        │
├─────────────────────────────────────┤
│  属性 ∨                             │
│  ≡  title      我的会议记录          │
│  ≡  source     https://feishu.cn/…  │
│  ≡  author     [[张三]]             │
│  📅 published                       │
│  📅 created    2026-05-08           │
│  ≡  description                     │
│  ≡  tags       clippings            │
├─────────────────────────────────────┤
│  （内容预览，前 5 行，只读）          │
├─────────────────────────────────────┤
│  [  Clippings                    ]  │
│  [    保存到 Obsidian         ▼  ]  │
└─────────────────────────────────────┘
```

### 状态说明

- **未授权**：显示「选择 Obsidian Vault 目录」按钮，引导用户完成首次授权
- **非飞书文档页**：显示「请在飞书文档页面使用此插件」
- **加载中**：提取 DOM 期间显示 loading
- **保存成功**：显示「✓ 已保存到 Clippings/标题.md」
- **保存失败**：显示错误信息（如文件已存在、目录无写权限）

---

## 五、保存文件格式

### frontmatter（与 Obsidian Web Clipper 完全兼容）

```yaml
---
title: "我的会议记录"
source: "https://xxx.feishu.cn/docx/E0B3dLKkXoeXIgxB7RbcQoAin1d"
author:
  - "[[张三]]"
published:
created: 2026-05-08
description:
tags:
  - "clippings"
---
```

### 文件路径

```
{vault_root}/{目标目录}/{title}.md
```

- 默认目录：`Clippings`
- 文件名：文档标题，自动过滤非法字符（`/ \ : * ? " < > |`）
- 文件名冲突：追加 `-1`、`-2` 等后缀

---

## 六、File System Access API

```typescript
// 首次授权，存储目录句柄
const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
await chrome.storage.local.set({ vaultHandle: dirHandle })

// 写入文件（含子目录自动创建）
async function saveToVault(
  dirHandle: FileSystemDirectoryHandle,
  subDir: string,
  filename: string,
  content: string
): Promise<void>
```

**注意**：`FileSystemDirectoryHandle` 需通过 `StorageManager.persist()` 持久化，重启浏览器后需重新验证权限（`handle.queryPermission()`），权限失效时提示用户重新授权。

---

## 七、Markdown 转换

复用 [cloud-document-converter](https://github.com/whale4113/cloud-document-converter) 的 `packages/lark` 解析库（MIT 协议）作为参考实现，使用 **remark/MDAST** 生态：

- `mdast-util-to-markdown` — AST 转 Markdown 字符串
- `remark-gfm` — 支持表格、删除线、任务列表

---

## 八、权限声明（manifest）

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "*://*.feishu.cn/*"
  ],
  "content_scripts": [{
    "matches": ["*://*.feishu.cn/docx/*", "*://*.feishu.cn/wiki/*"],
    "js": ["content-script.js"]
  }]
}
```

---

## 九、技术依赖

| 依赖 | 用途 |
|------|------|
| wxt | 浏览器插件框架 |
| vue 3 | Popup UI |
| mdast-util-to-markdown | Markdown 序列化 |
| remark-gfm | GFM 扩展（表格、任务列表等） |
| yaml | frontmatter 序列化 |

---

## 十、不在范围内（MVP）

- 飞书表格、思维导图、多维表格
- 图片下载到本地（仅保留原始 URL，有效期约 2 小时）
- 批量导出
- 飞书 Wiki 树形结构导航
