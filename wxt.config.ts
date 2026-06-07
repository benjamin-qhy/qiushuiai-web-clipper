import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'QiushuiAI · 网页剪藏',
    description: 'QiushuiAI · 网页剪藏 — 将网页，飞书、金山文档一键保存为 Obsidian Markdown 笔记',
    permissions: ['storage', 'activeTab', 'scripting', 'bookmarks', 'alarms', 'tabs', 'sidePanel'],
    host_permissions: [
      '*://*.feishu.cn/*',
      '*://*.kdocs.cn/*',
      'https://*.aliyuncs.com/*',
      '<all_urls>',
    ],
    side_panel: {
      default_path: 'douyin-sidepanel.html',
    },
  },
})
