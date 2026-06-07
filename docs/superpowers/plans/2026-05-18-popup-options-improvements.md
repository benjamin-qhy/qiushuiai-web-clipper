# Popup & Options Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subDir editing and image-mode display to the popup footer, rename "更换 Vault 目录" to "另存为" (one-time save within vault), add copy-success feedback, add local image storage sub-options (`per-note` vs `shared`) to options, and add a save-success indicator to the options topbar.

**Architecture:** New settings fields (`imageLocalMode`, `imageLocalDir`) drive a new save path in `useFileSave`. The popup reads/writes `subDir` directly to storage on blur. "另存为" passes an `overrideDirHandle` to `save()` that bypasses the global subDir. Image path logic is extracted to a pure helper function so it can be unit-tested independently.

**Tech Stack:** WXT + Vue 3 + TypeScript, File System Access API, `browser.storage.local`, Vitest (jsdom)

---

## File Structure

| File | Change |
|------|--------|
| `src/filesystem/paths.ts` | **Create** — pure helper `computeSharedImagePath(subDir, imageLocalDir, filename)` |
| `src/storage/settings.ts` | **Modify** — add `imageLocalMode` and `imageLocalDir` fields |
| `src/filesystem/save.ts` | **Modify** — add `saveImageToSharedDir`, `saveToDir` |
| `src/composables/useFileSave.ts` | **Modify** — `save()` accepts `overrideDirHandle`; image functions respect `imageLocalMode` |
| `entrypoints/popup/App.vue` | **Modify** — info row (subDir input + image mode badge), rename dropdown item, copy feedback |
| `entrypoints/options/App.vue` | **Modify** — local image sub-options, topbar save status |
| `tests/filesystem/paths.test.ts` | **Create** — unit tests for the path helper |

---

## Task 1: Pure path helper + tests

