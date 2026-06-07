# Bookmarks Bar Export Design

**Date:** 2026-05-13
**Feature:** bookmarks 页面书签栏导出完整 Markdown 和 Obsidian

## Overview

在 bookmarks 页面中间主区域增加两个导出入口：导出浏览器“书签栏”的完整 Markdown 文件，以及按书签栏一级文件夹拆分写入 Obsidian Vault。导出范围固定为浏览器书签树中“书签栏”节点下的全部书签，包含所有子文件夹。

---

## 1. 用户入口

### 位置

导出按钮放在 `entrypoints/bookmarks/components/BookmarkList.vue` 的顶部 header 右侧，与当前文件夹标题和数量统计同一行。

### 文案

- `导出书签栏 MD`
- `导出到 Obsidian`

按钮文案明确使用“书签栏”，避免误解为只导出当前选中文件夹。

### 状态

- 导出过程中禁用两个按钮，显示简短进行中状态。
- 导出成功后在页面底部全局提示区域显示成功信息。
- 导出失败后复用现有 `tree.error` 机制显示错误。

---

## 2. 导出范围

从 `browser.bookmarks.getTree()` 读取完整浏览器书签树，定位根节点下的“书签栏”节点。

兼容判断方式：

- 优先使用 Chrome 常见 bookmark bar 节点 id：`1`
- 若 id 不匹配，则在根节点 children 中查找标题为 `书签栏` 或 `Bookmarks Bar` 的文件夹
- 只导出该节点的 children，不导出“其他书签”等其他根级区域

---

## 3. 完整 Markdown 导出

### 文件

生成一个下载文件，文件名格式：

```text
bookmarks-bar-YYYY-MM-DD.md
```

### 内容结构

```markdown
# 书签栏

_导出时间：2026-05-13_

## 一级文件夹

- [书签标题](https://example.com)

### 二级文件夹

- [另一个书签](https://example.com/child)
```

规则：

- 文件夹使用 Markdown 标题表达层级。
- 书签使用 `- [title](url)`。
- 无标题书签使用 URL 作为标题。
- 标题中的 `[`、`]`、换行等字符做最小转义或清理，保证 Markdown 可读。

---

## 4. Obsidian 导出

### 目录

复用现有 Vault 授权能力，写入 Vault 下的 `Bookmarks/` 目录。

### 拆分规则

按书签栏的一级文件夹拆分为多个 Markdown 文件：

- `技术.md`
- `资料.md`
- `工具.md`

一级文件夹下的二级、三级目录不再拆分文件，而是在对应 Markdown 文件内继续用标题表示层级。

### 根直属书签

书签栏根目录下不属于任何一级文件夹的书签写入：

```text
书签栏.md
```

### 写入策略

采用覆盖写入。每次导出结果准确反映当前浏览器书签栏结构，避免重复条目和已经删除的旧书签残留。

---

## 5. 代码组织

### `src/bookmark/bar-export.ts`

新增纯函数和文件系统函数：

- 定位书签栏节点
- 将书签树转换为完整 Markdown
- 将书签栏按一级文件夹拆分为 Obsidian 文件
- 清理文件名

这些函数通过单元测试覆盖，避免把格式化逻辑塞进 Vue 组件。

### `entrypoints/bookmarks/App.vue`

负责：

- 调用 `browser.bookmarks.getTree()`
- 触发完整 Markdown 下载
- 初始化/授权 Vault
- 调用 Obsidian 导出函数
- 将成功或失败状态传给页面

### `entrypoints/bookmarks/components/BookmarkList.vue`

负责：

- 展示两个按钮
- 根据导出状态禁用按钮
- emit `export-markdown` 和 `export-obsidian` 事件

---

## 6. 测试

新增 `tests/bookmark/bar-export.test.ts`，覆盖：

- 正确定位书签栏节点
- 完整 Markdown 保留嵌套文件夹结构
- Obsidian 按一级文件夹拆分文件
- 根直属书签写入 `书签栏.md`
- 文件名中的非法字符被清理

Vue 组件只做轻量交互改动，优先通过类型检查和构建验证。
