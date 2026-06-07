# Settings Page & OSS Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Options page to configure Vault directory, default subdirectory, and image handling (local or Aliyun OSS), so the popup becomes a one-click save experience.

**Architecture:** A new `entrypoints/options/` page reads/writes settings via `chrome.storage.local`; a `src/uploader/` module provides an `ImageUploader` abstraction with `AliyunOSSUploader` as the first implementation; `useFileSave` branches on `imageMode` to decide local vs cloud save; the popup is simplified to three states (ready / needs-vault / needs-reauth).

**Tech Stack:** WXT + Vue 3 Composition API, TypeScript, Web Crypto API (SubtleCrypto for HMAC-SHA1), chrome.storage.local, IndexedDB (vault handle, already implemented)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/storage/settings.ts` | Create | Settings type, get/save via chrome.storage.local |
| `src/composables/useSettings.ts` | Create | Vue composable wrapping settings |
| `src/uploader/types.ts` | Create | `ImageUploader` interface, `UploadParams` |
| `src/uploader/index.ts` | Create | Factory: `createUploader(settings)` |
| `src/uploader/aliyun.ts` | Create | `AliyunOSSUploader` with HMAC-SHA1 signing |
| `entrypoints/options/index.html` | Create | Options page HTML shell |
| `entrypoints/options/main.ts` | Create | Mount Vue app |
| `entrypoints/options/App.vue` | Create | Settings UI (three sections) |
| `src/composables/useFileSave.ts` | Modify | Read settings internally, branch local vs OSS |
| `entrypoints/popup/App.vue` | Modify | Remove subDir input, add gear icon, three states |
| `wxt.config.ts` | Modify | Add `https://*.aliyuncs.com/*` to host_permissions |
| `tests/storage/settings.test.ts` | Create | Settings storage unit tests |
| `tests/uploader/aliyun.test.ts` | Create | OSS signing and path unit tests |

---

## Task 1: Settings Storage Module

**Files:**
- Create: `src/storage/settings.ts`
- Create: `tests/storage/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/storage/settings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/storage/settings'

const mockStorage: Record<string, unknown> = {}

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(mockStorage, obj)
        }),
      },
    },
  })
})

describe('getSettings', () => {
  it('returns defaults when nothing stored', async () => {
    const s = await getSettings()
    expect(s.subDir).toBe('Clippings')
    expect(s.imageMode).toBe('local')
    expect(s.ossProvider).toBe('aliyun')
  })

  it('merges stored values over defaults', async () => {
    mockStorage['feishu-clipper-settings'] = { subDir: 'Notes', imageMode: 'oss' }
    const s = await getSettings()
    expect(s.subDir).toBe('Notes')
    expect(s.imageMode).toBe('oss')
    expect(s.aliyunOSS.region).toBe('oss-cn-hangzhou') // default still present
  })
})

describe('saveSettings', () => {
  it('persists settings to chrome.storage.local', async () => {
    const settings = { ...DEFAULT_SETTINGS, subDir: 'Archive' }
    await saveSettings(settings)
    const stored = mockStorage['feishu-clipper-settings'] as typeof settings
    expect(stored.subDir).toBe('Archive')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run tests/storage/settings.test.ts
```

Expected: FAIL — `getSettings` not found

- [ ] **Step 3: Create `src/storage/settings.ts`**

```typescript
export interface AliyunOSSConfig {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
  prefix: string
}

export interface Settings {
  subDir: string
  imageMode: 'local' | 'oss'
  ossProvider: 'aliyun'
  aliyunOSS: AliyunOSSConfig
}

const STORAGE_KEY = 'feishu-clipper-settings'

export const DEFAULT_SETTINGS: Settings = {
  subDir: 'Clippings',
  imageMode: 'local',
  ossProvider: 'aliyun',
  aliyunOSS: {
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: 'oss-cn-hangzhou',
    prefix: '',
  },
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = (result[STORAGE_KEY] ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS, ...stored.aliyunOSS },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run tests/storage/settings.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/settings.ts tests/storage/settings.test.ts
git commit -m "feat: add settings storage module"
```

---

## Task 2: useSettings Composable

**Files:**
- Create: `src/composables/useSettings.ts`

