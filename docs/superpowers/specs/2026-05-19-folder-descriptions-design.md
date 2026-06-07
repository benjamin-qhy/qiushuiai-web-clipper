# 文件夹说明功能设计

## 背景

当前 AI 整理书签时，只将文件夹路径名（如 `技术/前端`）发给大模型。大模型无法得知每个文件夹的具体用途，分类准确率受限。

目标：允许用户为每个文件夹添加一句话说明，AI 整理时将说明一并送给大模型，帮助其更准确地判断书签归属。

## 存储

新建 `src/storage/folderDescriptions.ts`，用 `browser.storage.local` 存储：

```ts
// key: 'qiushui-folder-descriptions'
// value: { [folderId: string]: string }
```

导出两个函数：
- `getFolderDescriptions(): Promise<Record<string, string>>`
- `setFolderDescription(folderId: string, desc: string): Promise<void>`

## UI

在 `entrypoints/bookmarks/App.vue` 的 `pane-left` 底部新增 `pane-desc` 区块。

- 仅在 `tree.selectedFolderId.value` 非空时显示
- 包含标签文字"文件夹说明"和一个 `<textarea>`
- textarea 初始值从 `getFolderDescriptions()` 按 folderId 读取
- `@blur` 时调用 `setFolderDescription(folderId, value)` 保存
- 当切换选中文件夹时重新加载描述

## AI 提示词格式

修改 `src/bookmark/classify.ts` 中的 `buildFolderPaths()`，新增签名：

```ts
function buildFolderPaths(
  nodes: BookmarkNode[],
  descriptions: Record<string, string>,
  prefix?: string
): string[]
```

节点有描述时输出 `"路径 — 说明"`，无描述时仅输出 `"路径"`：

```
技术/前端
技术/后端 — 后端服务、API、数据库相关
生活/购物 — 购物网站和比价工具
```

`buildFolderPathMap()` 签名不变（仍返回 `path → id` 映射，无需描述）。

## 流程串联

`processBookmark()`（`src/bookmark/classify.ts`）调用时额外读取描述：

```ts
const descriptions = await getFolderDescriptions()
const folderPaths = buildFolderPaths(rootChildren, descriptions)
```

`useBookmarkProcess.ts` 中的 `processInbox()` 不需要改动，因为描述在 `processBookmark()` 内部加载。

## 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `src/storage/folderDescriptions.ts` | 新建 |
| `src/bookmark/classify.ts` | 修改 `buildFolderPaths` 签名，在 `processBookmark` 内加载描述 |
| `entrypoints/bookmarks/App.vue` | 新增 `pane-desc` 区块 |
