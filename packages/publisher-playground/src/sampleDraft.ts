import type { PublisherDraft } from '@qiushui/content-publishing-workbench'

export const sampleDraft: PublisherDraft = {
  snapshot: {
    id: 'publisher-web-preview',
    extractedAt: '2026-09-15T06:00:00.000Z',
    markdown: `# 把长内容变成适合发布的图文

独立 Web 预览让内容工作台不依赖浏览器扩展，也能直接调试布局、编辑和导出流程。

## 可以测试什么

- 调整三栏宽度并隐藏或恢复栏目
- 编辑 Markdown，检查卡片分页
- 切换主题和封面
- 导出当前 PNG 或全部页面 ZIP

> 这是示例原文。点击“生成创作稿”会调用本地模拟适配器，不会发送网络请求。`,
    meta: {
      title: '内容发布工作台 Web 预览',
      source: 'https://example.com/publisher-preview',
      author: '秋水 AI',
      published: '2026-09-15',
      created: '2026-09-15',
      tags: ['内容创作', 'Web 预览'],
    },
  },
  draftMarkdown: `# 不装插件，也能调试内容工作台

现在可以直接在普通浏览器里查看 React 工作台。

## 一页完成创作检查

- 左侧核对原文
- 中间编辑创作稿
- 右侧实时检查小红书卡片

==所有数据只保存在当前浏览器。==

<!-- pagebreak -->

## 继续测试

拖动栏宽、切换主题、开启封面，然后尝试导出 PNG 或 ZIP。`,
  instruction: {
    mode: 'template',
    templateId: 'demo-xhs',
    manualContent: '',
  },
  model: {
    platformId: 'demo',
    modelId: 'local-preview',
    reasoning: 'off',
  },
  themeId: 'minimal',
  coverEnabled: false,
  currentPage: 0,
}
