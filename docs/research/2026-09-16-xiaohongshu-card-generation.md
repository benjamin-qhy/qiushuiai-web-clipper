# 小红书图文卡片生成能力调研与修复方案

日期：2026-09-16

## 结论先行

当前工作台的底层路线是正确的：`Markdown 语义块 -> 隐藏 DOM 真实测量 -> 页面计划 -> 预览与导出共用卡片 DOM`。它已经比“按固定字数截断”的多数同类工具更可靠，不应改回纯字符数分页，也没有必要迁移到纯 Canvas 渲染。

下一阶段真正需要补齐的是编辑和排版决策层：

1. **把“多少文字”从固定字数改成可观测的版面预算。** 硬约束是实测高度不溢出；软目标是正文卡 65%–85% 填充率。字数只能作为即时提示，不能决定分页。
2. **完善分页质量，而不是重写分页架构。** 当前长段落能在 grapheme 边界拆分，但还缺 CJK 禁则、句子优先、段首/段尾孤行控制和末页回流。
3. **把已有语法变成可发现的操作。** 当前支持 `<!-- pagebreak -->` 和 `==重点==`，但编辑器没有“插入分页”“划重点”工具栏，也没有页缩略图和每页密度反馈。
4. **约束 AI 输出结构。** 固定契约应增加“一卡一主题”、每节重点数量、重点长度和显式分页的规则；生成后还应由排版器检查，而不能信任模型自行估计页高。
5. **继续使用 1242×1656。** 这是精确 3:4、适合当前导出链路的安全工程选择，但不是小红书官方声明的唯一最佳尺寸。
6. **把 18 张作为发布兼容警戒线。** 小红书 Android 分享 SDK 公开文档规定图文图片为 1–18 张。产品可以建议 6–10 张，但不应在更小页数处截断；超过 18 张时应提示拆成系列，而不是丢内容。

## 调研边界与证据等级

本报告优先使用以下一手资料：

- 小红书官方分享开放平台文档；
- 开源项目 README、许可证和实际源码；
- WHATWG、W3C、MDN 的浏览器排版规范。

没有找到小红书官方公开的“单张文字卡应放多少字”规范。下文的字数、密度和重点比例均为产品启发式，不能表述为平台官方限制。

## 小红书官方公开边界

### 图片张数