- [ ] **Step 1: Create `src/composables/useSettings.ts`**

```typescript
import { ref } from 'vue'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../storage/settings'
import type { Settings } from '../storage/settings'

export function useSettings() {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS, aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS } })
  const isSaving = ref(false)
  const saveStatus = ref<'idle' | 'saved' | 'error'>('idle')

  async function load() {
    settings.value = await getSettings()
  }

  async function save() {
    isSaving.value = true
    try {
      await saveSettings(settings.value)
      saveStatus.value = 'saved'
      setTimeout(() => { saveStatus.value = 'idle' }, 2000)
    } catch {
      saveStatus.value = 'error'
    } finally {
      isSaving.value = false
    }
  }

  return { settings, isSaving, saveStatus, load, save }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useSettings.ts
git commit -m "feat: add useSettings composable"
```

---

## Task 3: Uploader Abstraction (Types + Factory)

**Files:**
- Create: `src/uploader/types.ts`
- Create: `src/uploader/index.ts`

- [ ] **Step 1: Create `src/uploader/types.ts`**

```typescript
export interface UploadParams {
  base64: string
  mimeType: string
  notename: string  // sanitized note title, used in filename
  source: string    // 'feishu', 'dedao', etc. — used in OSS path
}

export interface ImageUploader {
  upload(params: UploadParams): Promise<string>  // returns public URL
}
```

- [ ] **Step 2: Create `src/uploader/index.ts`**

```typescript
import type { Settings } from '../storage/settings'
import type { ImageUploader } from './types'
import { AliyunOSSUploader } from './aliyun'

export function createUploader(settings: Settings): ImageUploader | null {
  if (settings.imageMode !== 'oss') return null
  if (settings.ossProvider === 'aliyun') return new AliyunOSSUploader(settings.aliyunOSS)
  return null
}
```

- [ ] **Step 3: Commit**

```bash
git add src/uploader/types.ts src/uploader/index.ts
git commit -m "feat: add ImageUploader abstraction and factory"
```

---

## Task 4: Aliyun OSS Uploader

**Files:**
- Create: `src/uploader/aliyun.ts`
- Create: `tests/uploader/aliyun.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/uploader/aliyun.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatTimestamp, buildObjectKey, mimeToExt } from '../../src/uploader/aliyun'

describe('formatTimestamp', () => {
  it('produces 17-char string YYYYMMDDHHmmssSSS', () => {
    const d = new Date('2026-05-09T14:30:22.583Z')
    const ts = formatTimestamp(d)
    expect(ts).toHaveLength(17)
    expect(ts).toMatch(/^\d{17}$/)
  })
})

describe('buildObjectKey', () => {
  it('constructs correct path with prefix', () => {
    const d = new Date('2026-05-09T14:30:22.583Z')
    const key = buildObjectKey({ prefix: 'obsidian', source: 'feishu', notename: '我的笔记', date: d, ext: 'png' })
    expect(key).toMatch(/^obsidian\/feishu\/\d{6}\/我的笔记-\d{17}\.png$/)
  })

  it('constructs correct path without prefix', () => {
    const d = new Date('2026-05-09T14:30:22.583Z')
    const key = buildObjectKey({ prefix: '', source: 'feishu', notename: '笔记', date: d, ext: 'jpg' })
    expect(key).toMatch(/^feishu\/\d{6}\/笔记-\d{17}\.jpg$/)
  })
})

describe('mimeToExt', () => {
  it('maps known mime types', () => {
    expect(mimeToExt('image/png')).toBe('png')
    expect(mimeToExt('image/jpeg')).toBe('jpg')
    expect(mimeToExt('image/webp')).toBe('webp')
    expect(mimeToExt('image/unknown')).toBe('png')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run tests/uploader/aliyun.test.ts
```

Expected: FAIL — `formatTimestamp` not found

- [ ] **Step 3: Create `src/uploader/aliyun.ts`**

