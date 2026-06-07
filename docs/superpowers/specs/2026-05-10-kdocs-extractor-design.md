# 金山文档提取器设计

**日期**：2026-05-10  
**状态**：已批准

## 背景

当前扩展仅支持飞书文档（feishu.cn）。本方案在此基础上增加金山文档（kdocs.cn）的提取能力，复用已有的 converter / filesystem / storage / uploader 层，仅新增 kdocs 专用的 content script 和提取器模块。

## 目标

- 用户在 `kdocs.cn/l/*` 页面点击扩展 popup，可提取文档内容并保存为 Obsidian Markdown
- 图片处理逻辑与飞书保持一致（local 模式本地保存，OSS 模式上传云端）
- 不改动任何现有飞书相关代码

## 不在范围内

- `kdocs.cn` 其他页面类型（非 `/l/` 分享链接）
- 代码块、todo、divider、callout 块（目标文档中不存在，后续按需添加）
- 行内链接（目标文档中无真实 `<a>` 标签）

---

## DOM 结构（基于 HTML 实样分析）

**容器**：`#otl-main-editor`（ProseMirror 编辑器根节点）

**块容器**：每个内容块为 `div.block_tile > 内容元素`

### 块类型映射

| DOM 选择器 | Block type | 备注 |
|-----------|-----------|------|
| `p.mainTitle` | `page` | 文档标题，仅一个 |
| `h2.otl-heading` | `heading2` | 标签名决定级别（非 `level` 属性） |
| `h3.otl-heading` | `heading3` | 同上 |
| `div.otl-paragraph`（无 list class） | `text` | 普通段落 |
| `div.otl-paragraph.outline-bullet-list-item` | `bullet` | `listlevel` 属性表示嵌套层级 |
| `div.otl-paragraph.outline-order-list-item` | `ordered` | `listlevel` 属性表示嵌套层级 |
| `div.picture-wrapper img` | `image` | 全为 blob URL，需立即 canvas 捕获 |
| `table.outline-table` | `table` | 标准 `tr/td`，单元格内递归提取 spans |

### 行内格式

- 文字内容在 `span.otl-paragraph-content` 或 `span.otl-heading-content` 内
- `<i class="otl-word-gap">` — ProseMirror 中文字符间空格占位符，**必须过滤**
- `<strong>` — 粗体，映射 `bold: true`
- `span.color_font.other_color` — 蓝色高亮文字，无真实 href，忽略颜色仅保留粗体语义
- 无 `<a>` 链接（文档中无真实超链接）

### 元数据

- **title**：`p.mainTitle` 文字（去掉 otl-word-gap 占位符后）
- **author**：`.title-foot-info-name` 文字（如 `oulinjie`）
- **published**：`.title-foot-info-update-time` 内第二个匿名 `<span>`（结构为 `<span class="title-foot-info-time-user">用户名</span><span>04-25 17:56</span><span>更新</span>`，取中间那个 span），补全当前年份后解析为 ISO 日期
- **source**：`location.href`

---

## 文件结构

### 新增文件

```
entrypoints/content-kdocs.ts
src/extractor/kdocs/
  collect.ts      # 滚动 + 收集，返回 { container, blocks, description }
  blocks.ts       # DOM 元素 → Block[]
  inline.ts       # kdocs span 节点 → Span[]（含 otl-word-gap 过滤）
```

### 修改文件

**`wxt.config.ts`**：
- `manifest.permissions` 无需新增（已有 `storage`、`activeTab`、`scripting`）
- `manifest.host_permissions` 加入 `*://*.kdocs.cn/*`
- content script matches 自动由 `entrypoints/content-kdocs.ts` 的 `matches` 字段声明

---

## 模块详情

### `entrypoints/content-kdocs.ts`

```
matches: ['*://*.kdocs.cn/l/*']
消息处理: EXTRACT_DOC, DOWNLOAD_IMAGE（与 content.ts 完全相同的协议）
```