[小红书 Android 分享 SDK](https://agora.xiaohongshu.com/doc/android) 将图文笔记定义为图片必传、数量 **1–18 张**，标题和正文可选。这是目前最直接的官方图文张数依据。

建议：

- 6–10 张只作为默认创作建议；
- 11–18 张允许正常生成和导出，并提示阅读成本；
- 超过 18 张不截断内容，显示“建议拆成上/下篇”，并允许继续本地导出；
- 如果未来增加“一键分享到小红书”，届时再把 18 张作为该动作的硬校验。

### 图片尺寸与比例

[小红书 iOS 分享 SDK](https://agora.xiaohongshu.com/doc/ios) 公布的 `imageData` / 本地路径老裁剪规则包括：宽度小于 600、最长边大于 1920、宽高比小于 3:4 或大于 2:1、宽度大于 1280 时会触发裁剪；`imageId` / 网络 URL 使用新裁剪规则，但页面没有公开对应具体值。[官方 FAQ](https://agora.xiaohongshu.com/doc/qa) 也说明两类资源采用不同裁剪规则，未来还可能统一。

因此：

- 当前 `1242×1656` 是精确 3:4，位于旧规则的安全范围内；
- `1080×1440` 也满足相同比例，不能宣称 1242×1656 是官方唯一尺寸；
- 尺寸规则可能变化，应把画布尺寸集中为平台 preset，而不是散落在组件和样式中。

## 当前实现基线与缺口

### 已经做对的部分

当前代码已有以下能力：

| 能力 | 当前实现 |
| --- | --- |
| 画布 | `1242×1656`，严格 3:4 |
| 内容区 | `1018×1376` |
| 正文排版 | `44px`，`line-height: 1.58`，块间距 `32px` |
| 测量 | 隐藏、未缩放的最终卡片 DOM，等待 `document.fonts.ready` 后测量 |
| 自动分页 | 块边界优先，超高块二分拆分 |
| 标题保护 | 标题会尝试携带后续实质内容 |
| 手动分页语义 | 单独一行 `<!-- pagebreak -->` |
| 重点语义 | `==重点== -> InlineNode.mark -> <mark>` |
| 一致性 | 预览和导出复用同一页面计划与卡片组件 |
| 长文 | 不限制总页数；超过 20 页只提示性能风险 |

对应实现主要位于：

- `packages/content-publishing-workbench/src/layout/MeasureStage.tsx`
- `packages/content-publishing-workbench/src/layout/planPages.ts`
- `packages/content-publishing-workbench/src/markdown/inlineMarks.ts`
- `packages/content-publishing-workbench/src/markdown/parse.ts`
- `packages/content-publishing-workbench/src/card/CardCanvas.tsx`
- `packages/content-publishing-workbench/src/styles.css`

### 主要缺口

1. 编辑器是 Markdown textarea，没有分页、高亮、标题、列表等快捷工具栏。
2. 只有上一页/下一页导航，缺少整组缩略图；用户难以看出哪里太空、太满或主题断裂。
3. 段落拆分仅保证 grapheme 完整，仍可能在中文闭合标点前、开引号后、英文单词内部或语义很差的位置断开。
4. 没有“段前至少两行、段后至少两行”的孤行控制。
5. 没有舒展/平衡/紧凑密度档位；用户只能接受单一 44px/1.58 组合。
6. AI 输出契约只要求短段落、标题、列表、粗体和重点，没有约束“一卡一主题”、重点密度和卡片节奏。
7. `mark` 当前有水平 padding；若未来不同主题给重点增加不同 padding、border 或 font-weight，会改变换行，从而破坏“换主题不改变页数”的承诺。
8. 当前 `>20 页` 提示与官方分享 SDK 的 18 张边界不一致。性能提示和发布兼容提示应拆开。

## 一张卡片到底放多少文字

### 不能用固定字数做硬限制

相同字数在以下情况下高度差异很大：

- 中文、英文、数字、emoji、长 URL 的宽度不同；
- 标题、列表、引用、代码和表格的行高、缩进与间距不同；
- 字体加载前后的 glyph 宽度不同；
- `**粗体**`、`==重点==`、链接和行内代码可能改变字宽；
- 图片、图注和局部字号无法折算成稳定字数。

浏览器标准也支持这一结论：[CSS Text](https://www.w3.org/TR/css-text-3/) 说明软换行机会取决于语言、书写系统及 `line-break`、`word-break`、`overflow-wrap` 等属性；[Canvas `measureText`](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-measuretext-dev) 只提供给定 Canvas 字体下的文本度量，不知道 DOM 的行高、margin、列表缩进、图片和表格布局。

### 当前版式的理论上限

以当前纯中文、纯正文、无标题、无块间距的极端情况估算：

- 横向：`1018 / 44 = 23.14` 个全角 em，约 23 个汉字/行；
- 纵向：正文行高 `44 × 1.58 = 69.52px`；
- `1376 / 69.52 = 19.79`，约 19 个完整正文行；
- 理论排满约 `23 × 19 = 437` 个全角字素。

这只是几何上限，不是推荐值。只要出现 2–4 个段落，32px 块间距就会再消耗约 1–2 行；标题、列表和重点也会降低容量。在手机信息流里把 437 字排满，视觉上会明显过密。

### 推荐的“可测量预算”

每页保存以下指标：

```ts
interface PageMetrics {
  usedHeight: number
  contentHeight: number
  fillRatio: number       // usedHeight / contentHeight
  lineCount: number       // Range.getClientRects() 聚类后的视觉行数
  graphemeCount: number   // 仅用于提示，不用于分页
  highlightRatio: number  // 重点字素 / 全部正文文字字素
  warningCodes: string[]
}
```

建议阈值：

| 指标 | 建议 | 解释 |
| --- | --- | --- |
| 硬溢出 | `usedHeight <= contentHeight - safetyBuffer` | 永远不能裁字；建议保留 24–32px 测量安全量 |
| 理想填充 | 65%–85% | 留白与信息量较平衡 |
| 偏空 | `<55%` | 中间页尝试从后一页回流；末页允许偏空 |
| 偏满 | `>92%` | 优先换页，避免字体差异或导出误差触底 |
| 段落分页 | 两侧各至少 2 个视觉行 | 避免页尾/页首孤行 |
| 标题保护 | 标题 + 后文至少 2 行或一个完整实质块 | 避免孤立标题 |
| 重点比例 | 每卡 1–3 处，建议不超过正文的 15% | 产品规则，不是平台限制 |

为了给作者即时预期，可以显示近似字数提示，但必须标明为估算：

- 舒展：正文卡约 140–200 个汉字；
- 平衡：正文卡约 160–240 个汉字；
- 紧凑：正文卡约 220–280 个汉字；
- 纯文本页可更高，但超过 280 时优先建议拆页，不自动缩小到难读。

这些区间与开源项目的实践大致相符：`content-to-xhs-card` 建议正文每页最多 4 个要点、单条 30–45 汉字；`xhs-card-renderer` 在其 1080×1440、38px/1.85 的特定版式下建议 180–280 字。它们只能作为体验基准，最终仍以本工作台真实 DOM 测量为准。

### 密度档位

增加三个可理解的 preset，每个 preset 同时调整字号、行高、块间距和标题留白，不允许只压缩字号：

| 档位 | 目标 | 当前 1242px 画布的起始建议 |
| --- | --- | --- |
| 舒展 | 观点、故事、情绪表达 | 48px / 1.64 / gap 38px |
| 平衡 | 默认知识卡 | 44px / 1.58 / gap 32px |
| 紧凑 | 清单、教程、技术摘要 | 40px / 1.52 / gap 24px |

最终数值要通过实际卡片视觉验收校准。档位变化必然允许改变分页；单纯切换颜色主题则不应改变分页。

## 自动换卡策略

### 决策优先级

建议按以下顺序执行，前者优先级高于后者：

1. **显式分页**：`<!-- pagebreak -->` 必须无条件换页，且页面平衡不得跨越它移动内容。
2. **完整块边界**：标题、段落、列表、引用、代码、表格、图片优先整体放置。
3. **标题簇保护**：标题必须携带至少 2 行正文，或一个可独立理解的实质块；H2 的保护强于 H3/H4。
4. **结构化块拆分**：列表按 item，代码按源代码行，表格按 body row 并重复表头，引用按子块，图片与图注默认不可拆。
5. **长段落拆分**：先句号/问号/感叹号等句末，再逗号/分号等次级语义边界，再使用符合 Unicode/CJK 规则的词或字素边界。
6. **真实高度二分**：候选断点使用未缩放最终 DOM 测量，二分找到能容纳的最远安全断点。
7. **孤行修正**：分页两侧都至少保留 2 行；如果做不到，将整段移动到下一页。
8. **末页回流**：最后一页过空时，从前一页移动最后一个语义块或安全句段；不得越过显式分页。
9. **不可拆超高块**：独占一页并显示诊断；表格、代码、公式可使用自己的字号/缩放策略，不能连带缩小普通正文。

[CSS Fragmentation](https://www.w3.org/TR/css-break-3/) 定义了 `break-before`、`break-after`、`break-inside`、`orphans` 和 `widows`，但规范允许空间不足时逐级放宽规则，也不保证不同浏览器选择相同断点。因此它适合表达打印意图，不适合作为本产品确定性的页面计划引擎。继续使用应用层 `PagePlan` 是正确选择。

### CJK 与复杂字符

当前使用 `Intl.Segmenter` 的 grapheme 分割能避免把 emoji、组合字符拆坏；[MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) 也明确说明 grapheme 是用户感知的最小字符单元。

但 grapheme 完整不等于断行美观。下一步应增加：

- 禁止 `。！？）》】」』、，；：` 等闭合/句末标点出现在行首；
- 禁止 `（《【「『` 等开标点出现在行尾；
- 英文单词、URL、数字串优先整体保留，超长时才 `overflow-wrap:anywhere`；
- 使用 Unicode Line Breaking Algorithm 或成熟实现生成候选断点；
- 保留现有 inline AST，在切分后重建左右两侧节点，不能退化为纯文本。

`Viy1204/smart-red-public` 的 `cjk-line-breaker.ts` 和 `pagination-engine.ts` 是直接可研究的实现：它先得到禁则安全的断点，再以真实测量细化断点，并保护粗体、链接等行内 span。

### 测量稳定性

分页必须在未缩放卡片上进行：[getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect) 返回渲染后的边界，带 `transform: scale()` 的预览节点会污染尺寸；当前独立 MeasureStage 的做法是对的。

建议完善为：

1. `await document.fonts.ready`；[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts) 说明该 Promise 在已使用字体加载与布局完成后兑现。
2. 对页面内图片等待 `HTMLImageElement.decode()` 或 load/error。
3. 等待两个 `requestAnimationFrame`，让样式和布局稳定。
4. 测量完整候选块栈的 `getBoundingClientRect().height`；需要逐行信息时用 `Range.getClientRects()`。
5. 字体、字号、行高、内容宽度、图片尺寸、Markdown 或几何参数变化时，使旧缓存和旧 `PagePlan` 失效。
6. 取消旧测量，防止快速编辑时旧结果覆盖新结果。
7. 导出前复测所有卡片：`scrollHeight <= clientHeight + 1` 且正文 bottom 不超过内容框 bottom。

[ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API) 可用于监听容器尺寸变化，但分页画布本身应该保持固定几何；它更适合驱动预览缩放，而不是重新定义卡片内容容量。

## 手动换卡与编辑体验

仅支持语法但没有 UI，不足以称为完整创作工具。建议给 Markdown 编辑器增加轻量工具栏，而不是立即迁移到富文本编辑器：

- **分页**：在光标所在块后插入独占一行的 `<!-- pagebreak -->`；再次点击可删除相邻分页符。
- **划重点**：将选区包裹为 `==选中文字==`；若已包裹则取消。
- **粗体/标题/列表**：插入标准 Markdown，降低手写门槛。
- **本页到此结束**：卡片预览的菜单动作定位源块并插入分页符。
- **删除分页**：缩略图之间显示分页锚点；手动分页可删除，自动分页只显示不可编辑的淡色分隔。
- **撤销/重做**：所有工具栏动作进入同一编辑历史。

成品区增加纵向或横向缩略图带：

- 显示全部页、当前页、手动分页标记；
- 每页显示填充率状态：偏空、平衡、偏满、溢出；
- 点击缩略图切页，同时在编辑器定位到该页第一个源 block；
- 封面作为独立缩略图，但不参与正文密度统计；
- 暂不支持任意拖动重排，因为拖动页面会改变源 Markdown 语义；若未来提供，应实际移动源 block，而不是只改预览顺序。

## 划重点与其他文字效果

### 语义层

继续保留语义差异：

- `**粗体**`：表示重要性；
- `==重点==`：表示当前内容中需要读者注意的片段；
- 行内代码、链接、引用分别保持自己的语义。

成品应继续使用持久 DOM `<mark>`。[WHATWG/MDN 的 `<mark>` 定义](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/mark) 正是“因当前上下文相关性而标记/高亮”的文本。CSS Custom Highlight API 不修改 DOM，适合编辑器选区或搜索命中，但 html-to-image 克隆 DOM 时高亮注册表可能丢失，不适合成品语义。

### 视觉层

每个主题通过相同几何、不同绘制方式呈现重点：

- 荧光笔：下半部 linear-gradient；
- 色块：低透明度背景；
- 下划线：较粗 accent underline；
- 圆圈/手绘：伪元素或 SVG 背景，但不能挡字。

关键约束：主题切换不能改变分页。因此主题级高亮样式应保持相同的 font、font-weight、line-height、padding、border-width 和 letter-spacing，只改变颜色、背景与不参与布局的装饰。多行重点如需每行独立背景，可使用 `box-decoration-break: clone` 及 `-webkit-box-decoration-break: clone`；[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-decoration-break) 提醒该能力仍存在兼容性差异，需在 Chrome/Firefox 导出路径各自验证。

### 重点密度

建议规则：

- 每卡 1–3 处；
- 单处优先 4–14 个汉字，不高亮整段；
- 总重点字素不超过正文的约 15%；
- 标题已经具备强层级时，不再整句高亮标题；
- 高亮可以跨行，但不能跨页；分页器在 `<mark>` 内部拆分时应复制 mark 语义到两侧，而不是泄漏 `==` 标记。

这也是 AI 输出后的可诊断项：超过阈值时给警告并定位，不要静默删除用户重点。

## AI 输出契约建议

在现有 Markdown 格式契约上补充：

```md
- 每个二级标题只表达一个主题，每个主题应能独立成为一张或连续少量卡片。
- 使用短段落；一个段落优先 1–3 句。
- 每个主题使用 1–3 个 ==重点短语==，单处尽量不超过 14 个汉字；不要整段高亮。
- 列表每组优先 3–5 项，每项一句话；超过时拆成下一主题。
- 必须保持完整事实、因果和步骤，不为凑页数删减信息。
- 只有在语义上必须换卡时才输出独占一行的 <!-- pagebreak -->。
- 不要用连续空行模拟分页，不要用 --- 代替分页符。
```

模型无法知道真实字体渲染后的高度，所以“一卡多少字”不能只交给提示词。生成后必须经过同一 PagePlan：

1. 解析并排版；
2. 检查偏满、偏空、孤立标题、重点过密；
3. UI 给出可操作的诊断；
4. 用户决定接受、插入分页或让 AI 仅重写问题章节。

后续若增加“自动优化分页”，应只把问题章节、实际测量指标和目标约束发给 AI，不应整篇反复重写。

## 参考开源项目

### 1. haodongcui/md2card — 首选架构与密度参考

- 仓库：[haodongcui/md2card](https://github.com/haodongcui/md2card)
- 分页：[src/layout/paginate.ts](https://github.com/haodongcui/md2card/blob/main/src/layout/paginate.ts)
- 测量：[src/renderer/MeasureStage.tsx](https://github.com/haodongcui/md2card/blob/main/src/renderer/MeasureStage.tsx)
- 类型与密度 preset：[src/domain/document.ts](https://github.com/haodongcui/md2card/blob/main/src/domain/document.ts)
- 许可证：[MIT](https://github.com/haodongcui/md2card/blob/main/LICENSE)

可借鉴：

- 舒展/平衡/紧凑密度同时调整字号、行高、块间距和标题留白；
- H2/H3/H4 分级页尾安全区；
- H2 携带短引言后的实质内容；
- 表格重复表头、代码按行续页、图片与图注同块；
- 中间稀疏页诊断；
- 字体和图片 ready 后 DOM 测量；
- 解析、分页、渲染、导出职责分离。

该项目与当前架构非常接近，可参考算法与测试案例。直接复制实质代码时必须保留 MIT 版权和许可证声明。

### 2. Viy1204/smart-red-public — 首选 CJK 与长段落参考

- 仓库：[Viy1204/smart-red-public](https://github.com/Viy1204/smart-red-public)
- 分页：[src/pagination-engine.ts](https://github.com/Viy1204/smart-red-public/blob/main/src/pagination-engine.ts)
- CJK 换行：[src/cjk-line-breaker.ts](https://github.com/Viy1204/smart-red-public/blob/main/src/cjk-line-breaker.ts)
- 许可证：[MIT](https://github.com/Viy1204/smart-red-public/blob/main/LICENSE)
- 字体说明：[LICENSE-FONTS](https://github.com/Viy1204/smart-red-public/blob/main/LICENSE-FONTS)

可借鉴：

- 真实 DOM 测量驱动的贪心分页；
- Unicode/CJK 换行机会和行首/行尾禁则；
- 粗分后在真实测量窗口内二分细化断点；
- 避免断点落在粗体、删除线、行内代码等 span 内；
- 标题至少携带两行后文；
- 代码、列表、引用分别按适合的结构拆分；
- 字体加载等待和字体可用性提示。

风险：仓库包含品牌风格模板和 OFL 字体。算法代码为 MIT，但品牌名、视觉资产和字体仍应分别审查；本项目应做原创主题，不复制品牌外观。

### 3. huanjuedadehen/rednote-cards — 编辑器与多页操作参考

- 仓库：[huanjuedadehen/rednote-cards](https://github.com/huanjuedadehen/rednote-cards)
- 富文本工具栏：[src/components/RichTextEditor.tsx](https://github.com/huanjuedadehen/rednote-cards/blob/main/src/components/RichTextEditor.tsx)
- 页面数据：[src/templates/base.ts](https://github.com/huanjuedadehen/rednote-cards/blob/main/src/templates/base.ts)
- 预览：[src/components/Preview.tsx](https://github.com/huanjuedadehen/rednote-cards/blob/main/src/components/Preview.tsx)
- 许可证：[MIT](https://github.com/huanjuedadehen/rednote-cards/blob/main/LICENSE)

可借鉴：

- Tiptap 的粗体、斜体、标题、列表、分隔线、撤销/重做工具栏；
- 页面数组作为明确编辑单位；
- 有序列表跨页时延续编号；
- 414×552 预览、3× 导出为 1242×1656 的直观缩放关系。

注意：它的页面内容本质上由用户分成 HTML 数组，`buildPages` 并不是高度驱动的自动分页器。适合参考交互，不应取代当前分页内核。

### 4. pangxiaobin/MarkCardStudio — 分页策略与总览参考

- 仓库：[pangxiaobin/MarkCardStudio](https://github.com/pangxiaobin/MarkCardStudio)
- 测量分页：[src/composables/useMeasuredPagination.js](https://github.com/pangxiaobin/MarkCardStudio/blob/main/src/composables/useMeasuredPagination.js)
- 分页设置：[src/components/settings/SettingsPagination.vue](https://github.com/pangxiaobin/MarkCardStudio/blob/main/src/components/settings/SettingsPagination.vue)
- 预览总览：[src/components/preview/PreviewCanvas.vue](https://github.com/pangxiaobin/MarkCardStudio/blob/main/src/components/preview/PreviewCanvas.vue)
- 许可证：[GPL-3.0](https://github.com/pangxiaobin/MarkCardStudio/blob/main/LICENSE)

可借鉴：

- H2、H3、自定义分隔符、字符数、智能自适应等多种分页策略的产品表达；
- 单页/总览两种预览模式；
- 分页请求取消，避免旧异步结果覆盖新内容；
- PNG/JPG/PDF/长图等交付形态的组织方式。

许可风险：GPL-3.0 是强 copyleft。可以研究行为和重新实现思路，但不要把源码复制进当前项目，除非确认整个衍生作品满足 GPL-3.0；其 OpenMoji 素材另受 CC BY-SA 4.0 约束。

### 5. XHS-TextCard — Canvas 方案与高亮语法参考

- 仓库：[geekfoxcharlie/XHS-TextCard](https://github.com/geekfoxcharlie/XHS-TextCard)
- 分页：[js/TextSplitter.js](https://github.com/geekfoxcharlie/XHS-TextCard/blob/main/js/TextSplitter.js)
- Canvas 文本引擎：[js/utils/canvas-text-engine.js](https://github.com/geekfoxcharlie/XHS-TextCard/blob/main/js/utils/canvas-text-engine.js)
- `==高亮==` 扩展：[js/utils/markdown.js](https://github.com/geekfoxcharlie/XHS-TextCard/blob/main/js/utils/markdown.js)
- 许可证：[MIT](https://github.com/geekfoxcharlie/XHS-TextCard/blob/main/LICENSE)

可借鉴：

- marked lexer 生成块，再进行行级布局和递归拆分；
- `==内容==` 注册为独立 inline token 并渲染成 mark；
- 表格按行拆分并重复表头；
- 配置驱动主题和 1242×1656 输出。

不建议照搬 Canvas 引擎。Canvas `measureText` 无法自然覆盖 DOM margin、列表、表格、字体 fallback 和可访问语义；当前 React DOM + html-to-image 更适合已有主题系统。

### 6. 其他内容规划参考

- [learningcodeaaron/content-to-xhs-card](https://github.com/learningcodeaaron/content-to-xhs-card)：MIT；可研究“一卡一个主张/一组支撑/一句记忆点”、关系驱动布局和浏览器溢出检查。仓库品牌 Logo、头像等素材不得因代码 MIT 就默认复用。
- [cyrus-tt/xhs-card-renderer](https://github.com/cyrus-tt/xhs-card-renderer)：MIT；可研究高可读文字卡的 38px/1.85、180–280 字和少量强调规则，但这些数字只适用于它自己的 1080×1440 版式。

## 许可证与素材风险

| 来源 | 许可证 | 建议 |
| --- | --- | --- |
| haodongcui/md2card | MIT | 可参考/移植，复制实质代码需保留版权与许可证 |
| Viy1204/smart-red-public | MIT；字体另为 OFL | 算法可参考；字体和品牌模板分别审查 |
| huanjuedadehen/rednote-cards | MIT | 可参考工具栏和多页 UX |
| XHS-TextCard | MIT | 可参考语法和分页结构，不必迁移到 Canvas |
| MarkCardStudio | GPL-3.0；部分素材 CC BY-SA 4.0 | 只研究行为并独立实现，避免复制源码/素材 |
| content-to-xhs-card | MIT | 替换作者 Logo、头像和品牌素材 |

无论仓库采用何种开源许可证，都不要自动假设截图、Logo、作者头像、平台图标、字体和模板品牌外观被同一许可证覆盖。若直接移植 MIT 项目的实质代码，应新增 `THIRD_PARTY_NOTICES` 或等价清单，记录来源、提交和许可证。

## 推荐迭代顺序

### P0：先修“可控与可解释”

目标：不改架构，先让用户知道为什么换页并能干预。

1. 加入“划重点”“插入分页”Markdown 工具栏。
2. 加入页缩略图和填充率状态。
3. 将 `>20 页` 拆成两种提示：`>12` 阅读/性能提醒、`>18` 小红书分享兼容提醒；均不截断本地输出。
4. 为每页输出 `PageMetrics`，增加溢出、偏满、偏空、孤立标题、重点过密诊断。
5. 更新 AI 契约：一卡一主题、重点密度、列表长度和显式分页规则。

验收：用户无需手写注释即可强制换页/划重点；能在总览中一眼识别问题页；导出不丢内容。

### P1：提升自动分页质量

1. 生成 CJK/Unicode 安全断点，替换“任意 grapheme 都可断”的候选集合。
2. 增加句子优先、段落前后至少 2 行、标题簇分级保护。
3. 列表按 item、代码按行、表格按行且重复表头；图片与图注不拆。
4. 增加末页回流，但禁止跨越手动分页符。
5. 图片 decode、字体变化、主题 typography 变化时稳定取消和重排。

验收：中文标点不悬挂，英文单词不被无故拆开，页首/页尾无单行段落，手动分页绝不漂移。

### P2：密度与局部调优

1. 增加舒展/平衡/紧凑 preset。
2. 表格、代码、公式、图片各自提供局部密度控制，不连带缩小正文。
3. 允许对单个问题章节发起 AI 重排，不重写整篇。
4. 建立真实文章视觉基准集，校准每档密度的字数提示和填充率阈值。

验收：档位改变分页是可预期的；颜色主题切换不改变分页；紧凑档仍能在手机上清晰阅读。

### P3：高级创作能力

1. 可选富文本/WYSIWYG 编辑模式，但 Markdown 继续作为可移植源格式。
2. 图片、图表、公式的语义安全分页。
3. 可恢复的页面锁定或章节级分页策略。
4. 如果增加小红书分享能力，按当时官方文档重新验证张数、尺寸和裁剪规则。

## 测试与视觉验收矩阵

### 分页单元测试

- 中文句号、逗号、引号、括号处的禁则；
- 中英文混排、数字串、emoji、组合字符、长 URL；
- 重点、粗体、链接跨候选断点时语义不丢失；
- 标题 + 2 行正文保护；
- 2/2 行段落孤行规则；
- 列表 item、续页编号、嵌套列表；
- 代码按行续页；
- 表格重复表头；
- 手动分页优先且末页平衡不能跨越；
- 超高不可拆块给出诊断而不死循环。

### 浏览器集成测试

- 字体加载前后页数最终稳定；
- 慢图片 decode 后重排；
- 快速连续编辑会取消旧测量；
- `getBoundingClientRect` 在未缩放测量台执行；
- 每页正文 bottom 不超过 content box bottom；
- 预览和导出使用相同 PagePlan；
- PNG 中保留 `<mark>` 视觉；
- Chrome 与 Firefox 均验证多行 mark、字体 fallback 和导出。

### 视觉基准

至少维护 8 篇固定样稿：短观点、长叙事、步骤教程、清单、中英混排、代码密集、表格密集、重点密集。对六个主题和三个密度档生成截图，检查：

- 手机缩略尺寸仍可读；
- 没有页尾孤立标题或单行；
- 没有标点悬挂；
- 重点不会满屏且跨行效果完整；
- 中间页填充自然，末页留白可接受；
- 同一 typography 下切换颜色主题页数不变。

## 最终建议

“完美复刻”不应理解为复制小红书某个内置模板的像素外观，而应复刻其成功的创作体验：手机优先的 3:4 画布、每卡单一信息焦点、短段落、可感知的重点、连贯的多页节奏、用户可控换页和稳定高清导出。

当前项目无需推倒重来。最有价值的下一步是先补 **分页/重点工具栏 + 全页缩略图 + PageMetrics**，随后在现有 `planPages.ts` 上加入 **CJK 安全断点、孤行控制和末页回流**。这样能以最小改动把“技术上能分页”提升为“创作者可预测、可控制、可发布”的完整能力。