**Files:**
- Create: `src/filesystem/paths.ts`
- Create: `tests/filesystem/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/filesystem/paths.test.ts
import { describe, expect, it } from 'vitest'
import { computeSharedImagePath } from '../../src/filesystem/paths'

describe('computeSharedImagePath', () => {
  it('returns plain dir/file when subDir is empty', () => {
    expect(computeSharedImagePath('', 'images', 'photo.jpg')).toBe('images/photo.jpg')
  })

  it('adds one ../ for single-level subDir', () => {
    expect(computeSharedImagePath('Clippings', 'images', 'photo.jpg')).toBe('../images/photo.jpg')
  })

  it('adds two ../ for two-level subDir', () => {
    expect(computeSharedImagePath('a/b', 'images', 'photo.jpg')).toBe('../../images/photo.jpg')
  })

  it('trims leading/trailing slashes from subDir', () => {
    expect(computeSharedImagePath('/Clippings/', 'images', 'photo.jpg')).toBe('../images/photo.jpg')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run tests/filesystem/paths.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the helper**

```typescript
// src/filesystem/paths.ts
export function computeSharedImagePath(
  subDir: string,
  imageLocalDir: string,
  filename: string,
): string {
  const depth = subDir.split('/').filter(Boolean).length
  const prefix = '../'.repeat(depth)
  return `${prefix}${imageLocalDir}/${filename}`
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run tests/filesystem/paths.test.ts
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/filesystem/paths.ts tests/filesystem/paths.test.ts
git commit -m "feat: add computeSharedImagePath helper"
```

---

## Task 2: New settings fields

**Files:**
- Modify: `src/storage/settings.ts`

- [ ] **Step 1: Add fields to the `Settings` interface**

In `src/storage/settings.ts`, replace:

```typescript
export interface Settings {
  subDir: string
  imageMode: 'local' | 'oss'
  ossProvider: 'aliyun'
  aliyunOSS: AliyunOSSConfig
  aiConfig: AIConfig
  bookmarkInboxFolder: string
  bookmarkSubDir: string
}
```

with:

```typescript
export interface Settings {
  subDir: string
  imageMode: 'local' | 'oss'
  imageLocalMode: 'per-note' | 'shared'
  imageLocalDir: string
  ossProvider: 'aliyun'
  aliyunOSS: AliyunOSSConfig
  aiConfig: AIConfig
  bookmarkInboxFolder: string
  bookmarkSubDir: string
}
```

- [ ] **Step 2: Add defaults**

In `src/storage/settings.ts`, replace:

```typescript
export const DEFAULT_SETTINGS: Settings = {
  subDir: 'Clippings',
  imageMode: 'local',
  ossProvider: 'aliyun',
```

with:

```typescript
export const DEFAULT_SETTINGS: Settings = {
  subDir: 'Clippings',
  imageMode: 'local',
  imageLocalMode: 'per-note',
  imageLocalDir: 'images',
  ossProvider: 'aliyun',
```

- [ ] **Step 3: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/storage/settings.ts
git commit -m "feat: add imageLocalMode and imageLocalDir settings"
```

---

## Task 3: Save filesystem helpers

**Files:**
- Modify: `src/filesystem/save.ts`

- [ ] **Step 1: Add `saveImageToSharedDir`**

Append to `src/filesystem/save.ts` (after `getDir`):

```typescript
export async function saveImageToSharedDir(
  vaultHandle: FileSystemDirectoryHandle,
  imageLocalDir: string,
  filename: string,
  base64: string,
): Promise<void> {
  const dir = imageLocalDir.trim() || 'images'
  const dirHandle = await getDir(vaultHandle, dir)
  const safeFilename = filename.replace(/^\.+/, '') || 'image.png'
  const fileHandle = await dirHandle.getFileHandle(safeFilename, { create: true })
  const writable = await fileHandle.createWritable()
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  await writable.write(bytes)
  await writable.close()
}
```

- [ ] **Step 2: Add `saveToDir`** (used by "另存为" to save directly into the chosen handle, bypassing subDir logic)

Append after `saveImageToSharedDir`:

```typescript
export async function saveToDir(
  dirHandle: FileSystemDirectoryHandle,
  title: string,
  content: string,
): Promise<string> {
  const existing = new Set<string>()
  for await (const name of dirHandle.keys()) {
    if (name.endsWith('.md')) existing.add(name.slice(0, -3))
  }
  const base = sanitizeFilename(title)
  const finalName = resolveFilename(base, existing)
  const filename = `${finalName}.md`
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true }).catch(e => {
    throw new Error(`无法创建文件 "${filename}": ${e}`)
  })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
  return filename
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/filesystem/save.ts
git commit -m "feat: add saveImageToSharedDir and saveToDir helpers"
```

---

## Task 4: Update `useFileSave` for `imageLocalMode` and `overrideDirHandle`

**Files:**
- Modify: `src/composables/useFileSave.ts`

- [ ] **Step 1: Update imports**

Replace the existing import line:

```typescript
import { saveToVault, saveImageToVault } from '../filesystem/save'
```

with:

```typescript
import { saveToVault, saveImageToVault, saveImageToSharedDir, saveToDir } from '../filesystem/save'
import { computeSharedImagePath } from '../filesystem/paths'
```

- [ ] **Step 2: Update `save()` signature and body**

Replace the entire `save` function:

```typescript
  async function save(
    vaultHandle: FileSystemDirectoryHandle,
    doc: DocContent,
    overrideDirHandle?: FileSystemDirectoryHandle,
  ) {
    isSaving.value = true
    error.value = null
    savedFilename.value = null

    try {
      const settings = await getSettings()
      const frontmatter = buildFrontmatter(doc)
      const effectiveSubDir = overrideDirHandle ? '' : settings.subDir
      let body: string

      if (doc.markdown !== undefined) {
        const uploader = createUploader(settings)
        const notename = sanitizeFilename(doc.title)
        body = await downloadAndReplaceMarkdownImages(
          doc.markdown,
          vaultHandle,
          effectiveSubDir,
          notename,
          uploader,
          doc.source,
          settings.imageLocalMode,
          settings.imageLocalDir,
        )
      } else {
        const uploader = createUploader(settings)
        const notename = sanitizeFilename(doc.title)
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
        const blocks =
          tab?.id != null
            ? await downloadAndReplaceImages(
                doc.blocks,
                tab.id,
                vaultHandle,
                effectiveSubDir,
                notename,
                uploader,
                settings.imageLocalMode,
                settings.imageLocalDir,
              )
            : doc.blocks
        body = blocksToMarkdown(blocks)
      }

      const content = `${frontmatter}\n${body}\n`
      const filename = overrideDirHandle
        ? await saveToDir(overrideDirHandle, doc.title, content)
        : await saveToVault(vaultHandle, settings.subDir, doc.title, content)
      savedFilename.value = filename
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isSaving.value = false
    }
  }
```

- [ ] **Step 3: Update `downloadAndReplaceImages` signature**

Replace:

```typescript
async function downloadAndReplaceImages(
  blocks: Block[],
  tabId: number,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
): Promise<Block[]> {
```

with:

```typescript
async function downloadAndReplaceImages(
  blocks: Block[],
  tabId: number,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
  imageLocalMode: 'per-note' | 'shared' = 'per-note',
  imageLocalDir: string = 'images',
): Promise<Block[]> {
```

- [ ] **Step 4: Update the local-save branch inside `downloadAndReplaceImages`**

Replace:

```typescript
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
        result.push({ ...block, src: `${notename}.assets/${filename}` })
      }
```

with:

```typescript
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        if (imageLocalMode === 'shared') {
          await saveImageToSharedDir(vaultHandle, imageLocalDir, filename, base64)
          result.push({ ...block, src: computeSharedImagePath(subDir, imageLocalDir, filename) })
        } else {
          await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
          result.push({ ...block, src: `${notename}.assets/${filename}` })
        }
      }
```

- [ ] **Step 5: Update `downloadAndReplaceMarkdownImages` signature**

Replace:

```typescript
async function downloadAndReplaceMarkdownImages(
  markdown: string,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
  referer?: string,
): Promise<string> {
```

with:

```typescript
async function downloadAndReplaceMarkdownImages(
  markdown: string,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
  referer?: string,
  imageLocalMode: 'per-note' | 'shared' = 'per-note',
  imageLocalDir: string = 'images',
): Promise<string> {
```

- [ ] **Step 6: Update the local-save branch inside `downloadAndReplaceMarkdownImages`**

Replace:

```typescript
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
        newUrl = `${notename}.assets/${filename}`
      }
```

with:

```typescript
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        if (imageLocalMode === 'shared') {
          await saveImageToSharedDir(vaultHandle, imageLocalDir, filename, base64)
          newUrl = computeSharedImagePath(subDir, imageLocalDir, filename)
        } else {
          await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
          newUrl = `${notename}.assets/${filename}`
        }
      }
```

- [ ] **Step 7: Type-check**

```bash
pnpm compile
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/composables/useFileSave.ts
git commit -m "feat: support imageLocalMode shared and overrideDirHandle in useFileSave"
```

---

## Task 5: Popup — info row (subDir input + image mode badge)

**Files:**
- Modify: `entrypoints/popup/App.vue`

- [ ] **Step 1: Add imports and refs in `<script setup>`**

Add `saveSettings` to the storage import:

```typescript
import { getSettings, saveSettings } from '../../src/storage/settings'
```

Add new refs after `ossIncomplete`:

```typescript
const subDir = ref('')
const imageMode = ref<'local' | 'oss'>('local')
```

- [ ] **Step 2: Load subDir and imageMode in `onMounted`**

Inside `onMounted`, after the existing `getSettings()` block, replace:

```typescript
  const settings = await getSettings()
  if (settings.imageMode === 'oss') {
    const cfg = settings.aliyunOSS
    ossIncomplete.value = !cfg.accessKeyId.trim() || !cfg.accessKeySecret.trim() || !cfg.bucket.trim()
  }
```

with:

```typescript
  const settings = await getSettings()
  subDir.value = settings.subDir
  imageMode.value = settings.imageMode
  if (settings.imageMode === 'oss') {
    const cfg = settings.aliyunOSS
    ossIncomplete.value = !cfg.accessKeyId.trim() || !cfg.accessKeySecret.trim() || !cfg.bucket.trim()
  }
```

- [ ] **Step 3: Add `handleSubDirBlur` function**

Add after `openBookmarks`:

```typescript
async function handleSubDirBlur() {
  const settings = await getSettings()
  await saveSettings({ ...settings, subDir: subDir.value })
}
```

- [ ] **Step 4: Add info row in template**

In `<template>`, inside the last `<template v-else>` (the save-row block), add the info row immediately before `<div class="save-row">`:

```html
          <div class="info-row">
            <span class="info-label">子目录</span>
            <input
              v-model="subDir"
              class="subdir-input"
              placeholder="Clippings"
              @blur="handleSubDirBlur"
            />
            <span class="image-mode-badge" @click="openSettings">
              图片: {{ imageMode === 'local' ? '本地' : '阿里云 OSS' }}
            </span>
          </div>
```

- [ ] **Step 5: Add CSS for the new elements**

Append to the `<style scoped>` block (before the closing `</style>`):

```css
.info-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.info-label {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.subdir-input {
  flex: 1;
  min-width: 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text);
  font-family: var(--font-ui);
  outline: none;
  padding: 2px 4px;
  background: transparent;
}
.subdir-input:focus { border-bottom-color: var(--color-accent); }
.image-mode-badge {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  padding: 2px 6px;
  border: 1px solid var(--color-border-light);
  border-radius: 2px;
}
.image-mode-badge:hover { color: var(--color-accent); border-color: var(--color-accent); }
```

- [ ] **Step 6: Build and verify**

```bash
pnpm build
```

Expected: build succeeds, no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add entrypoints/popup/App.vue
git commit -m "feat: add subDir input and image mode badge to popup footer"
```

---

## Task 6: Popup — "另存为" + copy success feedback

**Files:**
- Modify: `entrypoints/popup/App.vue`

- [ ] **Step 1: Add `copyDone` and `saveAsError` refs**

Add after the `showDropdown` ref declaration:

```typescript
const copyDone = ref(false)
const saveAsError = ref<string | null>(null)
```

- [ ] **Step 2: Update `handleCopy` to set success state without closing the dropdown**

Replace:

```typescript
async function handleCopy() {
  if (!doc.value) return
  await fileSave.copyToClipboard(mergedDoc())
  showDropdown.value = false
}
```

with:

```typescript
async function handleCopy() {
  if (!doc.value) return
  await fileSave.copyToClipboard(mergedDoc())
  copyDone.value = true
  setTimeout(() => { copyDone.value = false }, 2000)
}
```

- [ ] **Step 3: Add `handleSaveAs` function**

Add after `handleCopy`:

```typescript
async function handleSaveAs() {
  if (!vault.handle.value || !doc.value) return
  saveAsError.value = null
  try {
    const selected = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: vault.handle.value,
    })
    const relativeParts = await vault.handle.value.resolve(selected)
    if (relativeParts === null) {
      saveAsError.value = '请选择当前笔记库路径内的目录'
      return
    }
    await fileSave.save(vault.handle.value, mergedDoc(), selected)
    showDropdown.value = false
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    saveAsError.value = e instanceof Error ? e.message : String(e)
  }
}
```

- [ ] **Step 4: Update dropdown in template**

Replace:

```html
            <div v-if="showDropdown" class="dropdown">
              <button @click="handleCopy">复制 Markdown</button>
              <button @click="vault.changeVault()">更换 Vault 目录</button>
            </div>
```

with:

```html
            <div v-if="showDropdown" class="dropdown">
              <button @click="handleCopy">{{ copyDone ? '✓ 已复制' : '复制 Markdown' }}</button>
              <button @click="handleSaveAs">另存为</button>
            </div>
```

- [ ] **Step 5: Add saveAsError display**

After the existing `<p v-if="fileSave.error.value" ...>` line, add:

```html
        <p v-if="saveAsError" class="error-msg">{{ saveAsError }}</p>
```

- [ ] **Step 6: Build and verify**

```bash
pnpm build
```

Expected: build succeeds

- [ ] **Step 7: Commit**

```bash
git add entrypoints/popup/App.vue
git commit -m "feat: add copy feedback and 另存为 to popup dropdown"
```

---

## Task 7: Options — local image sub-options

**Files:**
- Modify: `entrypoints/options/App.vue`

- [ ] **Step 1: Add `sharedImagePathPreview` computed and `chooseImageLocalDir` function**

In `<script setup>`, add after the `ossPathPreview` computed:

```typescript
const sharedImagePathPreview = computed(() => {
  const dir = settings.value.imageLocalDir.trim() || 'images'
  return `${dir}/笔记标题-20260518143022583.png`
})
```

Add after the `chooseSubDir` function:

```typescript
async function chooseImageLocalDir() {
  dirPickerError.value = ''
  if (!vault.handle.value || !vault.isAuthorized.value) {
    dirPickerError.value = '请先完成笔记库授权后再选择目录'
    return
  }
  try {
    const selected = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: vault.handle.value,
    })
    const relativeParts = await vault.handle.value.resolve(selected)
    if (relativeParts === null) {
      dirPickerError.value = '请选择当前笔记库路径内的目录'
      return
    }
    settings.value.imageLocalDir = relativeParts.join('/')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    dirPickerError.value = error instanceof Error ? error.message : String(error)
  }
}
```

- [ ] **Step 2: Replace local-mode hint with sub-options block**

In the `<template>`, find the Images section. Replace:

```html
          <p class="field-hint">本地：图片保存到 .assets 子目录</p>
        </div>

        <template v-if="settings.imageMode === 'oss'">
