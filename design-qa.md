# 内容发布工作台卡片设计 QA

## 对照基准

- source design: `/Users/benjamin/.codex/generated_images/01a09e45-4a70-70c1-8d80-e611796e5e14/exec-8b0c0e87-4a17-4aae-9a48-9c08caa8de07.png`
- implementation: `/Users/benjamin/.codex/visualizations/2026/09/14/01a09e45-4a70-70c1-8d80-e611796e5e14/card-qa/implementation-1536x1093.jpg`
- combined comparison: `/Users/benjamin/.codex/visualizations/2026/09/14/01a09e45-4a70-70c1-8d80-e611796e5e14/card-qa/comparison-1536x1093.jpg`
- focused evidence: `/Users/benjamin/.codex/visualizations/2026/09/14/01a09e45-4a70-70c1-8d80-e611796e5e14/card-qa/output-pane-focused.jpg`

## 环境与状态

- browser: Codex in-app Chromium
- desktop viewport: 1536 × 1093 CSS px, DPR 2
- responsive checks: 900 × 900 and 600 × 900 CSS px
- card canvas: 1242 × 1656 px
- content: realistic Chinese Markdown with headings, emphasis, highlight and quote
- state: six themes available; minimal selected for baseline; cover off by default; one content page

## Visual decomposition

- Layer: warm neutral application canvas, compact header and layout controls.
- Pane: three bordered white work areas with source, compose and output hierarchy.
- Output: six compact theme swatches, cover/page status row, dominant portrait card, navigation and lightweight thumbnails.
- Card: warm paper, deep blue type, yellow semantic highlight, restrained footer and page number.

## Findings and iteration history

1. P1 fixed — the hidden 1242 × 1656 measurement canvas inherited the later `.xhs-card` positioning rule and occupied document flow, pushing the output controls below the first viewport. The selector now keeps the measurement canvas fixed and offscreen.
2. P1 fixed — separate CSS translate and inline scale centered against the unscaled width, clipping nearly the entire card. Translation and scale now share one transform with a top-center origin.
3. Passed — desktop hierarchy and density match the selected restrained editorial direction; the card remains the dominant object and all labels are legible.
4. Passed — 900 px uses the two-pane mode and 600 px uses the single-pane tabs without horizontal clipping.
5. Passed — switching theme preserves the one-page plan; enabling the cover changes the displayed total to two and next-page navigation reaches page two.
6. Passed — browser console contains no errors or warnings in the tested states.
7. P2 fixed in engineering review — a failed DOM measurement now exposes an explicit error and retry action instead of masquerading as empty content.

final result: passed
