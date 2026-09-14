# 系统提示词管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only settings UI for creating and editing titled system prompts with required title and content.

**Architecture:** `src/storage/settings.ts` owns the persisted `SystemPrompt[]` setting, and `useSettings` deep-copies it with the existing setting snapshots. A focused options component renders the prompt list and a single reusable create/edit form; `entrypoints/options/App.vue` places it immediately after model configuration.

**Tech Stack:** Vue 3 Composition API, TypeScript, WXT browser storage, Vitest.

---

### Task 1: Persist system prompts safely

**Files:**
- Modify: `src/storage/settings.ts:31-119`
- Modify: `src/composables/useSettings.ts:5-43`
- Modify: `tests/storage/settings.test.ts:34-104`

- [ ] **Step 1: Write the failing storage tests**

Add tests asserting default settings have no prompts, stored prompt entries survive `getSettings`, and `saveSettings` writes a title/content prompt:

```ts
it('defaults system prompts to an empty list', async () => {
  expect((await getSettings()).systemPrompts).toEqual([])
})

it('keeps stored system prompts', async () => {
  mockStorage['feishu-clipper-settings'] = {
    systemPrompts: [{ id: 'prompt-1', title: '摘要', content: '请总结内容。' }],
  }
  expect((await getSettings()).systemPrompts).toEqual([
    { id: 'prompt-1', title: '摘要', content: '请总结内容。' },
  ])
})
```

- [ ] **Step 2: Run the storage test to verify it fails**

Run: `pnpm exec vitest run tests/storage/settings.test.ts`

Expected: FAIL because `systemPrompts` is not part of `Settings` or defaults.

- [ ] **Step 3: Add the minimal persisted setting**

In `src/storage/settings.ts`, add:

```ts
export interface SystemPrompt {
  id: string
  title: string
  content: string
}
```

Add `systemPrompts: SystemPrompt[]` to `Settings`, `systemPrompts: []` to `DEFAULT_SETTINGS`, and return a copied array from `getSettings`:

```ts
systemPrompts: (stored.systemPrompts ?? []).map(prompt => ({ ...prompt })),
```

In `useSettings`, copy the default and snapshot arrays with `.map(prompt => ({ ...prompt }))`.

- [ ] **Step 4: Run the storage test to verify it passes**

Run: `pnpm exec vitest run tests/storage/settings.test.ts`

Expected: PASS.

### Task 2: Add a system-prompt management component

**Files:**
- Create: `entrypoints/options/components/SystemPromptSection.vue`
- Create: `tests/ui/system-prompt-management.test.ts`

- [ ] **Step 1: Write the failing UI source test**

Create a source-level test that reads the component and asserts it exposes the required labels and edit action:

```ts
expect(source).toContain('系统提示词管理')
expect(source).toContain('标题')
expect(source).toContain('提示词内容')
expect(source).toContain('新增提示词')
expect(source).toContain('编辑')
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `pnpm exec vitest run tests/ui/system-prompt-management.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the smallest create/edit-only component**

Create `SystemPromptSection.vue` with a required `v-model:prompts` of `SystemPrompt[]`, `formTitle`, `formContent`, `editingId`, and field-error refs. Render existing prompts as title plus content summary and an `编辑` button. Render a `+ 新增提示词` button and a shared form.

Use the following save guard so whitespace-only values are rejected and successful edits retain ID and position:

```ts
function savePrompt() {
  const title = formTitle.value.trim()
  const content = formContent.value.trim()
  titleError.value = title ? '' : '请输入标题'
  contentError.value = content ? '' : '请输入提示词内容'
  if (!title || !content) return

  const prompt = { id: editingId.value ?? crypto.randomUUID(), title, content }
  prompts.value = editingId.value
    ? prompts.value.map(item => item.id === editingId.value ? prompt : item)
    : [...prompts.value, prompt]
  cancelEdit()
}
```

Do not render a delete button or emit prompt data into model-related code.

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `pnpm exec vitest run tests/ui/system-prompt-management.test.ts`

Expected: PASS.

### Task 3: Mount the component and synchronize project documentation

**Files:**
- Modify: `entrypoints/options/App.vue:1-8,394-403`
- Modify: `CLAUDE.md:125-126,152`
- Modify: `AGENTS.md:125-126,152`
- Modify: `tests/ui/system-prompt-management.test.ts`

- [ ] **Step 1: Extend the failing UI test with placement assertions**

Read `entrypoints/options/App.vue` and assert the new component is imported and its mount index is after `<ModelConfigSection`:

```ts
expect(optionsSource).toContain("import SystemPromptSection")
expect(optionsSource.indexOf('<SystemPromptSection')).toBeGreaterThan(
  optionsSource.indexOf('<ModelConfigSection'),
)
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `pnpm exec vitest run tests/ui/system-prompt-management.test.ts`

Expected: FAIL because the settings page does not mount the prompt component.

- [ ] **Step 3: Mount and document the feature**

Import the component in `entrypoints/options/App.vue` and place it after `<ModelConfigSection>` with:

```vue
<SystemPromptSection v-model:prompts="settings.systemPrompts" />
```

Update `CLAUDE.md` to list `SystemPromptSection.vue`, explain that settings now persist local-only system-prompt records, then copy the full updated file over `AGENTS.md` so they remain identical.

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `pnpm exec vitest run tests/ui/system-prompt-management.test.ts`

Expected: PASS.

### Task 4: Verify the complete change

**Files:**
- Verify: `tests/storage/settings.test.ts`
- Verify: `tests/ui/system-prompt-management.test.ts`
- Verify: `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec vitest run tests/storage/settings.test.ts tests/ui/system-prompt-management.test.ts`

Expected: PASS.

- [ ] **Step 2: Run repository checks**

Run: `pnpm exec vitest run && pnpm compile && pnpm build && git diff --check && cmp -s CLAUDE.md AGENTS.md`

Expected: all new tests pass, type-check and build exit 0, diff check exits 0, and documentation files compare equal. If the known unrelated frontmatter test still fails, report it separately without changing its behavior.

- [ ] **Step 3: Review and commit the implementation**

Run: `git status --short && git diff --stat`

Stage only the feature files and commit with:

```bash
git add AGENTS.md CLAUDE.md entrypoints/options/App.vue entrypoints/options/components/SystemPromptSection.vue src/storage/settings.ts src/composables/useSettings.ts tests/storage/settings.test.ts tests/ui/system-prompt-management.test.ts docs/superpowers/plans/2026-09-14-system-prompt-management.md
git commit -m "feat: manage system prompts in settings"
```
