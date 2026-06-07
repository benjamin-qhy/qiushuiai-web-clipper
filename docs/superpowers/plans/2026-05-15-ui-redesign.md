# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all three extension pages (Popup, Settings, Bookmarks) to a unified Swiss-minimal aesthetic with white/dark/#f97316 palette, thin borders, and generous whitespace.

**Architecture:** Shared CSS design tokens defined in `src/styles/tokens.css` and imported into each page's `main.ts`. Each page's `<style scoped>` block is fully rewritten; no logic changes anywhere.

**Tech Stack:** Vue 3 SFC scoped CSS, WXT browser extension framework, TypeScript (no changes)

---

## File Map

| File | Change |
|---|---|
| `src/styles/tokens.css` | **Create** — CSS custom properties shared across all pages |
| `entrypoints/popup/main.ts` | Modify — import tokens.css |
| `entrypoints/popup/App.vue` | Modify — rewrite `<style scoped>`, minor template tweaks |
| `entrypoints/popup/style.css` | Rewrite — reset only |
| `entrypoints/options/main.ts` | Modify — import tokens.css |
| `entrypoints/options/App.vue` | Modify — rewrite template to two-column + rewrite `<style scoped>` |
| `entrypoints/bookmarks/main.ts` | Modify — import tokens.css |
| `entrypoints/bookmarks/App.vue` | Modify — rewrite `<style scoped>`, update header template |
| `entrypoints/bookmarks/components/FolderTree.vue` | Modify — rewrite `<style scoped>` |
| `entrypoints/bookmarks/components/BookmarkList.vue` | Modify — rewrite `<style scoped>` |
| `entrypoints/bookmarks/components/AISidebar.vue` | Modify — rewrite `<style scoped>` |
| `entrypoints/bookmarks/components/ai/ChatMessages.vue` | Modify — rewrite `<style scoped>` |
| `entrypoints/bookmarks/components/ai/ChatInput.vue` | Modify — rewrite `<style scoped>` |
| `entrypoints/bookmarks/components/ai/EmptyState.vue` | Modify — rewrite `<style scoped>` |
| `entrypoints/bookmarks/components/ai/CategoryProposal.vue` | Modify — rewrite `<style scoped>` |

---

## Task 1: Design Tokens

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `entrypoints/popup/main.ts`
- Modify: `entrypoints/options/main.ts`
- Modify: `entrypoints/bookmarks/main.ts`

- [ ] **Step 1: Create tokens file**

```css
/* src/styles/tokens.css */
:root {
  --color-bg: #ffffff;
  --color-surface: #fafafa;
  --color-base: #f7f7f5;
  --color-text: #1a1a1a;
  --color-text-secondary: #888888;
  --color-text-muted: #bbbbbb;
  --color-border: #e8e8e8;
  --color-border-light: #f0f0f0;
  --color-accent: #f97316;
  --color-dark: #1a1a1a;
  --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-content: Georgia, "Times New Roman", serif;
}
```

- [ ] **Step 2: Import tokens in each main.ts**

`entrypoints/popup/main.ts` — add as first import:
```ts
import '../../src/styles/tokens.css'
```

`entrypoints/options/main.ts` — add as first import:
```ts
import '../../src/styles/tokens.css'
```

`entrypoints/bookmarks/main.ts` — add as first import:
```ts
import '../../src/styles/tokens.css'
```

- [ ] **Step 3: Verify build passes**

```bash
pnpm build
```
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css entrypoints/popup/main.ts entrypoints/options/main.ts entrypoints/bookmarks/main.ts
git commit -m "feat: add shared design tokens CSS"
```

---

## Task 2: Popup Redesign

**Files:**
- Modify: `entrypoints/popup/App.vue`
- Modify: `entrypoints/popup/style.css`

- [ ] **Step 1: Rewrite popup/style.css**

Replace entire file content:
```css
html, body { margin: 0; padding: 0; background: var(--color-bg); }
```

- [ ] **Step 2: Replace `<style scoped>` block in popup/App.vue**

Replace the entire `<style scoped>` block (lines 207–277) with:

```css
<style scoped>
.popup {
  width: 380px;
  max-height: 580px;
  font-family: var(--font-ui);
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 16px;
}

