# clip publish 项目指令

此文件只保存跨任务长期有效的约束。按当前任务读取下方对应文档；实现状态以代码和带证据的当前交接为准。

## 项目边界

- 剪藏使用 WXT、Vue 3；发布使用 MultiPost 的 React 页面和平台脚本，由根 WXT 构建统一扩展。`MultiPost-Extension/` 仍保留独立 Plasmo 构建。模块边界见 `docs/architecture.md`。
- 根 `AGENTS.md` 是本仓库长期规则入口；子项目开发还需读取 `MultiPost-Extension/AGENTS.md`。历史研究和旧设计不代表当前已实现功能。

## 按任务读取

- 剪藏、设置、抖音收藏或构建：按需查看 `docs/architecture.md`、`docs/wiki.md` 和根 `README.md`。
- 开发 MultiPost 平台发布、发布 API/Skill 或执行恢复流程前：必读 `docs/multipost-architecture.md` 和 `docs/agents/publishing-development.md`；涉及子项目时再读 `MultiPost-Extension/AGENTS.md`。完整接口与恢复协议查 `packages/publishing-api/README.md`。
- 使用发布 Skill 提交或接续任务：读取 `skills/qiushui-publishing/SKILL.md` 及其按情形指向的 references。平台实机验收与换电脑接续查 `docs/research/2026-10-10-publishing-handoff.md`。
- 处理 Issue、标签或领域术语：分别查 `docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md`、`docs/agents/domain.md` 和 `GLOSSARY.md`。完整文档导航见 `docs/README.md`。

## 发布操作边界

- 已授权范围内的开发和测试继续推进；部署和真实公开发布须有对应范围的明确授权。已在会话中授权的操作无需重复询问。
- 平台写操作由 API 参数触发扩展执行。浏览器工具用于只读观察和排障，不能以手动代操作作为 API 验收证据。
- 严格执行已确认内容和最终动作；不静默改写、截断或删减。测试优先保存草稿；保存失败不得自动改为发布。
- 中断后先核对原任务、原页面和旧执行停止状态。提交后结果不明时只读核对，不自动重新上传、填写或提交。
- 区分代码检查、构建与真实平台验收；草稿、已提交和已发布各需相应平台证据，不能互相替代。

## 修改与验证

- 只改与请求有关的代码和文档。接口或关键行为变化时，同次更新对应现行文档；仅长期规则或文档路由变化时修改本文件。历史证据保留时间与适用范围。
- 修改源文件后运行根目录 `pnpm build` 更新 Chrome 产物，并运行与变更相关的类型检查和测试。测试命令见根 `README.md`；发布 API 测试需要 Node 24.13+。子项目独立构建在 `MultiPost-Extension/` 执行。
