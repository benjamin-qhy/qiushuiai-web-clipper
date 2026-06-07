# 通用网页提取设计（defuddle 集成）

日期：2026-05-17
状态：待实现

## 目标

在现有"飞书 → Obsidian"插件中新增一条通用网页提取路径，使用 [defuddle](https://github.com/kepano/defuddle) 做正文识别与 Markdown 转换。飞书、金山文档现有路径完全不动。

## 非目标

- 不替换飞书或金山文档的现有 extractor。
- 不做正文质量启发式或 Readability 兜底。
- 不下载图片、不上传 OSS，通用网页一律保留远程 URL。
- 不预提取、不缓存。

## 路由与注入

### URL 分流

popup 入口根据当前 tab URL 选分支：

| URL 模式 | 分支 |
|---|---|
| `*.feishu.cn/docx/*`、`*.feishu.cn/wiki/*` | 现有飞书 extractor |
| 金山文档域名（沿用现有匹配） | 现有金山 extractor |
| 其余任意 URL | 新增 general extractor（defuddle） |

### 注入策略

通用路径用 **`activeTab` 权限 + `chrome.scripting.executeScript` 动态注入**，不把静态 `matches` 改为 `<all_urls>`。

- 只在用户点击 popup 那一刻注入到当前 tab；
- 飞书、金山的 content script 保持现有静态 `matches`，互不影响；
- 商店审核更友好。

manifest 增加 `activeTab` 与 `scripting` 权限。

## 模块结构

新增/改动文件：

```
src/extractor/general.ts          # 新增：defuddle 调用 + 字段映射
src/types.ts                      # 改动：DocContent 增加 markdown?: string
src/composables/useFileSave.ts    # 改动：识别 markdown 字段，分支
entrypoints/popup/App.vue         # 改动：URL 分流逻辑
entrypoints/background.ts         # 改动：处理 general 分支的动态注入
package.json                      # 新增：defuddle 依赖
```

### `src/extractor/general.ts`

在 page world 里跑（通过 `chrome.scripting.executeScript` 注入）：

```ts
import Defuddle from 'defuddle/full';

export function extractGeneral(): DocContent {
  const result = new Defuddle(document, { markdown: true }).parse();
  return {
    title: result.title,
    author: result.author ?? '',
    source: location.href,
    published: result.published ?? '',
    description: result.description ?? '',
    domain: result.domain,
    markdown: result.content,
    blocks: [],
  };
}
```

### `DocContent` 扩展

```ts
interface DocContent extends DocMeta {
  blocks: Block[];
  markdown?: string;  // 新增：通用网页直接提供 markdown 字符串，跳过 blocksToMarkdown
}
```

飞书、金山路径不设置 `markdown`，行为不变。

### `useFileSave` 分支

```ts
const body = doc.markdown ?? blocksToMarkdown(doc.blocks);
```

其余逻辑（frontmatter 拼接、filename、写文件）不变。**通用路径完全不走图片下载/上传分支**。

## 数据流（通用网页）

```
用户在任意网页点 popup
  ↓
popup 判断 URL → 走 general 分支
  ↓
chrome.scripting.executeScript({ target: { tabId }, func: extractGeneral })
  ↓ 在 page world 跑 defuddle，返回 DocContent（含 markdown 字段）
popup 收到 DocContent
  ↓
useFileSave.save(doc):
  - doc.markdown 存在 → 直接用，跳过 blocksToMarkdown
  - buildFrontmatter(doc) → 拼 YAML
  - filename: doc.title 走现有 sanitize/冲突逻辑
  - 不进入图片下载/上传分支
  ↓
File System Access API 写入 {subDir}/{title}.md
```

无 `.assets/` 目录。

## Frontmatter 映射

| frontmatter key | 来源 |
|---|---|
| `title` | `result.title` |
| `source` | `location.href`（不用 defuddle 给的，更准确） |
| `author` | `result.author`，缺省空串 |
| `published` | `result.published`，缺省空串 |
| `description` | `result.description`，缺省空串 |
| `created` | 当前时间（沿用现有逻辑） |
| `tags` | 空数组（defuddle 不可靠地给 tags，先不映射） |

飞书路径的 frontmatter 字段集**不变**。`frontmatter.ts` 同一接口接受不同实例。

## 失败处理

- `result.content` 为空或 `wordCount < 50` → popup 显示"未识别到正文内容"，不写文件。
- `chrome.scripting.executeScript` 失败（如 `chrome://` 受限页面）→ popup 显示"当前页面不支持提取"。
- defuddle 抛异常 → 捕获后显示通用错误，不崩 popup。

不做：
- 正文质量启发式
- Readability 兜底（YAGNI）
- 缓存、预提取

## 依赖

- `pnpm add defuddle`
- import path: `defuddle/full`（含 Turndown + math 等）
- 预估 popup bundle 增大 ~40 KB gzipped

## 测试

- 新增 `tests/extractor/general.test.ts`：jsdom 加载固定 HTML fixture（普通博客、技术文带代码块、文章带图片），断言 defuddle 输出包含预期 markdown 片段与 frontmatter 字段。
- 不做真实站点端到端测试（脆弱）。
- 飞书、金山测试**不动**。

## 影响面与回归风险

- 飞书路径：零改动（除了 `DocContent` 多一个可选字段，TS 类型兼容）。
- 金山路径：同上。
- popup UI：URL 分流逻辑是新增分支，不影响现有按钮。
- manifest：新增 `activeTab` + `scripting` 权限，需要用户重新授权一次。

## 范围外的后续事项

- 如果通用路径正文质量不够，再考虑 Readability 兜底或自定义 selector 配置。
- 如果用户反馈想保存图片到本地/OSS，再扩 `imageMode` 到通用路径。
- 如果 defuddle markdown 风格和飞书路径差异大到困扰用户，再写 HTML→Block 适配层（即原讨论中的方案 B）。