/* Header */
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 10px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.header-brand {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--color-text);
  flex: 1;
}
.btn-settings {
  font-size: 11px;
  background: var(--color-dark);
  color: #fff;
  border: none;
  padding: 3px 9px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.btn-settings:hover { opacity: 0.8; }
.btn-bookmarks {
  font-size: 11px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 3px 9px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.btn-bookmarks:hover { opacity: 0.85; }

/* Doc title area */
.doc-meta { padding: 10px 0 0; flex-shrink: 0; }
.doc-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 3px;
  line-height: 1.4;
}
.doc-source {
  font-size: 7px;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 600;
  margin: 0 0 8px;
}

/* Middle scrollable */
.middle {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 8px;
  min-height: 0;
}

/* Properties */
.properties { margin-bottom: 8px; }
.properties-toggle {
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  padding: 6px 0;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid var(--color-border-light);
  margin-bottom: 6px;
}
.properties-body { padding: 2px 0 4px; }
.prop-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.prop-label {
  width: 56px;
  font-size: 6.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-text-muted);
  text-align: right;
  flex-shrink: 0;
}
.prop-input {
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
.prop-input:focus { border-bottom-color: var(--color-accent); }
.prop-row-desc { align-items: flex-start; }
.prop-textarea {
  flex: 1;
  border: none;
  border-bottom: 1px solid var(--color-border);
  font-size: 11px;
  font-family: var(--font-ui);
  color: var(--color-text);
  outline: none;
  padding: 2px 4px;
  resize: vertical;
  line-height: 1.5;
  background: transparent;
}
.prop-textarea:focus { border-bottom-color: var(--color-accent); }

/* Preview */
.preview {
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  padding: 10px 12px;
  font-size: 12px;
  color: #555;
  font-family: var(--font-content);
  line-height: 1.7;
  width: 100%;
  box-sizing: border-box;
  min-height: 100px;
  resize: vertical;
  outline: none;
  border-radius: 2px;
}

/* Footer */
.footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 14px;
  border-top: 1px solid var(--color-border-light);
}
.save-row { display: flex; gap: 1px; position: relative; }
.btn-save {
  flex: 1;
  background: var(--color-dark);
  color: #fff;
  border: none;
  padding: 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px 0 0 2px;
  font-family: var(--font-ui);
}
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-dropdown {
  background: var(--color-dark);
  color: #fff;
  border: none;
  border-left: 1px solid rgba(255,255,255,0.15);
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 0 2px 2px 0;
}
.btn-dropdown:hover { opacity: 0.85; }
.dropdown {
  position: absolute;
  bottom: 44px;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  z-index: 10;
  min-width: 140px;
}
.dropdown button {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  color: var(--color-text);
  font-family: var(--font-ui);
}
.dropdown button:hover { background: var(--color-surface); }
.btn-authorize {
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 2px;
  padding: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-ui);
}
.btn-authorize:hover { opacity: 0.85; }
.warn-msg { color: #b45309; font-size: 11px; margin: 0; }
.success { color: #2e7d32; font-size: 11px; margin: 0; }
.error-msg { color: #c62828; font-size: 11px; margin: 0; }
.loading, .empty-state {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>
```

- [ ] **Step 3: Update template in popup/App.vue**

In the template, replace the `<div class="title-row">` block (lines 106–110) with:
```html
<div class="title-row">
  <span class="header-brand">Qiushui</span>
  <button class="btn-settings" @click="openSettings">设置</button>
  <button class="btn-bookmarks" @click="openBookmarks">书签</button>
</div>
```

After `<template v-else-if="doc">` and before `<div class="title-row">`, add a doc meta section. Replace the existing `<div class="title-row">` and `<div class="middle">` opening (lines 106–114) with:
```html
<div class="title-row">
  <span class="header-brand">Qiushui</span>
  <button class="btn-settings" @click="openSettings">设置</button>
  <button class="btn-bookmarks" @click="openBookmarks">书签</button>
</div>

<div class="doc-meta">
  <h2 class="doc-title">{{ doc.title }}</h2>
  <p class="doc-source">Feishu · Article</p>
</div>

<div class="middle">
```

Also remove the old `<h2 class="doc-title">` that was inside the original `title-row` (line 107), since it now lives in `doc-meta`.

Remove all 7 occurrences of `<span class="prop-icon">…</span>` from the properties template — the redesign drops the icon column. Each `prop-row` in the template currently has a `<span class="prop-icon">` as its first child; delete those spans entirely.

- [ ] **Step 4: Verify build**

```bash
pnpm build
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/App.vue entrypoints/popup/style.css
git commit -m "feat: redesign popup UI"
```

---

## Task 3: Settings Page Redesign (Two-Column Full-Screen)

**Files:**
- Modify: `entrypoints/options/App.vue` — rewrite template to two-column + rewrite `<style scoped>`

- [ ] **Step 1: Replace the `<template>` block in options/App.vue**

Replace lines 148–358 (everything from `<template>` to `</template>`) with:

```html
<template>
  <div class="settings-layout">
    <!-- Left nav -->
    <nav class="settings-nav">
      <div class="nav-header">
        <div class="nav-brand">Qiushui Clipper</div>
        <div class="nav-title">Settings</div>
      </div>
      <div class="nav-body">
        <div class="nav-group-label">General</div>
        <a class="nav-item" :class="{ active: activeSection === 'vault' }" href="#section-vault" @click.prevent="scrollTo('vault')">Vault</a>
        <a class="nav-item" :class="{ active: activeSection === 'images' }" href="#section-images" @click.prevent="scrollTo('images')">Images</a>
        <a class="nav-item" :class="{ active: activeSection === 'ai' }" href="#section-ai" @click.prevent="scrollTo('ai')">AI Model</a>
        <div class="nav-group-label">Bookmarks</div>
        <a class="nav-item" :class="{ active: activeSection === 'org' }" href="#section-org" @click.prevent="scrollTo('org')">Organization</a>
        <a class="nav-item" :class="{ active: activeSection === 'inbox' }" href="#section-inbox" @click.prevent="scrollTo('inbox')">Inbox</a>
      </div>
      <div class="nav-footer">v{{ version }}</div>
    </nav>

    <!-- Right content -->
    <main class="settings-main" ref="mainEl">

      <div class="main-topbar">
        <div></div>
        <button class="btn-save" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? 'Saving…' : 'Save Settings' }}
        </button>
      </div>

      <!-- Vault -->
      <section id="section-vault" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Vault</h2>
          <p class="section-desc">Obsidian 笔记库配置</p>
        </div>
        <div class="field">
          <label class="field-label">Vault Path</label>
          <div class="vault-row">
            <span class="vault-name">{{ vaultName ?? '未选择' }}</span>
            <button class="btn-secondary" type="button" @click="handleVaultAction">{{ vaultButtonLabel }}</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="sub-dir">Sub Directory</label>
          <input id="sub-dir" v-model="settings.subDir" class="field-input" placeholder="Clippings" />
          <p class="field-hint">笔记会保存到 Vault 下的此子目录，留空则保存到根目录。</p>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Images -->
      <section id="section-images" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Images</h2>
          <p class="section-desc">图片存储方式</p>
        </div>
        <div class="field">
          <label class="field-label">Image Mode</label>
          <div class="mode-group">
            <button
              class="mode-btn"
              :class="{ active: settings.imageMode === 'local' }"
              type="button"
              @click="settings.imageMode = 'local'"
            >Local</button>
            <button
              class="mode-btn"
              :class="{ active: settings.imageMode === 'oss' }"
              type="button"
              @click="settings.imageMode = 'oss'"
            >Aliyun OSS</button>
          </div>
          <p class="field-hint">Local: 图片保存到 .assets 子目录</p>
        </div>

        <template v-if="settings.imageMode === 'oss'">
          <div class="field">
            <label class="field-label" for="access-key-id">Access Key ID</label>
            <input id="access-key-id" v-model="settings.aliyunOSS.accessKeyId" class="field-input" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field-label" for="access-key-secret">Access Key Secret</label>
            <div class="secret-row">
              <input id="access-key-secret" v-model="settings.aliyunOSS.accessKeySecret" :type="showSecret ? 'text' : 'password'" class="field-input" autocomplete="off" />
              <button class="btn-secondary" type="button" @click="showSecret = !showSecret">{{ showSecret ? '隐藏' : '显示' }}</button>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="oss-bucket">Bucket</label>
            <input id="oss-bucket" v-model="settings.aliyunOSS.bucket" class="field-input" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field-label" for="oss-region">Region</label>
            <select id="oss-region" v-model="settings.aliyunOSS.region" class="field-input field-select">
              <option v-for="region in ossRegions" :key="region.value" :value="region.value">{{ region.label }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="oss-prefix">Path Prefix</label>
            <input id="oss-prefix" v-model="settings.aliyunOSS.prefix" class="field-input" placeholder="qiushui-web-clipper" />
            <p class="field-hint preview-path">{{ ossPathPreview }}</p>
          </div>
          <div class="field">
            <label class="field-label" for="oss-custom-domain">Custom Domain</label>
            <input id="oss-custom-domain" v-model="settings.aliyunOSS.customDomain" class="field-input" placeholder="https://img.example.com" autocomplete="off" />
          </div>
          <div class="field test-row">
            <button class="btn-secondary" type="button" :disabled="testStatus === 'testing'" @click="testConnection">
              {{ testStatus === 'testing' ? '测试中…' : '测试连接' }}
            </button>
            <span v-if="testStatus === 'ok'" class="status-ok">✓ 连接成功</span>
            <span v-else-if="testStatus === 'fail'" class="status-fail">✗ {{ testError }}</span>
          </div>
        </template>
      </section>

      <div class="section-divider"></div>

      <!-- AI Model -->
      <section id="section-ai" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">AI Model</h2>
          <p class="section-desc">AI 模型配置</p>
        </div>
        <div class="field">
          <label class="field-label" for="ai-base-url">Base URL</label>
          <input id="ai-base-url" v-model="settings.aiConfig.baseUrl" class="field-input" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
          <p class="field-hint">支持任意 OpenAI 兼容接口</p>
        </div>
        <div class="field">
          <label class="field-label" for="ai-api-key">API Key</label>
          <div class="secret-row">
            <input id="ai-api-key" v-model="settings.aiConfig.apiKey" :type="showAISecret ? 'text' : 'password'" class="field-input" autocomplete="off" />
            <button class="btn-secondary" type="button" @click="showAISecret = !showAISecret">{{ showAISecret ? '隐藏' : '显示' }}</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="ai-model">Model</label>
          <input id="ai-model" v-model="settings.aiConfig.model" class="field-input" placeholder="qwen-long" />
        </div>
        <div class="field test-row">
          <button class="btn-secondary" type="button" :disabled="aiTestStatus === 'testing'" @click="testAIModel">
            {{ aiTestStatus === 'testing' ? '测试中…' : '测试模型' }}
          </button>
          <span v-if="aiTestStatus === 'ok'" class="status-ok">✓ 模型可用</span>
          <span v-else-if="aiTestStatus === 'fail'" class="status-fail">✗ {{ aiTestError }}</span>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Organization -->
      <section id="section-org" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Organization</h2>
          <p class="section-desc">书签整理配置</p>
        </div>
        <div class="field">
          <label class="field-label" for="bookmark-inbox">Inbox Folder</label>
          <input id="bookmark-inbox" v-model="settings.bookmarkInboxFolder" class="field-input" placeholder="待整理" />
          <p class="field-hint">将书签收藏到该文件夹后，插件会自动整理其中的内容。</p>
        </div>
        <div class="field">
          <label class="field-label" for="bookmark-sub-dir">Obsidian Sub Directory</label>
          <input id="bookmark-sub-dir" v-model="settings.bookmarkSubDir" class="field-input" placeholder="Bookmarks" />
          <p class="field-hint">整理后的书签笔记将保存到 Vault 下的此子目录中。</p>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Inbox -->
      <section id="section-inbox" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Inbox</h2>
          <p class="section-desc">自动处理设置</p>
        </div>
        <div class="field">
          <label class="field-label" for="process-interval">Process Interval (hours)</label>
          <input id="process-interval" v-model.number="settings.processInterval" class="field-input" type="number" min="1" max="168" style="max-width: 120px;" />
        </div>
      </section>

      <div class="section-divider"></div>

      <div class="bottom-save">
        <span v-if="saveStatus === 'saved'" class="status-ok">✓ 已保存</span>
        <span v-else-if="saveStatus === 'error'" class="status-fail">保存失败</span>
        <button class="btn-save" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? 'Saving…' : 'Save Settings' }}
        </button>
      </div>

    </main>
  </div>
</template>
```

- [ ] **Step 2: Add `activeSection`, `mainEl`, `scrollTo`, `version` to script in options/App.vue**

Replace the `vue` import at line 2 with:
```ts
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
```

After the existing `ref` declarations (after `const aiTestError = ref('')` at line 14), add:
```ts
const version = '2.0.0'
const mainEl = ref<HTMLElement | null>(null)
const activeSection = ref('vault')
const sectionIds = ['vault', 'images', 'ai', 'org', 'inbox']

let observer: IntersectionObserver | null = null

function scrollTo(id: string) {
  const el = document.getElementById(`section-${id}`)
  if (el && mainEl.value) {
    mainEl.value.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
  }
}

function setupObserver() {
  if (!mainEl.value) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('section-', '')
          activeSection.value = id
          break
        }
      }
    },
    { root: mainEl.value, threshold: 0.3 }
  )
  for (const id of sectionIds) {
    const el = document.getElementById(`section-${id}`)
    if (el) observer.observe(el)
  }
}

