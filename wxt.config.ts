import { defineConfig } from 'wxt'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import tailwindcss from 'tailwindcss'
import { heroui } from '@heroui/react'
import messages from './MultiPost-Extension/src/haiqiai/messages.json'

const require = createRequire(import.meta.url)
const themeRoot = dirname(require.resolve('@heroui/theme', { paths: [dirname(require.resolve('@heroui/react'))] }))

export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/module-react'],
  vite: () => ({
    resolve: { dedupe: ['react', 'react-dom', '@heroui/react'] },
    css: {
      postcss: {
        plugins: [tailwindcss({
          content: [
            './MultiPost-Extension/src/haiqiai/**/*.tsx',
            resolve(themeRoot, '**/*.{js,ts,jsx,tsx}'),
          ],
          plugins: [heroui()],
        })],
      },
    },
  }),
  hooks: {
    'build:publicAssets': (_, files) => {
      files.push({
        relativeDest: '_locales/zh_CN/messages.json',
        contents: JSON.stringify(messages),
      })
    },
  },
  manifest: {
    default_locale: 'zh_CN',
    name: 'clip publish',
    description: 'clip publish：在一个浏览器扩展中剪藏内容、保存笔记，并发布到已接入的平台。',
    permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'sidePanel', 'alarms'],
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