```

with:

```html
        </div>

        <template v-if="settings.imageMode === 'local'">
          <div class="field">
            <label class="field-label">图片保存位置</label>
            <div class="mode-group">
              <button
                class="mode-btn"
                :class="{ active: settings.imageLocalMode === 'per-note' }"
                type="button"
                @click="settings.imageLocalMode = 'per-note'"
              >按笔记</button>
              <button
                class="mode-btn"
                :class="{ active: settings.imageLocalMode === 'shared' }"
                type="button"
                @click="settings.imageLocalMode = 'shared'"
              >统一目录</button>
            </div>
            <p v-if="settings.imageLocalMode === 'per-note'" class="field-hint">
              图片保存到 {笔记名}.assets/ 子目录
            </p>
            <template v-if="settings.imageLocalMode === 'shared'">
              <div class="input-action-row" style="margin-top: 8px">
                <input v-model="settings.imageLocalDir" class="field-input" placeholder="images" />
                <button class="btn-secondary" type="button" @click="chooseImageLocalDir">选择目录</button>
              </div>
              <p class="field-hint preview-path">{{ sharedImagePathPreview }}</p>
            </template>
          </div>
        </template>

        <template v-if="settings.imageMode === 'oss'">
```

- [ ] **Step 3: Build and verify**

```bash
pnpm build
```

Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/App.vue
git commit -m "feat: add local image sub-options (per-note / shared dir) to options"
```

