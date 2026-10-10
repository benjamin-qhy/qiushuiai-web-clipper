# 海奇AI浏览器扩展

海奇AI（HaiqiAI）将网页、飞书文档和金山文档保存为 Obsidian Markdown 笔记，并整合 API 驱动的内容发布。仓库与包名为 `haiqiai-browser-extension`，浏览器扩展显示名称为“海奇AI”。

## 当前功能

- 剪藏飞书 docx/wiki、金山文档和通用网页，生成正文与 YAML 元数据。
- 图片保存到每篇笔记资源目录、共享目录，或上传阿里云 OSS。
- 保存链接到 Get 笔记；在抖音收藏页批量选择并导入链接。
- 管理多平台 AI 模型、连接测试与系统提示词。
- Chrome 提供 React 发布工作台，与独立发布 API 配对、查看账号和任务、触发执行与只读结果核对。Firefox 保留剪藏功能，隐藏发布入口且不注册发布后台。

旧内容创作工作台、图片卡片、独立 Web 预览和书签管理已经移除。现有发布工作台是 MultiPost 集成的任务执行界面。

发布能力有明确的验收范围：小红书图文自动暂存、发布及结果核对已有实机记录；视频仅多次原页接续存草稿通过，新任务单次完成、双封面和公开发布未验收。其他平台按代码接入和真实验收分别记录。详见 [当前交接](docs/research/2026-10-10-publishing-handoff.md)。

## 本地开发与安装

根扩展使用 pnpm 9、WXT、Vue 3、React 18 与 TypeScript。发布 API 需要 Node.js **24.13+**（内置 SQLite）。

```sh
pnpm install
pnpm --dir MultiPost-Extension install --ignore-workspace --frozen-lockfile --ignore-scripts
pnpm dev
pnpm build
pnpm build:firefox
pnpm compile
pnpm exec vitest run --maxWorkers=1
```

第二条安装命令补齐根 WXT 构建所需的子项目配置与依赖；pnpm 9 使用 `--ignore-workspace` 跳过上游仅含构建依赖设置的工作区文件。此处跳过子项目安装脚本，不安装其 Git hooks。

Chrome 打开 `chrome://extensions/`，开启开发者模式，加载 `.output/chrome-mv3/`。Firefox 打开 `about:debugging#/runtime/this-firefox`，临时加载 `.output/firefox-mv2/manifest.json`；临时安装在重启后失效。发行包用 `pnpm zip` 或 `pnpm zip:firefox` 生成，输出文件名包含包名和版本，以 `.output/` 实际产物为准。

首次剪藏前，在弹窗选择 Obsidian 笔记库并授权读写；设置页可配置子目录、图片模式、OSS、Get 笔记和 AI 模型。Chrome 从弹窗或设置页的“发布工作台”进入 API 配对和任务界面。

发布服务启动、账号登记、素材上传与调用参数见 [发布 API](packages/publishing-api/README.md)，自动化调用见 [发布 Skill](skills/haiqiai-publishing/SKILL.md)。所有平台写操作由 API 驱动扩展；记录最终动作授权与平台结果，结果未知时先核对原任务。

## 文档

- [文档导航](docs/README.md)：现行文档与历史记录的入口。
- [架构说明](docs/architecture.md)：模块边界、消息流、存储、构建与验证。
- [使用说明](docs/wiki.md)：剪藏、Get 笔记与发布入口。
- [术语表](GLOSSARY.md)与 [项目规则](AGENTS.md)。

GitHub：[benjamin-qhy/haiqiai-browser-extension](https://github.com/benjamin-qhy/haiqiai-browser-extension)。更新检查暂沿用既有服务端路径 `http://version.qiushui.me/qiushuiai-web-clipper.json`，仓库改名不代表该外部接口已迁移。
