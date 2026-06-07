# Popup & Options 改进设计文档

**日期**: 2026-05-18  
**状态**: 已确认

---

## 1. 背景

当前 popup 底部操作区和 options 图片设置存在几处体验问题：
- 子目录只能在 options 页修改，popup 里无法快速调整
- popup 看不到当前图片存储模式
- 下拉菜单里"更换 Vault 目录"会永久修改全局配置，缺少"临时另存"能力
- 下拉菜单里"复制 Markdown"没有成功反馈
- options 本地图片只支持按笔记各自 `.assets/` 目录，无法统一存放
- options 顶部保存按钮点击后无成功提示

---

## 2. 新增 Settings 字段

在 `src/storage/settings.ts` 的 `Settings` 接口和 `DEFAULT_SETTINGS` 中增加：

```typescript
imageLocalMode: 'per-note' | 'shared'  // 默认 'per-note'
imageLocalDir: string                   // 默认 'images'
```

- `per-note`：当前默认行为，每篇笔记图片存到 `{subDir}/{notename}.assets/`
- `shared`：图片统一存到 vault 根下的 `{imageLocalDir}/` 目录

---

## 3. Popup 改动

### 3.1 按钮区（保持现有结构）

布局不变：`[保存到 Obsidian] [▼]`

下拉菜单变更：
- **"复制 Markdown"**：保留，点击后菜单内该按钮文字变为 `✓ 已复制`，2 秒后恢复原文字，菜单不关闭
- **"更换 Vault 目录" → "另存为"**：改名且改行为

**"另存为"新行为**：
1. 调用 `showDirectoryPicker({ mode: 'readwrite', startIn: vault.handle.value })`
2. 调用 `vault.handle.value.resolve(selected)` 验证所选目录在 vault 内，否则提示错误
3. 以所选目录作为保存根目录，`subDir` 为空，执行一次性保存
4. 全局 `vault.handle`、`settings.subDir` 等配置**不做任何修改**
5. 保存成功后显示同现有的 `✓ 已保存：{filename}`

### 3.2 按钮上方信息行（新增）

在 footer 顶部、按钮区之上，新增一行：

```
子目录  [Clippings          ]   图片: 本地
```

- **子目录输入框**：绑定 `settings.subDir`，`blur` 时调用 `saveSettings` 持久化
- **图片模式标签**：只读，显示 `本地` 或 `阿里云 OSS`，点击后打开 options 页（`browser.tabs.create({ url: '/options.html' })`）
- popup 挂载时读取一次 settings，`subDir` 变化后实时反映到保存逻辑

---

## 4. Options 图片设置改动

### 4.1 本地模式子选项

在 `imageMode === 'local'` 的展示块内，现有提示文字下方增加：

```
图片保存位置
  [按笔记]  [统一目录]
```

- **按笔记**（默认）：`imageLocalMode = 'per-note'`，无额外配置，提示"图片保存到 {notename}.assets/ 子目录"
- **统一目录**：`imageLocalMode = 'shared'`，显示目录配置：

```
目录  [images          ]  [选择目录]
预览: vault/images/笔记标题-20260518143022583.png
```

  - 目录输入框绑定 `settings.imageLocalDir`
  - "选择目录"按钮：`showDirectoryPicker({ startIn: vault.handle })`，验证在 vault 内，取相对路径写入 `imageLocalDir`
  - 预览路径格式：`{imageLocalDir}/笔记标题-{timestamp}.png`

### 4.2 顶部保存按钮成功提示

`main-topbar` 区域的保存按钮旁，增加与底部一致的状态提示：

```html
<span v-if="saveStatus === 'saved'" class="status-ok">✓ 已保存</span>
<button class="btn-save" ...>保存设置</button>
```

---

## 5. 保存逻辑改动

### 5.1 `src/filesystem/save.ts`

新增函数 `saveImageToSharedDir`：
- 参数：`vaultHandle`, `imageLocalDir`, `filename`, `base64`
- 在 vault 根下创建/获取 `imageLocalDir` 目录，写入图片文件

### 5.2 `src/composables/useFileSave.ts`

`downloadAndReplaceImages`（飞书/金山）和 `downloadAndReplaceMarkdownImages`（通用网页）在保存本地图片时：

- `imageLocalMode === 'per-note'`：当前逻辑不变，路径 `{notename}.assets/{filename}`
- `imageLocalMode === 'shared'`：
  - 调用 `saveImageToSharedDir`
  - markdown 引用路径用相对路径：根据 `subDir` 深度动态计算 `../` 层级
  - 计算逻辑：`'../'.repeat(subDir.split('/').filter(Boolean).length) + imageLocalDir + '/' + filename`
  - 例：`subDir='Clippings'` → `../images/filename.jpg`；`subDir=''` → `images/filename.jpg`

### 5.3 `useFileSave.save()` 的"另存为"支持

新增可选参数 `overrideDirHandle?: FileSystemDirectoryHandle`：
- 若传入，用该 handle 作为保存根目录，`subDir` 置空
- 若未传入，走原有逻辑

---

## 6. 受影响文件清单

| 文件 | 改动类型 |
|------|----------|
| `src/storage/settings.ts` | 新增字段 |
| `src/filesystem/save.ts` | 新增函数 |
| `src/composables/useFileSave.ts` | 逻辑扩展 |
| `entrypoints/popup/App.vue` | UI + 逻辑 |
| `entrypoints/options/App.vue` | UI + 逻辑 |

---

## 7. 不在本次范围内

- 飞书/金山文档 popup 的任何改动
- OSS 模式下的图片路径逻辑（无变化）
- 书签管理页面
