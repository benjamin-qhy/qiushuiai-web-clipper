# Content Publishing Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portable React + shadcn content publishing workbench that converts extracted Markdown into AI-authored, editable, paginated Xiaohongshu cards and saves PNG or ZIP files locally.

**Architecture:** Keep existing WXT + Vue entrypoints intact and add React through WXT's Vite plugin support. A workspace package owns UI, Markdown parsing, measured pagination, themes, and export behind host adapters; the extension owns Chrome/Firefox navigation, settings, AI providers, and browser storage.

**Tech Stack:** WXT, Vue 3 host, React, TypeScript, shadcn/ui, Tailwind CSS, unified/remark, react-resizable-panels, html-to-image, fflate, Vitest, Testing Library

---

## File Map

| Path | Responsibility |
|---|---|
| `pnpm-workspace.yaml` | Register reusable workspace packages |
| `packages/content-publishing-workbench/` | Portable React feature package |
| `packages/content-publishing-workbench/src/types.ts` | Public workbench domain and adapter contracts |
| `packages/content-publishing-workbench/src/markdown/` | Markdown parsing and inline mark handling |
| `packages/content-publishing-workbench/src/layout/` | Measured blocks and deterministic page planning |
| `packages/content-publishing-workbench/src/themes/` | Six card styles and shared card geometry |
| `packages/content-publishing-workbench/src/export/` | PNG and ZIP production |
| `packages/content-publishing-workbench/src/components/` | Three-pane shell, composer, preview, and shadcn components |
| `entrypoints/publisher-sidepanel/` | WXT React mount and browser adapters |
| `src/publisher/drafts.ts` | Browser-local source snapshot and draft persistence |
| `src/publisher/ai.ts` | Adapter over existing model catalog and AI providers |
| `entrypoints/popup/App.vue` | Create source snapshot and open the workbench |
| `entrypoints/background.ts` | Route Douyin and publisher side panels by tab |
| `src/storage/settings.ts` | Persist last successful reasoning level |
| `wxt.config.ts` | Enable React and Tailwind alongside Vue |
| `CLAUDE.md`, `AGENTS.md` | Keep architecture documentation identical |

## Per-Ticket Landing Contract

Every implementation ticket uses its own `codex/<ticket-number>-<slug>` branch and is not complete when the code merely works locally. After that ticket's focused tests, `pnpm compile`, required `pnpm build`, documentation synchronization, and `/code-review` pass, complete all of these steps before starting a dependent ticket:

1. Commit only the ticket's scoped changes with its issue number in the commit message.
2. Push the branch with `git push -u origin <branch>`.
3. Create a GitHub pull request that links the ticket with `Closes #<ticket-number>` and summarizes verification evidence.
4. Wait for required CI checks and resolve review findings on the same branch.
5. Merge the pull request using the repository's enabled merge strategy and request remote branch deletion.
6. Switch to `main`, run `git pull --ff-only`, and verify the merged change is present.
7. Verify the pull request reports `MERGED` before deleting anything locally.
8. Delete only the merged ticket branch locally with `git branch -d <branch>` and prune its deleted remote-tracking reference with `git fetch --prune`.
9. Verify `git status --short --branch` is clean and `git branch --list <branch>` returns no branch before closing the ticket.

Never delete an unmerged branch, another ticket's branch, the default branch, or a branch with work not contained in the merged pull request. If Git refuses `git branch -d`, stop and inspect the PR merge state and branch commits instead of forcing deletion.

## Task 1: Add the isolated React package and mixed-framework build

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/content-publishing-workbench/package.json`
- Create: `packages/content-publishing-workbench/tsconfig.json`
- Create: `packages/content-publishing-workbench/components.json`
- Create: `packages/content-publishing-workbench/src/index.ts`
- Create: `packages/content-publishing-workbench/src/styles.css`
- Modify: `package.json`
- Modify: `wxt.config.ts`

- [ ] **Step 1: Write the build smoke test**

Create `tests/publisher/react-entrypoint.test.ts` and assert that `wxt.config.ts` registers `@vitejs/plugin-react`, the Vue module remains present, and `publisher-sidepanel/main.tsx` imports the package rather than internal package files.

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('publisher React entrypoint', () => {
  it('keeps Vue and enables an isolated React entrypoint', () => {
    const config = readFileSync('wxt.config.ts', 'utf8')
    expect(config).toContain("modules: ['@wxt-dev/module-vue']")
    expect(config).toContain("from '@vitejs/plugin-react'")
  })
})
```