onUnmounted(() => observer?.disconnect())
```

Replace the existing `onMounted` block (lines 25–28) with:
```ts
onMounted(async () => {
  await load()
  await vault.init()
  await nextTick()
  setupObserver()
})
```

- [ ] **Step 3: Replace `<style scoped>` in options/App.vue**

Replace the entire `<style scoped>` block (lines 360–550) with:

```css
<style scoped>
.settings-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  font-family: var(--font-ui);
  background: var(--color-base);
  color: var(--color-text);
}

/* Left Nav */
.settings-nav {
  width: 200px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.nav-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--color-border);
}
.nav-brand {
  font-size: 7px;
  font-weight: 600;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 3px;
}
.nav-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.3px;
}
.nav-body {
  flex: 1;
  padding: 14px 0;
  overflow-y: auto;
}
.nav-group-label {
  font-size: 6px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  padding: 8px 20px 6px;
  margin-top: 4px;
}
.nav-group-label:first-child { margin-top: 0; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 0;
  text-decoration: none;
  color: var(--color-text-secondary);
  font-size: 13px;
  padding: 7px 20px;
  cursor: pointer;
  transition: color 0.1s;
  border-left: 2px solid transparent;
  margin-left: -1px;
}
.nav-item:hover { color: var(--color-text); }
.nav-item.active {
  color: var(--color-text);
  font-weight: 600;
  border-left-color: var(--color-accent);
}
.nav-footer {
  padding: 12px 20px;
  font-size: 11px;
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border);
}