---

## Task 8: Options — topbar save status

**Files:**
- Modify: `entrypoints/options/App.vue`

- [ ] **Step 1: Add save status indicators to the topbar**

In `<template>`, replace:

```html
      <div class="main-topbar">
        <div></div>
        <button class="btn-save" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? '保存中…' : '保存设置' }}
        </button>
      </div>
```

with:

```html
      <div class="main-topbar">
        <div></div>
        <span v-if="saveStatus === 'saved'" class="status-ok">✓ 已保存</span>
        <span v-else-if="saveStatus === 'error'" class="status-fail">保存失败</span>
        <button class="btn-save" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? '保存中…' : '保存设置' }}
        </button>
      </div>
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

Expected: build succeeds

- [ ] **Step 3: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass including the new paths tests

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/App.vue
git commit -m "feat: show save status in options topbar"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Popup subDir input, blur saves to storage | Task 5 |
| Popup image mode badge, click opens options | Task 5 |
| Dropdown "复制 Markdown" → shows ✓ 已复制 for 2s, menu stays open | Task 6 |
| Dropdown "更换 Vault 目录" → "另存为", picks dir within vault, one-time save | Task 6 |
| 另存为 validates dir is within vault | Task 6 |
| 另存为 does not change global vault/subDir | Task 6 (overrideDirHandle only used locally) |
| Settings: `imageLocalMode` + `imageLocalDir` fields | Task 2 |
| Options local sub-options: 按笔记 / 统一目录 | Task 7 |
| 统一目录: dir input + directory picker + preview path | Task 7 |
| Shared mode: save to `{imageLocalDir}/`, relative path in markdown | Task 4 |
| Options topbar save button shows ✓ 已保存 | Task 8 |
| `saveImageToSharedDir` function | Task 3 |
| `overrideDirHandle` in `save()` | Task 4 |

**Type consistency:** `imageLocalMode` declared as `'per-note' | 'shared'` in settings.ts and used consistently with that union type throughout. `computeSharedImagePath` takes three `string` params — matches all call sites.