- [ ] **Step 2: Run the smoke test and verify it fails**

Run: `pnpm vitest run tests/publisher/react-entrypoint.test.ts`

Expected: FAIL because the React Vite plugin is not configured.

- [ ] **Step 3: Create the package and build wiring**

Use a workspace package named `@qiushui/content-publishing-workbench` with `react` and `react-dom` as peer dependencies. Add root runtime dependencies for React, Markdown, resizing, export and ZIP; add React types, Testing Library, React Vite and Tailwind Vite plugins as development dependencies.

Configure WXT without replacing Vue:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({ plugins: [react(), tailwindcss()] }),
  // Preserve the existing manifest verbatim.
})
```

Initialize shadcn inside the package, then add only the selected primitives:

```bash
cd packages/content-publishing-workbench
pnpm dlx shadcn@latest add button select tabs textarea switch tooltip alert-dialog
```

- [ ] **Step 4: Verify mixed Vue and React compilation**

Run: `pnpm install && pnpm vitest run tests/publisher/react-entrypoint.test.ts && pnpm compile && pnpm build`

Expected: the smoke test, Vue type check, and Chrome build pass; existing Vue entrypoints remain in `.output/chrome-mv3/`.

- [ ] **Step 5: Commit the package foundation**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml wxt.config.ts packages/content-publishing-workbench tests/publisher/react-entrypoint.test.ts
git commit -m "feat: add React publishing workbench package"
```

## Task 2: Define the portable domain and adapter contracts

**Files:**
- Create: `packages/content-publishing-workbench/src/types.ts`
- Create: `packages/content-publishing-workbench/src/contracts.test.ts`
- Modify: `packages/content-publishing-workbench/src/index.ts`

- [ ] **Step 1: Write type-level fixtures for snapshot, draft, and adapters**

The public surface must be independent of WXT and Chrome:

```ts
export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type CardThemeId = 'basic' | 'tech' | 'minimal' | 'border' | 'journal' | 'soft'

export interface SourceSnapshot {
  id: string
  extractedAt: string
  markdown: string
  meta: { title: string; source: string; author?: string; published?: string; tags?: string[] }
}

export interface WorkbenchDraft {
  snapshot: SourceSnapshot
  draftMarkdown: string
  instruction: { mode: 'template' | 'manual'; templateId: string; manualContent: string }
  model: { platformId: string; modelId: string; reasoning: ReasoningLevel }
  themeId: CardThemeId
  coverEnabled: boolean
  currentPage: number
}

export interface WorkbenchAdapters {
  loadDraft(id: string): Promise<WorkbenchDraft>
  saveDraft(draft: WorkbenchDraft): Promise<void>
  listModels(): Promise<ModelChoice[]>
  listTemplates(): Promise<PromptTemplate[]>
  generate(input: GenerateInput): Promise<string>
  rememberModel(selection: WorkbenchDraft['model']): Promise<void>
  download(fileName: string, blob: Blob): Promise<void>
  openSettings(): Promise<void>
}
```

- [ ] **Step 2: Assert defaults and exhaustive theme IDs**

Test that `createDraft(snapshot)` starts with empty Markdown, no cover, `minimal` theme, page zero, template mode, and the host-provided last model selection.

- [ ] **Step 3: Implement and export the minimal contracts**

Implement `createDraft`, `resolveReasoningLevel`, and public exports. `resolveReasoningLevel` returns `off` when a stored level is unsupported by the selected model.

- [ ] **Step 4: Run package tests**

Run: `pnpm vitest run packages/content-publishing-workbench/src/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/content-publishing-workbench/src
git commit -m "feat: define publishing workbench contracts"
```

