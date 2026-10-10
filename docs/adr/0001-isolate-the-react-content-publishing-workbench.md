# Isolate the React content publishing workbench

状态：历史决策，相关创作工作台与卡片模块已在提交 `62af94f` 中移除。当前发布架构见 [架构说明](../architecture.md)；此文保留原决策背景。

The existing extension remains WXT + Vue, while the content publishing workbench is delivered as an isolated React + shadcn feature package behind adapters for source content, AI completion, settings, draft storage, and image export. This avoids a whole-extension migration while making the workbench portable to other projects; Chrome is the first-class side-panel host, and Firefox may host the same package in a standalone extension page.
