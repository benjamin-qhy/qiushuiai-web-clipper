# Use measured DOM for card pagination and export

状态：历史决策，相关创作工作台与卡片模块已在提交 `62af94f` 中移除。当前发布架构见 [架构说明](../architecture.md)；此文保留原决策背景。

Card output is parsed into semantic blocks, measured off-screen with the same fonts and CSS used by the visible card, and converted into a reusable page plan that drives both preview and PNG export. This was chosen over character-count splitting, which cannot account for real typography, and a pure Canvas renderer, which would duplicate browser text layout and make six portable CSS-driven styles substantially harder to maintain; explicit `<!-- pagebreak -->` markers override automatic pagination and `==text==` carries semantic highlighting.