```typescript
import type { AliyunOSSConfig } from '../storage/settings'
import type { ImageUploader, UploadParams } from './types'

export class AliyunOSSUploader implements ImageUploader {
  constructor(private config: AliyunOSSConfig) {}

  async upload({ base64, mimeType, notename, source }: UploadParams): Promise<string> {
    const ext = mimeToExt(mimeType)
    const now = new Date()
    const objectKey = buildObjectKey({ prefix: this.config.prefix, source, notename, date: now, ext })

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const date = now.toUTCString()
    const signature = await signOSS({
      method: 'PUT',
      contentType: mimeType,
      date,
      bucket: this.config.bucket,
      objectKey,
      secretKey: this.config.accessKeySecret,
    })

    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
    const publicUrl = `https://${this.config.bucket}.${this.config.region}.aliyuncs.com/${encodedKey}`

    const resp = await fetch(publicUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Date': date,
        'Authorization': `OSS ${this.config.accessKeyId}:${signature}`,
      },
      body: bytes,
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`OSS upload failed ${resp.status}: ${text}`)
    }

    return publicUrl
  }
}

export function buildObjectKey(params: {
  prefix: string
  source: string
  notename: string
  date: Date
  ext: string
}): string {
  const { prefix, source, notename, date, ext } = params
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const ts = formatTimestamp(date)
  const base = `${source}/${yyyymm}/${notename}-${ts}.${ext}`
  return prefix ? `${prefix}/${base}` : base
}

export function formatTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
}

export function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
  }
  return map[mimeType] ?? 'png'
}

async function signOSS(params: {
  method: string
  contentType: string
  date: string
  bucket: string
  objectKey: string
  secretKey: string
}): Promise<string> {
  const stringToSign = [
    params.method,
    '',  // Content-MD5 (omitted)
    params.contentType,
    params.date,
    `/${params.bucket}/${params.objectKey}`,
  ].join('\n')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run tests/uploader/aliyun.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/uploader/aliyun.ts tests/uploader/aliyun.test.ts
git commit -m "feat: add AliyunOSSUploader with HMAC-SHA1 signing"
```

---

## Task 5: Options Page Scaffold

**Files:**
- Create: `entrypoints/options/index.html`
- Create: `entrypoints/options/main.ts`

- [ ] **Step 1: Create `entrypoints/options/index.html`**

```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>飞书文档 → Obsidian 设置</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `entrypoints/options/main.ts`**

```typescript
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/index.html entrypoints/options/main.ts
git commit -m "feat: add options page scaffold"
```

---

## Task 6: Options Page UI

**Files:**
- Create: `entrypoints/options/App.vue`

- [ ] **Step 1: Create `entrypoints/options/App.vue`**

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useSettings } from '../../src/composables/useSettings'
import { useVaultStore } from '../../src/composables/useVaultStore'

const { settings, isSaving, saveStatus, load, save } = useSettings()
const vault = useVaultStore()

onMounted(async () => {
  await load()
  await vault.init()
})

const vaultName = computed(() => vault.handle.value?.name ?? null)

const ossRegions = [
  { value: 'oss-cn-hangzhou', label: '华东1（杭州）' },
  { value: 'oss-cn-shanghai', label: '华东2（上海）' },
  { value: 'oss-cn-beijing', label: '华北2（北京）' },
  { value: 'oss-cn-shenzhen', label: '华南1（深圳）' },
  { value: 'oss-cn-chengdu', label: '西南1（成都）' },
  { value: 'oss-cn-hongkong', label: '中国香港' },
]

const ossPathPreview = computed(() => {
  const cfg = settings.value.aliyunOSS
  const prefix = cfg.prefix ? `${cfg.prefix}/` : ''
  return `${prefix}feishu/202605/笔记标题-20260509143022583.png`
})

const showSecret = ref(false)
const testStatus = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const testError = ref('')

