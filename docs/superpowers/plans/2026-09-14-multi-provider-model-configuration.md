# Multi-provider Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unlimited multi-platform model configuration backed by Pi, with provider/model selection, a test prompt, optional reasoning, and last-successful-model defaulting.

**Architecture:** Persist platform credentials separately from the last-used provider/model selection. Keep the existing `AIProvider` boundary, route built-in providers through `@earendil-works/pi-ai`, and preserve a custom OpenAI-compatible path for legacy settings. Place the new UI in a focused Vue component mounted as its own settings section.

**Tech Stack:** WXT, Vue 3, TypeScript, Vitest, `@earendil-works/pi-ai`

---

### Task 1: Persist model platforms and migrate legacy settings

**Files:**
- Modify: `src/storage/settings.ts`
- Modify: `src/composables/useSettings.ts`
- Test: `tests/storage/settings.test.ts`

- [x] Write tests asserting that legacy `aiConfig` becomes one custom OpenAI-compatible platform, arbitrary platform counts are retained, and invalid last-used selections are cleared.
- [x] Run `pnpm exec vitest run tests/storage/settings.test.ts` and verify the new assertions fail because `aiPlatforms` does not exist.
- [x] Add `AIPlatformConfig`, `AIModelSelection`, defaults, migration, and nested snapshot cloning.
- [x] Re-run the storage tests and verify they pass.

### Task 2: Add the Pi model catalog and request adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/ai/catalog.ts`
- Create: `src/ai/pi.ts`
- Modify: `src/ai/index.ts`
- Modify: `src/ai/types.ts`
- Test: `tests/ai/catalog.test.ts`
- Test: `tests/ai/pi.test.ts`

- [x] Write failing tests for browser-supported provider filtering, provider-specific model listing, response text extraction, reasoning defaulting to off, and missing-model errors.
- [x] Run the two AI test files and verify failure due to missing catalog and adapter modules.
- [x] Add `@earendil-works/pi-ai@^0.85.1` and implement the catalog using `builtinModels()`.
- [x] Implement a Pi-backed `AIProvider`, keep the OpenAI-compatible adapter for migrated custom platforms, and expose selection resolution helpers.
- [x] Re-run the AI tests and verify they pass.

### Task 3: Add the standalone model settings UI

**Files:**
- Create: `entrypoints/options/components/ModelConfigSection.vue`
- Modify: `entrypoints/options/App.vue`
- Modify: `tests/ui/bookmark-feature-visibility.test.ts`
- Create: `tests/ui/model-configuration.test.ts`

- [x] Write failing source-level UI assertions for the visible “模型配置” navigation, unlimited add control, platform/model selectors, test prompt, and default-off reasoning selector.
- [x] Run the UI tests and verify the model configuration assertions fail.
- [x] Implement the model section component, mount it from the settings page, and move AI fields out of the hidden bookmark section.
- [x] Make a successful test prompt update `lastUsedAIModel` and persist settings; keep failures non-mutating.
- [x] Re-run the UI tests and verify they pass.

### Task 4: Route existing AI consumers through the last-used model

**Files:**
- Modify: `src/composables/useBookmarkProcess.ts`
- Modify: `src/composables/useBookmarkSearch.ts`
- Modify: `entrypoints/background.ts`
- Modify: `entrypoints/bookmarks/App.vue`
- Test: `tests/composables/useBookmarkSearch.test.ts`

- [x] Write failing tests proving the last valid selection is used and a missing selection falls back to the first configured platform/model.
- [x] Run the focused tests and verify they fail against the single `aiConfig` factory.
- [x] Replace direct `settings.aiConfig` usage with the shared selection resolver and factory.
- [x] Re-run focused tests and verify they pass.

### Task 5: Synchronize documentation and verify the extension

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [x] Document the new settings schema, Pi adapter, model UI, last-used semantics, and reasoning behavior identically in both files.
- [x] Run `cmp -s AGENTS.md CLAUDE.md` and `git diff --check`.
- [x] Run `pnpm exec vitest run`, `pnpm compile`, and `pnpm build` (the full suite retains one unrelated pre-existing `frontmatter` assertion failure; focused tests and compile pass).
- [x] Inspect the built Chrome MV3 output for the model settings route and Pi chunks, then review `git diff` for unrelated changes.

### Task 6: Merge the test platform and model selectors

**Files:**
- Modify: `entrypoints/options/components/ModelConfigSection.vue`
- Modify: `tests/ui/model-configuration.test.ts`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [x] Replace the source-level assertion for separate “选择平台” and “选择模型” controls with one assertion for a grouped “选择模型” control.
- [x] Run `pnpm exec vitest run tests/ui/model-configuration.test.ts` and verify it fails while both selectors remain.
- [x] Build one computed list of configured platforms and their model options, encode each option as a platform/model selection, and render it with native `<optgroup>` elements.
- [x] Derive the selected platform and model from the combined selection while preserving last-used persistence and reasoning-level behavior.
- [x] Re-run the UI test, `pnpm compile`, and `pnpm build`; verify `AGENTS.md` and `CLAUDE.md` remain identical.
