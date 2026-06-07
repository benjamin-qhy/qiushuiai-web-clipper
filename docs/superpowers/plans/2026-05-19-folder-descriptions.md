# Folder Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add a one-line description to each bookmark folder; include those descriptions in AI prompts so the model can classify bookmarks more accurately.

**Architecture:** New `folderDescriptions` storage module (browser.storage.local) → `buildFolderPaths()` in classify.ts gets an optional descriptions map and emits `"path — description"` lines → `processBookmark()` loads descriptions before calling `buildFolderPaths()` → App.vue shows a textarea at the bottom of the left pane when a folder is selected.

**Tech Stack:** Vue 3 + TypeScript, WXT (browser extension), `browser.storage.local`, Vitest + jsdom

---

## File Map

| File | Action |
|------|--------|
| `src/storage/folderDescriptions.ts` | **Create** — get/set folder descriptions in storage.local |
| `tests/storage/folderDescriptions.test.ts` | **Create** — unit tests for storage module |
| `src/bookmark/classify.ts` | **Modify** — add `descriptions` param to `buildFolderPaths`, load descriptions in `processBookmark` |
| `tests/bookmark/classify.test.ts` | **Modify** — add tests for descriptions in `buildFolderPaths` |
| `entrypoints/bookmarks/App.vue` | **Modify** — add `pane-desc` editor block at bottom of left pane |

---

## Task 1: Storage module for folder descriptions

**Files:**
- Create: `src/storage/folderDescriptions.ts`
- Create: `tests/storage/folderDescriptions.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `tests/storage/folderDescriptions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFolderDescriptions, setFolderDescription } from '../../src/storage/folderDescriptions'

const STORAGE_KEY = 'qiushui-folder-descriptions'

const { mockStorage, storageGet, storageSet } = vi.hoisted(() => {
  const mockStorage: Record<string, unknown> = {}
  return {
    mockStorage,
    storageGet: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
    storageSet: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(mockStorage, obj)
    }),
  }
})

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
      },
    },
  },
}))

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  storageGet.mockClear()
  storageSet.mockClear()
})

describe('getFolderDescriptions', () => {
  it('returns empty object when nothing stored', async () => {
    const result = await getFolderDescriptions()
    expect(result).toEqual({})
  })

  it('returns stored descriptions', async () => {
    mockStorage[STORAGE_KEY] = { 'folder-1': '前端工具和教程' }
    const result = await getFolderDescriptions()
    expect(result['folder-1']).toBe('前端工具和教程')
  })
})