## Task 3: Persist source snapshots, drafts, and last reasoning

**Files:**
- Create: `src/publisher/drafts.ts`
- Create: `tests/publisher/drafts.test.ts`
- Modify: `src/storage/settings.ts`
- Modify: `src/composables/useSettings.ts`
- Modify: `tests/storage/settings.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Cover deterministic keying by draft ID, cloning on read/write, resetting only creative fields, default `lastUsedAIReasoning: 'off'`, and migration from settings without the field.

```ts
expect(DEFAULT_SETTINGS.lastUsedAIReasoning).toBe('off')
await savePublisherDraft(draft)
expect(await getPublisherDraft(draft.snapshot.id)).toEqual(draft)
expect(resetPublisherDraft(draft).snapshot).toEqual(draft.snapshot)
expect(resetPublisherDraft(draft).draftMarkdown).toBe('')
```

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm vitest run tests/publisher/drafts.test.ts tests/storage/settings.test.ts`

Expected: FAIL because publisher storage and the reasoning field do not exist.

- [ ] **Step 3: Implement bounded browser storage**

Use keys `publisher-draft:{id}`, `publisher-latest:{sourceUrl}`, and `publisher-active-tab:{tabId}`. Store layout preferences separately as `publisher-layout`; do not put image Blob data into `Settings`.

- [ ] **Step 4: Implement settings migration**

Add `lastUsedAIReasoning: AIReasoningLevel` to `Settings`, default it to `off`, clone it in `useSettings`, and clamp it against the selected model before use.

- [ ] **Step 5: Run focused and full storage tests**

Run: `pnpm vitest run tests/publisher/drafts.test.ts tests/storage/settings.test.ts tests/ai/catalog.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/publisher/drafts.ts src/storage/settings.ts src/composables/useSettings.ts tests/publisher/drafts.test.ts tests/storage/settings.test.ts
git commit -m "feat: persist publishing drafts and model reasoning"
```

## Task 4: Open the correct workbench host from the popup

**Files:**
- Create: `entrypoints/publisher-sidepanel/index.html`
- Create: `entrypoints/publisher-sidepanel/main.tsx`
- Create: `entrypoints/publisher-sidepanel/style.css`
- Create: `src/publisher/source.ts`
- Create: `tests/publisher/source.test.ts`
- Modify: `entrypoints/popup/App.vue`
- Modify: `entrypoints/background.ts`
- Modify: `tests/entrypoints/popup/app-template.test.ts`

- [ ] **Step 1: Write failing source and routing tests**

Test that block documents use `blocksToMarkdown`, general pages preserve `doc.markdown`, metadata stays separate, Douyin routes to `douyin-sidepanel.html`, and normal pages route to `publisher-sidepanel.html` without changing the popup action.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run tests/publisher/source.test.ts tests/entrypoints/popup/app-template.test.ts`

Expected: FAIL because no publisher button or source snapshot builder exists.

- [ ] **Step 3: Build and persist the source snapshot**

Implement `createSourceSnapshot(doc, editedMeta)` using `crypto.randomUUID()` and `new Date().toISOString()`. Do not include YAML frontmatter and do not download source images during this step.

- [ ] **Step 4: Add the popup button and browser-specific opening**

The click handler creates the draft ID, starts `savePublisherDraft` without awaiting it, and calls `sidePanel.open({ tabId })` directly in the same user gesture on Chrome. The side panel reads `publisher-active-tab:{tabId}` and listens for the storage change when persistence has not completed yet. When `sidePanel` is unavailable, await persistence and open `publisher-sidepanel.html?draftId=...` in a new tab. Surface failures in the popup rather than silently closing it.

- [ ] **Step 5: Preserve the Douyin side panel**

Refactor `syncTabAction` so Douyin tabs retain their current path and action-click behavior; normal tabs keep `popup.html` and receive an enabled publisher path for explicit button opening.

- [ ] **Step 6: Verify both browser builds**

Run: `pnpm vitest run tests/publisher/source.test.ts tests/entrypoints/popup/app-template.test.ts && pnpm build && pnpm build:firefox`

Expected: both builds pass and emit `publisher-sidepanel.html`; Chrome retains the `sidePanel` permission.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/publisher-sidepanel entrypoints/popup/App.vue entrypoints/background.ts src/publisher/source.ts tests/publisher/source.test.ts tests/entrypoints/popup/app-template.test.ts
git commit -m "feat: open publishing workbench from extracted content"
```