async function testConnection() {
  testStatus.value = 'testing'
  testError.value = ''
  try {
    const { AliyunOSSUploader } = await import('../../src/uploader/aliyun')
    const uploader = new AliyunOSSUploader(settings.value.aliyunOSS)
    // 1×1 transparent PNG base64
    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    await uploader.upload({ base64: png1x1, mimeType: 'image/png', notename: '.connection-test', source: 'feishu' })
    testStatus.value = 'ok'
  } catch (e) {
    testStatus.value = 'fail'
    testError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="page">
    <h1 class="title">飞书文档 → Obsidian 设置</h1>

    <!-- 分区一：Vault 配置 -->
    <section class="section">
      <h2 class="section-title">Vault 配置</h2>

      <div class="field">
        <label class="label">Obsidian Vault 目录</label>
        <div class="vault-row">
          <span class="vault-name">{{ vaultName ?? '未选择' }}</span>
          <button class="btn-secondary" @click="vault.authorize()">
            {{ vaultName ? '重新选择' : '选择目录' }}
          </button>
        </div>
      </div>

      <div class="field">
        <label class="label">默认子目录</label>
        <input v-model="settings.subDir" class="input" placeholder="Clippings" />
        <p class="hint">笔记保存在 Vault 下的此子目录中</p>
      </div>
    </section>

    <!-- 分区二：图片处理 -->
    <section class="section">
      <h2 class="section-title">图片处理方式</h2>

      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" v-model="settings.imageMode" value="local" />
          保存到本地 Vault（默认）
        </label>
        <label class="radio-label">
          <input type="radio" v-model="settings.imageMode" value="oss" />
          上传到云存储
        </label>
      </div>
    </section>

    <!-- 分区三：云存储配置（仅 oss 模式） -->
    <section v-if="settings.imageMode === 'oss'" class="section">
      <h2 class="section-title">云存储配置</h2>

      <div class="field">
        <label class="label">云存储平台</label>
        <select v-model="settings.ossProvider" class="input">
          <option value="aliyun">阿里云 OSS</option>
        </select>
      </div>

      <template v-if="settings.ossProvider === 'aliyun'">
        <div class="divider-label">阿里云 OSS</div>

        <div class="field">
          <label class="label">Access Key ID</label>
          <input v-model="settings.aliyunOSS.accessKeyId" class="input" autocomplete="off" />
        </div>

        <div class="field">
          <label class="label">Access Key Secret</label>
          <div class="secret-row">
            <input
              v-model="settings.aliyunOSS.accessKeySecret"
              :type="showSecret ? 'text' : 'password'"
              class="input"
              autocomplete="off"
            />
            <button class="btn-secondary" @click="showSecret = !showSecret">
              {{ showSecret ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="label">Bucket 名称</label>
          <input v-model="settings.aliyunOSS.bucket" class="input" />
        </div>

        <div class="field">
          <label class="label">地域</label>
          <select v-model="settings.aliyunOSS.region" class="input">
            <option v-for="r in ossRegions" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>

        <div class="field">
          <label class="label">路径前缀</label>
          <input v-model="settings.aliyunOSS.prefix" class="input" placeholder="obsidian" />
          <p class="hint preview">路径预览：{{ ossPathPreview }}</p>
        </div>

        <div class="field">
          <button class="btn-secondary" :disabled="testStatus === 'testing'" @click="testConnection">
            {{ testStatus === 'testing' ? '测试中…' : '测试连接' }}
          </button>
          <span v-if="testStatus === 'ok'" class="test-ok">✓ 连接成功</span>
          <span v-if="testStatus === 'fail'" class="test-fail">✗ {{ testError }}</span>
        </div>
      </template>
    </section>

    <!-- 保存按钮 -->
    <div class="footer">
      <button class="btn-save" :disabled="isSaving" @click="save">
        {{ isSaving ? '保存中…' : '保存设置' }}
      </button>
      <span v-if="saveStatus === 'saved'" class="save-ok">✓ 已保存</span>
      <span v-if="saveStatus === 'error'" class="save-fail">保存失败</span>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 560px; margin: 0 auto; padding: 32px 24px; font-family: sans-serif; color: #222; }
.title { font-size: 20px; font-weight: 600; margin: 0 0 24px; }
.section { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
.section-title { font-size: 15px; font-weight: 600; margin: 0 0 16px; color: #444; }
.field { margin-bottom: 14px; }
.label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
.input { width: 100%; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; padding: 7px 10px; font-size: 13px; outline: none; }
.input:focus { border-color: #6e4dc4; }
.hint { font-size: 11px; color: #888; margin: 4px 0 0; }
.preview { font-family: monospace; word-break: break-all; }
.vault-row { display: flex; align-items: center; gap: 10px; }
.vault-name { font-size: 13px; color: #333; flex: 1; }
.radio-group { display: flex; flex-direction: column; gap: 10px; }
.radio-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.divider-label { font-size: 12px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 14px; }
.secret-row { display: flex; gap: 8px; }
.secret-row .input { flex: 1; }
.btn-secondary { background: #f5f5f5; border: 1px solid #ccc; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.btn-secondary:hover { background: #eee; }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
.test-ok { font-size: 13px; color: #2e7d32; margin-left: 10px; }
.test-fail { font-size: 13px; color: #c62828; margin-left: 10px; }
.footer { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
.btn-save { background: #6e4dc4; color: white; border: none; border-radius: 6px; padding: 10px 24px; font-size: 14px; font-weight: 500; cursor: pointer; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.save-ok { font-size: 13px; color: #2e7d32; }
.save-fail { font-size: 13px; color: #c62828; }
</style>
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
pnpm build 2>&1
```

Expected: build succeeds, `options.html` appears in `.output/chrome-mv3/`

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/App.vue
git commit -m "feat: add options page UI"
```

---

## Task 7: Update useFileSave — Read Settings, Branch on Image Mode

**Files:**
- Modify: `src/composables/useFileSave.ts`

The `save()` function removes its `subDir` parameter and reads it from settings instead. `downloadAndReplaceImages` gains an `uploader` parameter; when non-null it uploads to OSS, otherwise saves locally.

- [ ] **Step 1: Replace `src/composables/useFileSave.ts`**

```typescript
import { ref } from 'vue'
import { saveToVault, saveImageToVault } from '../filesystem/save'
import { buildFrontmatter } from '../converter/frontmatter'
import { blocksToMarkdown } from '../converter/blocks'
import { sanitizeFilename } from '../converter/filename'
import { getSettings } from '../storage/settings'
import { createUploader } from '../uploader/index'
import type { ImageUploader } from '../uploader/types'
import type { Block, DocContent } from '../types'

export function useFileSave() {
  const savedFilename = ref<string | null>(null)
  const error = ref<string | null>(null)
  const isSaving = ref(false)

  async function save(
    vaultHandle: FileSystemDirectoryHandle,
    doc: DocContent,
  ) {
    isSaving.value = true
    error.value = null
    savedFilename.value = null

    try {
      const settings = await getSettings()
      const uploader = createUploader(settings)
      const notename = sanitizeFilename(doc.title)

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const blocks = tab?.id
        ? await downloadAndReplaceImages(doc.blocks, tab.id, vaultHandle, settings.subDir, notename, uploader)
        : doc.blocks

      const frontmatter = buildFrontmatter(doc)
      const body = blocksToMarkdown(blocks)
      const content = `${frontmatter}\n${body}\n`

      const filename = await saveToVault(vaultHandle, settings.subDir, doc.title, content)
      savedFilename.value = filename
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isSaving.value = false
    }
  }

  async function copyToClipboard(doc: DocContent) {
    const frontmatter = buildFrontmatter(doc)
    const body = blocksToMarkdown(doc.blocks)
    const content = `${frontmatter}\n${body}\n`
    await navigator.clipboard.writeText(content)
  }

  return { savedFilename, error, isSaving, save, copyToClipboard }
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
  }
  return map[mimeType] ?? 'png'
}

async function downloadAndReplaceImages(
  blocks: Block[],
  tabId: number,
  vaultHandle: FileSystemDirectoryHandle,
  subDir: string,
  notename: string,
  uploader: ImageUploader | null,
): Promise<Block[]> {
  let imageIndex = 0
  const result: Block[] = []
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  for (const block of blocks) {
    if (block.type !== 'image' || !block.src) {
      result.push(block)
      continue
    }

    imageIndex++
    try {
      let base64: string
      let mimeType: string

      if (block.src.startsWith('data:')) {
        const [header, b64] = block.src.split(',')
        if (!b64) { result.push(block); continue }
        const mimeMatch = header.match(/data:([^;]+)/)
        mimeType = mimeMatch?.[1] ?? 'image/png'
        base64 = b64
      } else {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'DOWNLOAD_IMAGE', url: block.src }) as
          | { ok: true; base64: string; mimeType: string }
          | { ok: false; error: string }

        if (!resp.ok) { result.push(block); continue }
        mimeType = resp.mimeType
        base64 = resp.base64
      }

      if (uploader) {
        const url = await uploader.upload({ base64, mimeType, notename, source: 'feishu' })
        result.push({ ...block, src: url })
      } else {
        const ext = mimeToExt(mimeType)
        const filename = `${notename}-${date}-${imageIndex}.${ext}`
        await saveImageToVault(vaultHandle, subDir, notename, filename, base64)
        result.push({ ...block, src: `${notename}.assets/${filename}` })
      }
    } catch {
      result.push(block)
    }
  }

  return result
}
```

- [ ] **Step 2: Build to confirm no compile errors**

```bash
pnpm build 2>&1
```

Expected: succeeds (popup will have a TS error on `subDir` argument — fix that in Task 8)

- [ ] **Step 3: Commit**

```bash
git add src/composables/useFileSave.ts
git commit -m "feat: useFileSave reads settings internally, supports OSS upload"
```

---

## Task 8: Simplify Popup

**Files:**
- Modify: `entrypoints/popup/App.vue`

Remove `subDir` ref and input. Add gear icon. Update `handleSave` call signature. Add "OSS 配置不完整" guard.

- [ ] **Step 1: Replace `entrypoints/popup/App.vue`**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useVaultStore } from '../../src/composables/useVaultStore'
import { useDocContent } from '../../src/composables/useDocContent'
import { useFileSave } from '../../src/composables/useFileSave'
import { getSettings } from '../../src/storage/settings'

const vault = useVaultStore()
const docContent = useDocContent()
const fileSave = useFileSave()

const propertiesOpen = ref(true)
const showDropdown = ref(false)
const ossIncomplete = ref(false)

const editableTitle = ref('')
const editableSource = ref('')
const editableAuthor = ref('')
const editablePublished = ref('')
const editableCreated = ref('')
const editableDescription = ref('')
const editableTags = ref('clippings')

onMounted(async () => {
  await vault.init()
  await docContent.fetch()
  if (docContent.doc.value) {
    const d = docContent.doc.value
    editableTitle.value = d.title
    editableSource.value = d.source
    editableAuthor.value = d.author ?? ''
    editablePublished.value = d.published ?? ''
    editableCreated.value = d.created
    editableDescription.value = d.description ?? ''
  }
  const settings = await getSettings()
  if (settings.imageMode === 'oss') {
    const cfg = settings.aliyunOSS
    ossIncomplete.value = !cfg.accessKeyId || !cfg.accessKeySecret || !cfg.bucket
  }
})

const doc = computed(() => docContent.doc.value)
const isFeishuDoc = computed(() => doc.value !== null || docContent.isLoading.value)

const previewText = computed(() => {
  if (!doc.value) return ''
  return doc.value.blocks
    .filter(b => b.spans)
    .map(b => b.spans!.map(s => s.text).join(''))
    .filter(line => line.trim())
    .join('\n')
})

function mergedDoc() {
  return {
    ...doc.value!,
    title: editableTitle.value || doc.value!.title,
    source: editableSource.value,
    author: editableAuthor.value || undefined,
    published: editablePublished.value || undefined,
    created: editableCreated.value,
    description: editableDescription.value || undefined,
  }
}

async function handleSave() {
  if (!vault.handle.value || !doc.value) return
  await fileSave.save(vault.handle.value, mergedDoc())
  showDropdown.value = false
}

async function handleCopy() {
  if (!doc.value) return
  await fileSave.copyToClipboard(mergedDoc())
  showDropdown.value = false
}

function openSettings() {
  chrome.runtime.openOptionsPage()
}
</script>

<template>
  <div class="popup">
    <!-- 非飞书文档页 / 提取失败 -->
    <div v-if="!isFeishuDoc && !docContent.isLoading.value" class="empty-state">
      <p v-if="docContent.error.value" class="error-msg">{{ docContent.error.value }}</p>
      <p v-else>请在飞书文档页面使用此插件</p>
    </div>

    <!-- 加载中 -->
    <div v-else-if="docContent.isLoading.value" class="loading">
      <p>正在提取文档内容…</p>
    </div>

    <!-- 主界面 -->
    <template v-else-if="doc">
      <!-- 标题 + 设置入口 -->
      <div class="title-row">
        <h2 class="doc-title">{{ doc.title }}</h2>
        <button class="btn-gear" title="设置" @click="openSettings">⚙</button>
      </div>

      <!-- 中间可滚动区域 -->
      <div class="middle">
        <!-- 属性面板 -->
        <div class="properties">
          <button class="properties-toggle" @click="propertiesOpen = !propertiesOpen">
            属性 {{ propertiesOpen ? '∧' : '∨' }}
          </button>
          <div v-if="propertiesOpen" class="properties-body">
            <div class="prop-row">
              <span class="prop-icon">≡</span>
              <span class="prop-label">title</span>
              <input v-model="editableTitle" class="prop-input" />
            </div>
            <div class="prop-row">
              <span class="prop-icon">≡</span>
              <span class="prop-label">source</span>
              <input v-model="editableSource" class="prop-input" />
            </div>
            <div class="prop-row">
              <span class="prop-icon">≡</span>
              <span class="prop-label">author</span>
              <input v-model="editableAuthor" class="prop-input" />
            </div>
            <div class="prop-row">
              <span class="prop-icon">📅</span>
              <span class="prop-label">published</span>
              <input v-model="editablePublished" class="prop-input" />
            </div>
            <div class="prop-row">
              <span class="prop-icon">📅</span>
              <span class="prop-label">created</span>
              <input v-model="editableCreated" class="prop-input" />
            </div>
            <div class="prop-row prop-row-desc">
              <span class="prop-icon">≡</span>
              <span class="prop-label">description</span>
              <textarea v-model="editableDescription" class="prop-textarea" rows="3" />
            </div>
            <div class="prop-row">
              <span class="prop-icon">≡</span>
              <span class="prop-label">tags</span>
              <input v-model="editableTags" class="prop-input" />
            </div>
          </div>
        </div>

        <!-- 内容预览 -->
        <textarea class="preview" readonly :value="previewText" />
      </div>

      <!-- 底部操作区 -->
      <div class="footer">
        <!-- 未配置 vault（首次安装） -->
        <template v-if="!vault.isAuthorized.value && !vault.needsReauth.value && !vault.isLoading.value">
          <p class="warn-msg">⚠ 请先在设置中配置 Vault 目录</p>
          <button class="btn-authorize" @click="openSettings">去设置</button>
        </template>

        <!-- 需要重新授权 -->
        <template v-else-if="vault.needsReauth.value">
          <button class="btn-authorize" @click="vault.reauthorize()">点击授权访问 Vault</button>
        </template>

        <!-- OSS 配置不完整 -->
        <template v-else-if="ossIncomplete">
          <p class="warn-msg">⚠ OSS 配置不完整</p>
          <button class="btn-authorize" @click="openSettings">去设置</button>
        </template>

        <!-- 已就绪 -->
        <template v-else>
          <div class="save-row">
            <button
              class="btn-save"
              :disabled="fileSave.isSaving.value"
              @click="handleSave"
            >
              {{ fileSave.isSaving.value ? '保存中…' : '保存到 Obsidian' }}
            </button>
            <button class="btn-dropdown" @click="showDropdown = !showDropdown">▼</button>
            <div v-if="showDropdown" class="dropdown">
              <button @click="handleCopy">复制 Markdown</button>
              <button @click="vault.changeVault()">更换 Vault 目录</button>
            </div>
          </div>
        </template>

        <!-- 保存结果 -->
        <p v-if="fileSave.savedFilename.value" class="success">
          ✓ 已保存：{{ fileSave.savedFilename.value }}
        </p>
        <p v-if="fileSave.error.value" class="error-msg">{{ fileSave.error.value }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.popup { width: 380px; height: 520px; max-height: 580px; font-family: sans-serif;
  display: flex; flex-direction: column; overflow: hidden; }
.title-row { display: flex; align-items: flex-start; gap: 6px; padding: 12px 12px 8px;
  border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.doc-title { font-size: 15px; font-weight: 600; margin: 0; line-height: 1.4; flex: 1; }
.btn-gear { background: none; border: none; cursor: pointer; font-size: 16px; color: #888;
  padding: 0 2px; line-height: 1; flex-shrink: 0; }
.btn-gear:hover { color: #444; }
.middle { flex: 1; overflow-y: auto; padding: 8px 12px; min-height: 0; }
.properties { border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px; }
.properties-toggle { background: none; border: none; width: 100%; text-align: left;
  padding: 8px 12px; cursor: pointer; font-size: 13px; color: #555; }
.properties-body { padding: 4px 12px 8px; }
.prop-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; }
.prop-icon { width: 16px; text-align: center; color: #888; }
.prop-label { width: 70px; color: #666; flex-shrink: 0; }
.prop-input { flex: 1; border: none; border-bottom: 1px solid #ddd; font-size: 12px;
  outline: none; padding: 1px 2px; }
.prop-row-desc { align-items: flex-start; }
.prop-textarea { flex: 1; border: 1px solid #ddd; border-radius: 3px; font-size: 11px;
  outline: none; padding: 2px 4px; resize: vertical; font-family: sans-serif; line-height: 1.4; }
.preview { background: #f9f9f9; border: 1px solid #e8e8e8; border-radius: 4px; padding: 8px;
  font-size: 12px; color: #444; width: 100%; box-sizing: border-box;
  min-height: 120px; resize: vertical; font-family: sans-serif; line-height: 1.5; outline: none; }
.footer { flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;
  padding: 8px 12px 12px; border-top: 1px solid #f0f0f0; }
.save-row { display: flex; gap: 2px; position: relative; }
.btn-save { flex: 1; background: #6e4dc4; color: white; border: none; border-radius: 6px 0 0 6px;
  padding: 10px; font-size: 14px; font-weight: 500; cursor: pointer; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-dropdown { background: #6e4dc4; color: white; border: none; border-radius: 0 6px 6px 0;
  padding: 10px 12px; cursor: pointer; }
.dropdown { position: absolute; bottom: 44px; right: 0; background: white;
  border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); z-index: 10; }
.dropdown button { display: block; width: 100%; padding: 8px 16px; border: none;
  background: none; cursor: pointer; font-size: 13px; text-align: left; }
.dropdown button:hover { background: #f5f5f5; }
.btn-authorize { background: #6e4dc4; color: white; border: none; border-radius: 6px;
  padding: 10px; font-size: 14px; cursor: pointer; }
.warn-msg { color: #b45309; font-size: 12px; margin: 0; }
.success { color: #2e7d32; font-size: 12px; margin: 0; }
.error-msg { color: #c62828; font-size: 12px; margin: 0; }
.loading, .empty-state { padding: 20px; text-align: center; color: #666; font-size: 13px; }
</style>
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
pnpm build 2>&1
```

Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add entrypoints/popup/App.vue
git commit -m "feat: simplify popup — gear icon, three vault states, no subDir input"
```

---

## Task 9: Update wxt.config.ts

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: Add `https://*.aliyuncs.com/*` to host_permissions**

Edit `wxt.config.ts`:

```typescript
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '飞书文档 → Obsidian',
    description: '将飞书文档一键保存为 Obsidian Markdown 笔记',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [
      '*://*.feishu.cn/*',
      'https://*.aliyuncs.com/*',
    ],
  },
})
```

- [ ] **Step 2: Build and confirm options page is included**

```bash
pnpm build 2>&1
```

Expected output includes:
```
├─ .output/chrome-mv3/options.html
```

- [ ] **Step 3: Commit**

```bash
git add wxt.config.ts
git commit -m "feat: add aliyuncs host_permissions for OSS cross-origin requests"
```

---

## Task 10: Full Build & Smoke Test

- [ ] **Step 1: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass

- [ ] **Step 2: Final build**

```bash
pnpm build 2>&1
```

Expected: succeeds, output includes `options.html`, `popup.html`, `background.js`, `content-scripts/content.js`

- [ ] **Step 3: Reload in Chrome and verify**

1. Go to `chrome://extensions/` → reload the extension
2. Click the extension icon — popup should show doc content with ⚙ gear icon, no subDir input
3. Click ⚙ — options page opens in new tab with three sections
4. Configure a vault directory in options page
5. Return to popup — save button should be active
6. Save a Feishu doc — file appears in correct Vault subdirectory

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: settings page + OSS upload complete"
```
