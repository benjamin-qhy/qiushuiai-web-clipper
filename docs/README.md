# clip publish 文档

## 现行文档

| 文档 | 用途 |
| --- | --- |
| [项目说明](../README.md) | 功能、构建与安装 |
| [使用说明](wiki.md) | 剪藏与发布入口 |
| [架构说明](architecture.md) | 当前模块、消息流与存储边界 |
| [MultiPost 发布技术架构](multipost-architecture.md) | Skill → API → 扩展 → 平台脚本、请求参数及默认开发范围；开发发布功能前必读 |
| [发布开发规则](agents/publishing-development.md) | 平台适配、API 驱动、恢复与验收约束；开发发布模块时读取 |
| [发布 API](../packages/publishing-api/README.md) | 配对、素材、任务、权限与恢复协议 |
| [发布 Skill](../skills/qiushui-publishing/SKILL.md) | 自动化调用与接续规则 |
| [当前交接](research/2026-10-10-publishing-handoff.md) | 已有实机证据、待验收范围及换电脑步骤 |
| [术语表](../GLOSSARY.md) | 统一领域用语 |
| [项目规则](../AGENTS.md) | 开发约束及按任务读取的入口 |

## 历史设计与证据

`superpowers/specs/`、`superpowers/plans/` 保存原功能的设计与实施记录，包括已删除的创作工作台、图片卡片和书签模块。`adr/` 中相关决策已注明历史状态。历史文档中的旧目录、旧仓库名和旧维护流程用于还原当时上下文。

`research/` 保存带日期的研究、平台观测、修复与验收证据；同一平台的较晚证据只覆盖明确测试的账号、素材和流程。当前状态以交接及后续真实证据为准，协议以发布 API 文档和当前代码为准。

`MultiPost-Extension/AGENTS.md` 包含子项目规则及按时间追加的验收记录；开发时先看其中当前范围说明，再按需追溯历史记录。历史方案中提到的 `CLAUDE.md` 是当时的文件名，现行规则以 `AGENTS.md` 为准。

新增、删除模块或改变接口时，在同一次任务中更新对应现行文档；仅长期规则或文档路由变化时更新根 `AGENTS.md`。验收结论写入带日期记录及当前交接，术语写入 `GLOSSARY.md`。