## Task 5: Build the selected three-pane workbench shell

**Files:**
- Create: `packages/content-publishing-workbench/src/ContentPublishingWorkbench.tsx`
- Create: `packages/content-publishing-workbench/src/components/WorkbenchHeader.tsx`
- Create: `packages/content-publishing-workbench/src/components/SourcePane.tsx`
- Create: `packages/content-publishing-workbench/src/components/ComposerPane.tsx`
- Create: `packages/content-publishing-workbench/src/components/OutputPane.tsx`
- Create: `packages/content-publishing-workbench/src/components/ResponsiveWorkspace.tsx`
- Create: `packages/content-publishing-workbench/src/components/workbench.test.tsx`

- [ ] **Step 1: Write interaction tests**

Render with fake adapters and verify default 30/35/35 panels, hide/restore controls, at least one visible pane, reset layout, narrow-width tabs, and persisted layout callbacks.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run packages/content-publishing-workbench/src/components/workbench.test.tsx`

Expected: FAIL because the shell does not exist.

- [ ] **Step 3: Implement the selected “克制编辑台” shell**

Use `react-resizable-panels` only at wide and medium breakpoints. Under the narrow breakpoint, mount a shadcn `Tabs` control so hidden panes are not squeezed into unreadable columns. Use the existing product tokens and keep `#f97316` limited to primary actions and selection.

- [ ] **Step 4: Run interaction and accessibility tests**

Run: `pnpm vitest run packages/content-publishing-workbench/src/components/workbench.test.tsx`

Expected: PASS; controls have accessible names and keyboard focus.

- [ ] **Step 5: Commit**

```bash
git add packages/content-publishing-workbench/src/components packages/content-publishing-workbench/src/ContentPublishingWorkbench.tsx
git commit -m "feat: build responsive publishing workbench shell"
```

## Task 6: Connect model, reasoning, template, and manual instructions

**Files:**
- Create: `src/publisher/ai.ts`
- Create: `tests/publisher/ai.test.ts`
- Create: `packages/content-publishing-workbench/src/components/GenerationControls.tsx`
- Create: `packages/content-publishing-workbench/src/components/generation.test.tsx`

- [ ] **Step 1: Write failing generation tests**

Cover all configured models, capability-filtered reasoning, last selection defaults, template/manual modes, disabled generation, fixed format contract composition, loading, upstream error text, overwrite confirmation, and successful preference persistence.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run tests/publisher/ai.test.ts packages/content-publishing-workbench/src/components/generation.test.tsx`

Expected: FAIL because the host adapter and controls do not exist.

- [ ] **Step 3: Implement the host adapter**

Use `getModelOptions`, `createAIProvider`, `getSettings`, and `saveSettings`. Compose the selected or manual system prompt with a constant `CARD_MARKDOWN_OUTPUT_CONTRACT`; request text mode and update last model/reasoning only after a successful completion.

- [ ] **Step 4: Implement generation controls**

Do not persist manual text to `systemPrompts`. When a non-empty draft exists, use shadcn `AlertDialog` before replacing it.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run tests/publisher/ai.test.ts packages/content-publishing-workbench/src/components/generation.test.tsx tests/ai`

```bash
git add src/publisher/ai.ts tests/publisher/ai.test.ts packages/content-publishing-workbench/src/components
git commit -m "feat: generate editable card Markdown with configured AI"
```

## Task 7: Parse card Markdown and explicit semantic marks

**Files:**
- Create: `packages/content-publishing-workbench/src/markdown/parse.ts`
- Create: `packages/content-publishing-workbench/src/markdown/inlineMarks.ts`
- Create: `packages/content-publishing-workbench/src/markdown/parse.test.ts`
- Create: `packages/content-publishing-workbench/src/components/MarkdownEditor.tsx`