/* Right Main */
.settings-main {
  flex: 1;
  overflow-y: auto;
  background: var(--color-bg);
}
.main-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 12px 40px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-light);
}
.settings-section {
  padding: 28px 40px;
}
.section-header { margin-bottom: 20px; }
.section-title {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}
.section-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.section-divider {
  height: 1px;
  background: var(--color-border-light);
  margin: 0 40px;
}
.field { margin-bottom: 18px; max-width: 520px; }
.field:last-child { margin-bottom: 0; }
.field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-text-muted);
  margin-bottom: 7px;
}
.field-input {
  box-sizing: border-box;
  width: 100%;
  background: var(--color-surface);
  border: none;
  border-bottom: 1px solid var(--color-border);
  padding: 8px 10px;
  font-size: 13px;
  color: var(--color-text);
  font-family: var(--font-ui);
  outline: none;
}
.field-input:focus { border-bottom-color: var(--color-accent); }
.field-select { cursor: pointer; }
.field-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.preview-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}
.vault-row, .secret-row, .test-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.vault-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 8px 10px;
}
.secret-row .field-input { flex: 1; }
.mode-group { display: flex; gap: 6px; margin-bottom: 6px; }
.mode-btn {
  padding: 6px 18px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-ui);
  letter-spacing: 0.3px;
}
.mode-btn:hover { border-color: var(--color-text-muted); }
.mode-btn.active {
  background: var(--color-dark);
  color: #fff;
  border-color: var(--color-dark);
}
.btn-secondary {
  padding: 7px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-ui);
}
.btn-secondary:hover { border-color: var(--color-text-muted); color: var(--color-text); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-save {
  padding: 8px 22px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  font-family: var(--font-ui);
}
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.status-ok { color: #2e7d32; font-size: 12px; }
.status-fail { color: #c62828; font-size: 12px; word-break: break-word; }
.bottom-save {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 24px 40px 40px;
}
</style>
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```
Expected: success, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/App.vue
git commit -m "feat: redesign settings page to two-column full-screen layout"
```

---

## Task 4: Bookmarks App.vue — Header & Layout

**Files:**
- Modify: `entrypoints/bookmarks/App.vue`

- [ ] **Step 1: Replace `<template>` in bookmarks/App.vue**

Replace lines 41–76 with:

```html
<template>
  <div class="layout">
    <div class="pane-left">
      <div class="pane-header">
        <div class="pane-brand">Qiushui</div>
        <div class="pane-title">Bookmarks</div>
      </div>
      <div class="pane-body">
        <FolderTree
          :nodes="tree.folderTree.value"
          :selected-id="tree.selectedFolderId.value"
          :drag-over-id="tree.dragOverFolderId.value"
          @select="handleSelect"
          @toggle-expand="(id) => tree.toggleExpand(id).catch(setError)"
          @create-folder="(parentId, title) => tree.createFolder(parentId, title).catch(setError)"
          @rename-folder="(id, title) => tree.renameFolder(id, title).catch(setError)"
          @delete-folder="(id) => tree.deleteFolder(id).catch(setError)"
          @move-folder="(folderId, targetId) => tree.moveFolder(folderId, targetId).catch(setError)"
          @move-bookmark="(bmId, folderId) => tree.moveBookmark(bmId, folderId).catch(setError)"
          @drag-over="(id) => { tree.dragOverFolderId.value = id }"
        />
      </div>
    </div>

    <div class="pane-main">
      <BookmarkList
        :bookmarks="tree.selectedBookmarks.value"
        :processed-ids="tree.processedIds.value"
        :folder-title="selectedFolderTitle"
        @delete-bookmark="(id) => tree.deleteBookmark(id).catch(setError)"
        @open-bookmark="handleOpenBookmark"
      />
    </div>

    <AISidebar />
  </div>

  <div v-if="tree.error.value" class="global-error">{{ tree.error.value }}</div>
</template>
```

- [ ] **Step 2: Replace both `<style>` blocks**

Replace the non-scoped `<style>` block (lines 78–81) with:
```css
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--color-base); }
</style>
```

Replace the `<style scoped>` block (lines 83–129) with:
```css
<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-bg);
}
.pane-left {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
}
.pane-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.pane-brand {
  font-size: 7px;
  font-weight: 600;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 2px;
}
.pane-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.3px;
}
.pane-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.pane-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--color-bg);
}
.global-error {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: #fce8e6;
  color: #c62828;
  padding: 8px 16px;
  border-radius: 2px;
  font-size: 12px;
  border: 1px solid #f5c6c6;
  z-index: 100;
}
</style>
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/bookmarks/App.vue
git commit -m "feat: redesign bookmarks layout header"
```

---

## Task 5: FolderTree Visual Update

**Files:**
- Modify: `entrypoints/bookmarks/components/FolderTree.vue`

- [ ] **Step 1: Replace `<style scoped>` in FolderTree.vue**

Replace lines 166–204 with:

```css
<style scoped>
.folder-list { list-style: none; margin: 0; padding: 0; }
.folder-item { }
.folder-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  cursor: pointer;
  user-select: none;
  position: relative;
}
.folder-row:hover { background: var(--color-border-light); }
.folder-row.selected {
  background: var(--color-dark);
  color: #fff;
}
.folder-row.selected .folder-name { color: #fff; }
.folder-row.selected .expand-btn { color: rgba(255,255,255,0.6); }
.folder-row.drag-over {
  background: #fff3e0;
  outline: 1px solid var(--color-accent);
}
.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 10px;
  color: var(--color-text-muted);
  width: 14px;
  flex-shrink: 0;
  padding: 0;
}
.folder-name {
  flex: 1;
  font-size: 12px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-actions {
  display: none;
  gap: 1px;
  align-items: center;
}
.folder-row:hover .folder-actions { display: flex; }
.folder-row.selected .folder-actions { display: flex; }
.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 1px 4px;
  border-radius: 2px;
}
.folder-row.selected .action-btn { color: rgba(255,255,255,0.6); }
.folder-row.selected .action-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.action-btn:hover { background: var(--color-border); color: var(--color-text); }
.action-btn.danger:hover { background: #fce8e6; color: #c62828; }
.new-folder-row { padding-left: 30px; }
.inline-input {
  flex: 1;
  font-size: 12px;
  border: none;
  border-bottom: 1px solid var(--color-accent);
  padding: 1px 4px;
  outline: none;
  background: transparent;
  font-family: var(--font-ui);
  color: var(--color-text);
}
</style>
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/bookmarks/components/FolderTree.vue
git commit -m "feat: redesign folder tree visual"
```

---

## Task 6: BookmarkList Visual Update

**Files:**
- Modify: `entrypoints/bookmarks/components/BookmarkList.vue`

- [ ] **Step 1: Replace `<style scoped>` in BookmarkList.vue**

Replace lines 72–97 with:

```css
<style scoped>
.list-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.folder-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  flex: 1;
  color: var(--color-text);
}
.count {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.empty-hint {
  padding: 48px 18px;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}
.bookmark-list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.bookmark-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  cursor: grab;
  border-bottom: 1px solid var(--color-border-light);
}
.bookmark-item:hover { background: var(--color-surface); }
.bookmark-item:active { cursor: grabbing; }
.favicon { flex-shrink: 0; border-radius: 2px; opacity: 0.85; }
.bm-content { flex: 1; min-width: 0; cursor: pointer; }
.bm-title {
  display: block;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}
.bm-url {
  display: block;
  font-size: 11px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.bm-content:hover .bm-title { color: var(--color-accent); }
.badge-processed {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  border-radius: 2px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 2px 6px;
  border-radius: 2px;
  flex-shrink: 0;
}
.delete-btn:hover { background: #fce8e6; color: #c62828; }
</style>
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/bookmarks/components/BookmarkList.vue
git commit -m "feat: redesign bookmark list visual"
```

---

## Task 7: AISidebar Visual Update

**Files:**
- Modify: `entrypoints/bookmarks/components/AISidebar.vue`

- [ ] **Step 1: Replace `<style scoped>` in AISidebar.vue**

Replace lines 113–171 with:

```css
<style scoped>
.sidebar {
  position: relative;
  flex-shrink: 0;
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
}
.drag-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.drag-handle:hover { background: var(--color-border); }
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg);
}
.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.header-actions { display: flex; gap: 6px; }
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-muted);
  padding: 0 3px;
  line-height: 1;
}
.btn-icon:hover { color: var(--color-accent); }
</style>
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/bookmarks/components/AISidebar.vue
git commit -m "feat: redesign AI sidebar visual"
```

---

## Task 8: AI Sub-Components Visual Update

**Files:**
- Modify: `entrypoints/bookmarks/components/ai/ChatMessages.vue`
- Modify: `entrypoints/bookmarks/components/ai/ChatInput.vue`
- Modify: `entrypoints/bookmarks/components/ai/EmptyState.vue`
- Modify: `entrypoints/bookmarks/components/ai/CategoryProposal.vue`

- [ ] **Step 1: Replace `<style scoped>` in ChatMessages.vue**

Replace lines 69–121 with:

```css
<style scoped>
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg-wrap { display: flex; }
.msg-wrap.user { justify-content: flex-end; }
.msg-wrap.ai { justify-content: flex-start; }
.bubble {
  max-width: 85%;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
  border-radius: 2px;
}
.user-bubble {
  background: var(--color-dark);
  color: #fff;
}
.ai-bubble {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.proposal-wrap { width: 100%; }
.thinking-block {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}
.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  cursor: pointer;
  user-select: none;
}
.thinking-toggle { font-size: 9px; color: var(--color-text-muted); }
.thinking-title { font-size: 11px; color: var(--color-text-secondary); }
.thinking-lines { padding: 4px 10px 8px; display: flex; flex-direction: column; gap: 2px; }
.thinking-line {
  font-size: 11px;
  color: var(--color-text-muted);
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.thinking-line.ok .line-icon { color: #4caf50; }
.thinking-line.error { color: #f44336; }
.thinking-line.error .line-icon { color: #f44336; }
.thinking-line.skip .line-icon { color: var(--color-text-muted); }
</style>
```

- [ ] **Step 2: Replace `<style scoped>` in ChatInput.vue**

Replace lines 41–75 with:

```css
<style scoped>
.chat-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  flex-shrink: 0;
}
.input {
  flex: 1;
  resize: none;
  border: none;
  border-bottom: 1px solid var(--color-border);
  padding: 6px 8px;
  font-size: 12px;
  font-family: var(--font-ui);
  outline: none;
  line-height: 1.5;
  background: transparent;
  color: var(--color-text);
}
.input:focus { border-bottom-color: var(--color-accent); }
.input:disabled { opacity: 0.5; }
.send-btn {
  align-self: flex-end;
  padding: 6px 14px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-ui);
}
.send-btn:hover { opacity: 0.85; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 3: Replace `<style scoped>` in EmptyState.vue**

Replace lines 21–45 with:

```css
<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  padding: 24px;
}
.hint {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin: 0 0 6px;
}
.quick-btn {
  width: 100%;
  max-width: 200px;
  padding: 9px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.quick-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
</style>
```

- [ ] **Step 4: Replace `<style scoped>` in CategoryProposal.vue**

Replace lines 51–82 with:

```css
<style scoped>
.proposal {
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 12px;
  background: var(--color-surface);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.proposal-title {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.tree { max-height: 240px; overflow-y: auto; }
.old-folder-choice { display: flex; flex-direction: column; gap: 6px; }
.choice-label { font-size: 11px; color: var(--color-text-secondary); }
.choice-btns { display: flex; gap: 6px; }
.choice-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-bg);
  font-size: 11px;
  font-family: var(--font-ui);
  cursor: pointer;
  color: var(--color-text);
}
.choice-btn:hover { border-color: var(--color-text-muted); }
.choice-btn.active {
  border-color: var(--color-accent);
  background: #fff7f0;
  color: var(--color-accent);
  font-weight: 600;
}
.actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn-modify {
  padding: 5px 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 2px;
  font-size: 11px;
  font-family: var(--font-ui);
  cursor: pointer;
  color: var(--color-text-secondary);
}
.btn-modify:hover { border-color: var(--color-text-muted); color: var(--color-text); }
.btn-confirm {
  padding: 5px 14px;
  background: var(--color-dark);
  color: #fff;
  border: none;
  border-radius: 2px;
  font-size: 11px;
  font-family: var(--font-ui);
  cursor: pointer;
}
.btn-confirm:hover { opacity: 0.85; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 5: Verify build**

```bash
pnpm build
```
Expected: success, no errors.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/bookmarks/components/ai/
git commit -m "feat: redesign AI chat components visual"
```

---

## Final Verification

- [ ] **Load extension in Chrome**

1. Go to `chrome://extensions/`
2. Click "Load unpacked" → select `.output/chrome-mv3/`
3. Open a Feishu doc page, click the extension icon → verify Popup looks correct
4. Click 设置 button → verify Settings page opens full-screen with two-column layout
5. Click 书签 button → verify Bookmarks page opens with updated visual

- [ ] **Final commit if any tweaks were made**

```bash
git add -A
git commit -m "fix: visual tweaks after manual review"
```