describe('setFolderDescription', () => {
  it('stores a description for a folder id', async () => {
    await setFolderDescription('folder-1', '购物网站')
    const stored = mockStorage[STORAGE_KEY] as Record<string, string>
    expect(stored['folder-1']).toBe('购物网站')
  })

  it('merges with existing descriptions, does not overwrite other keys', async () => {
    mockStorage[STORAGE_KEY] = { 'folder-1': '已有说明' }
    await setFolderDescription('folder-2', '新说明')
    const stored = mockStorage[STORAGE_KEY] as Record<string, string>
    expect(stored['folder-1']).toBe('已有说明')
    expect(stored['folder-2']).toBe('新说明')
  })

  it('saves empty string (allows clearing a description)', async () => {
    mockStorage[STORAGE_KEY] = { 'folder-1': '原说明' }
    await setFolderDescription('folder-1', '')
    const stored = mockStorage[STORAGE_KEY] as Record<string, string>
    expect(stored['folder-1']).toBe('')
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
pnpm vitest run tests/storage/folderDescriptions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement the storage module**

Create `src/storage/folderDescriptions.ts`:

```ts
import { browser } from 'wxt/browser'

const STORAGE_KEY = 'qiushui-folder-descriptions'

export async function getFolderDescriptions(): Promise<Record<string, string>> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] ?? {}) as Record<string, string>
}

export async function setFolderDescription(folderId: string, desc: string): Promise<void> {
  const current = await getFolderDescriptions()
  await browser.storage.local.set({ [STORAGE_KEY]: { ...current, [folderId]: desc } })
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
pnpm vitest run tests/storage/folderDescriptions.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/storage/folderDescriptions.ts tests/storage/folderDescriptions.test.ts
git commit -m "feat: add folderDescriptions storage module"
```

---

## Task 2: Update `buildFolderPaths` to include descriptions

**Files:**
- Modify: `src/bookmark/classify.ts` (lines 8–17)
- Modify: `tests/bookmark/classify.test.ts`

`buildFolderPaths` currently has signature `(nodes, prefix?)`. We add an optional `descriptions` parameter. When a node's id has a non-empty description, append ` — <desc>` to its path line.

- [ ] **Step 2.1: Add failing tests**

In `tests/bookmark/classify.test.ts`, add after the existing `describe('buildFolderPaths', ...)` block:

```ts
describe('buildFolderPaths with descriptions', () => {
  it('appends description to path when provided', () => {
    // node id '3' is '书签栏/工作/前端'
    const paths = buildFolderPaths(tree, { '3': '前端框架和工具' })
    expect(paths).toContain('书签栏/工作/前端 — 前端框架和工具')
  })

  it('does not append when description is empty string', () => {
    const paths = buildFolderPaths(tree, { '3': '' })
    expect(paths).toContain('书签栏/工作/前端')
    expect(paths.some(p => p.includes(' — '))).toBe(false)
  })

  it('does not append when node id has no entry in descriptions', () => {
    const paths = buildFolderPaths(tree, {})
    expect(paths.some(p => p.includes(' — '))).toBe(false)
  })

  it('existing tests still pass without descriptions argument', () => {
    const paths = buildFolderPaths(tree)
    expect(paths).toContain('书签栏/工作/前端')
  })
})
```

- [ ] **Step 2.2: Run tests to verify new ones fail**

```bash
pnpm vitest run tests/bookmark/classify.test.ts
```

Expected: the 4 new `buildFolderPaths with descriptions` tests FAIL; existing tests still PASS.

- [ ] **Step 2.3: Update `buildFolderPaths` in classify.ts**

Replace the existing `buildFolderPaths` function (lines 8–17 in `src/bookmark/classify.ts`) with:

```ts
export function buildFolderPaths(
  nodes: BookmarkNode[],
  descriptions: Record<string, string> = {},
  prefix = '',
): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.url) continue
    const basePath = prefix ? `${prefix}/${node.title}` : node.title
    const desc = descriptions[node.id]
    paths.push(desc ? `${basePath} — ${desc}` : basePath)
    if (node.children?.length) paths.push(...buildFolderPaths(node.children, descriptions, basePath))
  }
  return paths
}
```

Note: `buildFolderPathMap` is unchanged — it still builds `path → id` without descriptions.

- [ ] **Step 2.4: Run all classify tests**

```bash
pnpm vitest run tests/bookmark/classify.test.ts
```

Expected: all tests PASS (existing + new).

- [ ] **Step 2.5: Commit**

```bash
git add src/bookmark/classify.ts tests/bookmark/classify.test.ts
git commit -m "feat: include folder descriptions in buildFolderPaths output"
```

---

## Task 3: Wire descriptions into `processBookmark`

**Files:**
- Modify: `src/bookmark/classify.ts` (the `processBookmark` function, around line 89)

`processBookmark` currently calls `buildFolderPaths(rootChildren)`. We load descriptions from storage and pass them in.

- [ ] **Step 3.1: Add import at top of classify.ts**

Add this import after the existing imports at the top of `src/bookmark/classify.ts`:

```ts
import { getFolderDescriptions } from '../storage/folderDescriptions'
```

- [ ] **Step 3.2: Update `processBookmark` to load and pass descriptions**

In `processBookmark()`, find these two lines (around line 99–100):

```ts
const folderPaths = buildFolderPaths(rootChildren)
const pathMap = buildFolderPathMap(rootChildren)
```

Replace with:

```ts
const descriptions = await getFolderDescriptions()
const folderPaths = buildFolderPaths(rootChildren, descriptions)
const pathMap = buildFolderPathMap(rootChildren)
```

- [ ] **Step 3.3: Type-check**

```bash
pnpm compile
```

Expected: no errors.

- [ ] **Step 3.4: Commit**

```bash
git add src/bookmark/classify.ts
git commit -m "feat: load folder descriptions when building AI prompt"
```

---

## Task 4: UI — folder description editor in left pane

**Files:**
- Modify: `entrypoints/bookmarks/App.vue`

When a folder is selected, show a `pane-desc` section at the bottom of `pane-left` containing a `<textarea>` for the description. Auto-saves on blur.

- [ ] **Step 4.1: Add script logic to App.vue**

In the `<script setup>` block of `entrypoints/bookmarks/App.vue`, add after the existing imports:

```ts
import { getFolderDescriptions, setFolderDescription } from '../../src/storage/folderDescriptions'
```

Then add after `const aiAvailable = ref(false)`:

```ts
const folderDescription = ref('')

async function loadDescription(folderId: string) {
  const descs = await getFolderDescriptions()
  folderDescription.value = descs[folderId] ?? ''
}

async function saveDescription() {
  if (!tree.selectedFolderId.value) return
  await setFolderDescription(tree.selectedFolderId.value, folderDescription.value)
}
```

Update `handleSelect` to also load the description:

```ts
async function handleSelect(folderId: string) {
  await tree.selectFolder(folderId).catch(setError)
  await loadDescription(folderId).catch(setError)
}
```

- [ ] **Step 4.2: Add `pane-desc` template block**

In the `<template>`, inside `<div class="pane-left">`, add this block **after** `<div class="pane-body">...</div>`:

```html
<div v-if="tree.selectedFolderId.value" class="pane-desc">
  <div class="pane-desc-label">文件夹说明</div>
  <textarea
    class="pane-desc-input"
    v-model="folderDescription"
    placeholder="描述这个文件夹放哪类网址，AI 整理时会参考"
    rows="3"
    @blur="saveDescription"
  />
</div>
```

- [ ] **Step 4.3: Add styles to `<style scoped>`**

Add at the end of the `<style scoped>` block in `App.vue`:

```css
.pane-desc {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  padding: 10px 12px;
  background: var(--color-surface);
}
.pane-desc-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 5px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.pane-desc-input {
  width: 100%;
  resize: none;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 5px 7px;
  outline: none;
  line-height: 1.5;
  box-sizing: border-box;
}
.pane-desc-input:focus {
  border-color: var(--color-accent);
}
```

- [ ] **Step 4.4: Build and verify**

```bash
pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 4.5: Manual smoke test**

Load the built extension in Chrome (`chrome://extensions` → Load unpacked → `.output/chrome-mv3`). Open the bookmarks manager, select a folder, type a description, click away (blur). Re-select the same folder — description should still be there. Select a different folder — textarea should show that folder's description (empty if none set).

- [ ] **Step 4.6: Commit**

```bash
git add entrypoints/bookmarks/App.vue
git commit -m "feat: add folder description editor to bookmark manager left pane"
```

---

## Task 5: Run all tests

- [ ] **Step 5.1: Run full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 5.2: Type-check**

```bash
pnpm compile
```

Expected: no errors.