- [ ] **Step 1: Write parser tests**

Cover headings, paragraphs, lists, quotes, tables, code, `**bold**`, `==mark==`, `---` as a divider, `<!-- pagebreak -->` as a page break, and page-break text inside fenced code remaining literal.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run packages/content-publishing-workbench/src/markdown/parse.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement semantic parsing**

Use unified + remark-parse + remark-gfm. Convert the dedicated HTML comment into a `pageBreak` block before rendering; split `==...==` only inside ordinary text nodes so code spans and code blocks remain untouched.

- [ ] **Step 4: Implement edit/preview modes**

Use a controlled shadcn `Textarea` in edit mode and the parsed renderer in preview mode. Debounce draft persistence, not editor state updates.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run packages/content-publishing-workbench/src/markdown/parse.test.ts`

```bash
git add packages/content-publishing-workbench/src/markdown packages/content-publishing-workbench/src/components/MarkdownEditor.tsx
git commit -m "feat: parse card Markdown and semantic highlights"
```

## Task 8: Create a measured, deterministic page plan

**Files:**
- Create: `packages/content-publishing-workbench/src/layout/types.ts`
- Create: `packages/content-publishing-workbench/src/layout/planPages.ts`
- Create: `packages/content-publishing-workbench/src/layout/MeasureStage.tsx`
- Create: `packages/content-publishing-workbench/src/layout/planPages.test.ts`

- [ ] **Step 1: Write pagination tests**

Use a deterministic fake measurer to test block packing, forced breaks, heading keep-with-next, exact-fit blocks, oversized paragraph splitting, preservation of inline marks, empty input, and unlimited page counts.

```ts
const pages = await planPages(blocks, {
  contentHeight: 100,
  measure: async block => fakeHeights[block.id],
  splitText: async block => splitByMeasuredGrapheme(block, 100),
})
expect(pages.flatMap(page => page.blocks).map(block => block.id)).toEqual(expectedOrder)
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run packages/content-publishing-workbench/src/layout/planPages.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement pure page planning**

Keep DOM access out of `planPages`. Make measurement an injected asynchronous function; use grapheme-safe binary search only when one block exceeds a blank page.

- [ ] **Step 4: Implement the hidden measurement stage**

Render one block at the fixed 1242×1656 geometry with the active theme CSS, wait for `document.fonts.ready`, then return `getBoundingClientRect().height`. Cache by block content, theme, and geometry.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run packages/content-publishing-workbench/src/layout/planPages.test.ts`

```bash
git add packages/content-publishing-workbench/src/layout
git commit -m "feat: paginate cards from measured content"
```

## Task 9: Implement the six selected card styles and virtual preview

**Files:**
- Create: `packages/content-publishing-workbench/src/themes/index.ts`
- Create: `packages/content-publishing-workbench/src/themes/card.css`
- Create: `packages/content-publishing-workbench/src/themes/basic.css`
- Create: `packages/content-publishing-workbench/src/themes/tech.css`
- Create: `packages/content-publishing-workbench/src/themes/minimal.css`
- Create: `packages/content-publishing-workbench/src/themes/border.css`
- Create: `packages/content-publishing-workbench/src/themes/journal.css`
- Create: `packages/content-publishing-workbench/src/themes/soft.css`
- Create: `packages/content-publishing-workbench/src/components/CardPreview.tsx`
- Create: `packages/content-publishing-workbench/src/components/ThemePicker.tsx`
- Create: `packages/content-publishing-workbench/src/themes/themes.test.tsx`

- [ ] **Step 1: Write theme invariance tests**

Assert exactly six IDs and labels, fixed output dimensions, visible page numbers, highlight hooks, optional cover behavior, and identical page block IDs across every theme.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run packages/content-publishing-workbench/src/themes/themes.test.tsx`

Expected: FAIL because themes do not exist.

- [ ] **Step 3: Implement shared geometry and six CSS themes**

Implement only the approved styles: 基础, 科技, 简约, 边框, 手帐, 柔和. Use CSS backgrounds and typography; do not add runtime AI images, source images, user color controls, watermarks, or additional styles.