`extractDoc()` 流程：
1. 调用 `scrollAndCollectBlocks()`（kdocs 版）
2. 从 `p.mainTitle` 或 `document.title` 取标题
3. 从 `.title-foot-info-name`、`.title-foot-info-update-time` 取 author / published
4. 组装 `DocContent`，`description` 留空（kdocs 无 AI 速览块）
5. 返回 `{ ok: true, data }`

`downloadImage(url)` 流程：与飞书完全相同（blob URL 由 content script 在页面上下文中 fetch）。

### `src/extractor/kdocs/collect.ts`

与飞书 `collect.ts` 结构一致：

- 容器选择器：`#otl-main-editor`
- 找到可滚动祖先（同飞书的 `findScrollTarget` 逻辑）
- 每步 400px，间隔 300ms，到底后再等一次，超时 60s
- 遍历 `.block_tile` 内的直接内容元素（`p`、`h2`、`h3`、`div`、`table`），调用 `parseKdocsBlock()`
- blob URL 图片立即用 canvas 转为 data URL（同飞书）
- 返回 `{ container, blocks, description: '' }`

**去重**：以 `.block_tile` 的 `id` 属性作为 blockId（kdocs 每个 block_tile 都有唯一 id），防止重复采集。

### `src/extractor/kdocs/blocks.ts`

`parseKdocsBlock(blockTile: Element): Block[]`

```
p.mainTitle         → [{ type: 'page', spans: extractKdocsSpans(el) }]
h2.otl-heading      → [{ type: 'heading2', spans: extractKdocsSpans(heading-content span) }]
h3.otl-heading      → [{ type: 'heading3', spans: extractKdocsSpans(heading-content span) }]
div.otl-paragraph（无 list class）
                    → text 内容为空时返回 []，否则 [{ type: 'text', spans }]
div.outline-bullet-list-item
                    → [{ type: 'bullet', spans, level: parseInt(listlevel) }]
div.outline-order-list-item
                    → [{ type: 'ordered', spans, level: parseInt(listlevel) }]
div.picture-wrapper → 取 img[src]，过滤空 src，每张图返回一个 { type: 'image', src, alt }
table.outline-table → extractKdocsTableRows(el)，返回 [{ type: 'table', rows }]
其他               → []
```

表格单元格（`td`）内容：递归调用 `extractKdocsSpans(td)` 取第一段文字。

### `src/extractor/kdocs/inline.ts`

`extractKdocsSpans(el: Element): Span[]`

1. 过滤掉所有 `i.otl-word-gap` 节点（从 DOM 遍历中跳过）
2. 遍历剩余叶子节点（text node 或末端 span）
3. 对每个叶子：
   - `text`：`node.textContent`
   - `bold`：检查是否有 `<strong>` 祖先（在 `el` 范围内）
   - `italic`：检查是否有 `<em>` 祖先（暂时支持，文档中未出现但语义正确）
   - `link`：无（当前文档无真实链接）
4. 合并相邻 Span 属性相同的节点，减少输出噪音

---

## 复用层（无需修改）

| 模块 | 说明 |
|------|------|
| `src/types.ts` | `Block`、`DocContent`、消息协议完全复用 |
| `src/converter/blocks.ts` | `blocksToMarkdown()` 直接复用 |
| `src/converter/frontmatter.ts` | `buildFrontmatter()` 直接复用 |
| `src/converter/filename.ts` | 文件名处理直接复用 |
| `src/filesystem/save.ts` | 文件写入直接复用 |
| `src/storage/settings.ts` | 设置读取直接复用 |
| `src/storage/vault.ts` | Vault 句柄直接复用 |
| `src/uploader/` | OSS 上传直接复用 |
| `src/composables/` | Popup 层完全不变 |
| `entrypoints/popup/` | 无需改动 |
| `entrypoints/options/` | 无需改动 |

---

## 测试策略

在 `tests/extractor/kdocs/` 下新增单元测试，使用现有的 `tests/jinshan.txt` 作为 fixture：

- `blocks.test.ts`：验证各块类型的解析结果
- `inline.test.ts`：验证 otl-word-gap 过滤、bold 提取

集成测试：在真实 kdocs 页面手动验证保存结果。
