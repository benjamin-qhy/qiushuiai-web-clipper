# QiushuiAI · 网页剪藏

将飞书文档、金山文档和任意网页一键保存为 Obsidian Markdown 笔记的浏览器扩展，支持 Chrome 和 Firefox。

---

## 功能特性

**文档剪藏**

- **飞书文档**（docx / wiki）：完整提取标题、正文、图片、代码块、表格、列表等，保留原始格式
- **金山文档**（kdocs.cn）：提取文档正文并转换为 Markdown
- **通用网页**：自动提取页面标题、作者、发布时间和正文，转换为干净的 Markdown

**图片处理**

- `local / per-note`（默认）：图片保存到与笔记同名的 `.assets/` 文件夹，Markdown 使用相对路径引用
- `local / shared`：图片统一保存到共享目录，适合多篇笔记复用
- `OSS`：图片上传至阿里云 OSS，Markdown 使用完整 URL 引用

**书签管理**

- 查看和搜索浏览器书签，支持文件夹树结构浏览
- AI 自动分类书签（基于阿里云通义千问或任意 OpenAI 兼容接口）
- 书签去重、导出为 Markdown

---

## 安装

目前扩展尚未发布至 Chrome 应用商店，需手动加载。

### Chrome

1. 前往 [Releases](https://gitee.com/Benjamin-QHY/qiushuiai-web-clipper/releases) 下载最新版 `chrome.zip` 并解压
2. 打开 Chrome，地址栏输入 `chrome://extensions`
3. 开启右上角**开发者模式**
4. 点击**加载已解压的扩展**，选择解压后的文件夹

### Firefox

1. 前往 [Releases](https://gitee.com/Benjamin-QHY/qiushuiai-web-clipper/releases) 下载最新版 `firefox.zip` 并解压
2. 打开 Firefox，地址栏输入 `about:debugging#/runtime/this-firefox`
3. 点击**临时加载附加组件**，选择解压目录中的 `manifest.json`

---

## 使用方法

### 第一次使用：授权 Obsidian Vault

1. 点击浏览器工具栏中的扩展图标，打开弹窗
2. 点击**选择 Vault 文件夹**，在系统对话框中选择你的 Obsidian 笔记库根目录
3. 授权后，扩展会记住该目录，后续无需重复操作

### 剪藏网页

1. 打开目标页面（飞书文档、金山文档或任意网页）
2. 点击扩展图标
3. 弹窗中会自动显示提取到的标题和内容预览
4. 点击**保存**，笔记即写入 Obsidian Vault 对应目录

### 配置选项

点击扩展图标 → 右上角齿轮图标，进入设置页：

| 选项 | 说明 |
|------|------|
| 保存子目录 | 笔记在 Vault 中的子目录路径，留空则保存到根目录 |
| 图片模式 | `per-note` / `shared` / `oss`，见上方说明 |
| OSS 配置 | 阿里云 OSS 的 Endpoint、Bucket、AccessKey 等 |
| AI 配置 | API Key、Base URL、模型名称（支持任意 OpenAI 兼容接口） |

---

## 技术栈

- [WXT](https://wxt.dev) — 浏览器扩展开发框架
- [Vue 3](https://vuejs.org) + TypeScript
- File System Access API — 直接写入本地 Obsidian Vault