- [ ] **Step 4: Implement virtual preview**

Render current page and its immediate neighbors. Use CSS transform scaling for preview while preserving an unscaled off-screen export node.

- [ ] **Step 5: Visually compare against the selected first design**

At a 1440×1024 viewport, capture the implemented workbench and compare it side-by-side with `/Users/benjamin/.codex/generated_images/01a09e45-4a70-70c1-8d80-e611796e5e14/exec-8b0c0e87-4a17-4aae-9a48-9c08caa8de07.png`. Correct visible hierarchy, spacing, typography, border and card-ratio differences before proceeding.

- [ ] **Step 6: Commit**

```bash
git add packages/content-publishing-workbench/src/themes packages/content-publishing-workbench/src/components/CardPreview.tsx packages/content-publishing-workbench/src/components/ThemePicker.tsx
git commit -m "feat: add six Xiaohongshu card styles"
```

## Task 10: Export current PNG and sequential ZIP

**Files:**
- Create: `packages/content-publishing-workbench/src/export/renderPng.ts`
- Create: `packages/content-publishing-workbench/src/export/exportAll.ts`
- Create: `packages/content-publishing-workbench/src/export/export.test.ts`
- Modify: `packages/content-publishing-workbench/src/components/OutputPane.tsx`

- [ ] **Step 1: Write failing export tests**

Mock `html-to-image` and verify 1242×1656 dimensions, safe two-digit filenames, PNG signature validation, page order, sequential calls, ZIP naming, font readiness, overflow rejection, and the over-20-page warning.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run packages/content-publishing-workbench/src/export/export.test.ts`

Expected: FAIL because export functions do not exist.

- [ ] **Step 3: Implement single-page export**

Wait for fonts and decoded images, reject a vertically overflowing export node, call `toPng`, convert the data URL to a Blob, and validate MIME type plus the eight-byte PNG signature.

- [ ] **Step 4: Implement sequential ZIP export**

Use a `for...of` loop rather than `Promise.all`, add each validated PNG to `fflate`, then pass the ZIP Blob to the host download adapter.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run packages/content-publishing-workbench/src/export/export.test.ts`

```bash
git add packages/content-publishing-workbench/src/export packages/content-publishing-workbench/src/components/OutputPane.tsx
git commit -m "feat: export card pages as PNG and ZIP"
```

## Task 11: Complete end-to-end verification and documentation

**Files:**
- Create: `tests/publisher/workbench-flow.test.tsx`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the full journey test**

Cover: extracted document → source snapshot → workbench open → choose model and reasoning → choose template or manual instruction → generate → edit Markdown → switch among six themes → enable/disable cover → save current PNG → save ZIP → reload draft.

- [ ] **Step 2: Run all automated verification**

```bash
pnpm vitest run
pnpm compile
pnpm build
pnpm build:firefox
git diff --check
```

Expected: all tests and builds pass with no whitespace errors.

- [ ] **Step 3: Run Chrome manual acceptance**

Load `.output/chrome-mv3/`, extract one Feishu or general webpage, open the workbench from the popup, verify the side panel route, drag and hide panes, generate with a configured model, edit highlights and page breaks, inspect all six themes, export one PNG and a multi-page ZIP, and confirm each image is 1242×1656 with no clipping.

- [ ] **Step 4: Verify the Douyin regression path**

Open a Douyin favorites page and confirm the extension icon still opens `douyin-sidepanel.html`; navigate back to a normal page and confirm the popup and publisher workbench still open correctly.

- [ ] **Step 5: Synchronize architecture documentation**

Add the publisher entrypoint, React package, draft storage, AI adapter, pagination, themes and export modules to `CLAUDE.md`, then copy the complete resulting content to `AGENTS.md` and verify `cmp -s AGENTS.md CLAUDE.md` returns zero.

- [ ] **Step 6: Commit the verified feature**

```bash
git add tests/publisher CLAUDE.md AGENTS.md
git commit -m "test: verify content publishing workbench flow"
```
