<script setup lang="ts">
import { browser } from 'wxt/browser'
import { ref, computed, onMounted } from 'vue'
import { useVaultStore } from '../../src/composables/useVaultStore'
import { useDocContent } from '../../src/composables/useDocContent'
import { useFileSave } from '../../src/composables/useFileSave'
import { getSettings, saveSettings } from '../../src/storage/settings'
import { useUpdateChecker } from '../../src/composables/useUpdateChecker'
import { saveLinkNote } from '../../src/getnote/api'

const version = browser.runtime.getManifest().version
const updateChecker = useUpdateChecker()
const vault = useVaultStore()
const docContent = useDocContent()
const fileSave = useFileSave()

const propertiesOpen = ref(true)
const showDropdown = ref(false)
const copyDone = ref(false)
const saveAsError = ref<string | null>(null)
const ossIncomplete = ref(false)
const getNoteIncomplete = ref(false)
const getNoteSaving = ref(false)
const getNoteSuccess = ref(false)
const getNoteError = ref<string | null>(null)
const subDir = ref('')
const imageMode = ref<'local' | 'oss'>('local')

const editableTitle = ref('')
const editableSource = ref('')
const editableAuthor = ref('')
const editablePublished = ref('')
const editableCreated = ref('')
const editableDescription = ref('')
const editableTags = ref('')

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
  subDir.value = settings.subDir
  imageMode.value = settings.imageMode
  getNoteIncomplete.value = !settings.getNote.clientId.trim() || !settings.getNote.authToken.trim()
  if (settings.imageMode === 'oss') {
    const cfg = settings.aliyunOSS
    ossIncomplete.value = !cfg.accessKeyId.trim() || !cfg.accessKeySecret.trim() || !cfg.bucket.trim()
  }
  updateChecker.check()
})

const doc = computed(() => docContent.doc.value)
const hasDoc = computed(() => doc.value !== null || docContent.isLoading.value)

const sourceLabel = computed(() => {
  const source = doc.value?.source ?? ''
  if (source.includes('feishu.cn')) return '飞书 · 文章'
  if (source.includes('kdocs.cn')) return '金山文档 · 文章'
  return '网页 · 文章'
})

const previewText = computed(() => {
  if (!doc.value) return ''
  if (doc.value.markdown !== undefined) {
    return doc.value.markdown
      .split('\n')
      .filter(line => line.trim())
      .join('\n')
  }
  return doc.value.blocks
    .filter(b => b.spans)
    .map(b => b.spans!.map(s => s.text).join(''))
    .filter(line => line.trim())
    .join('\n')
})

function mergedDoc() {
  const tags = editableTags.value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  return {
    ...doc.value!,
    title: editableTitle.value || doc.value!.title,
    source: editableSource.value,
    author: editableAuthor.value || undefined,
    published: editablePublished.value || undefined,
    created: editableCreated.value,
    description: editableDescription.value || undefined,
    tags: tags.length > 0 ? tags : undefined,
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
  copyDone.value = true
  setTimeout(() => { copyDone.value = false }, 2000)
}

async function handleSaveAs() {
  if (!vault.handle.value || !doc.value) return
  saveAsError.value = null
  try {
    const selected = await window.showDirectoryPicker({ mode: 'readwrite' })
    await fileSave.save(vault.handle.value, mergedDoc(), selected)
    showDropdown.value = false
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    showDropdown.value = false
    saveAsError.value = e instanceof Error ? e.message : String(e)
  }
}

async function handleSaveToGetNote() {
  if (!doc.value || getNoteSaving.value) return

  getNoteError.value = null
  getNoteSuccess.value = false
  getNoteSaving.value = true

  try {
    const settings = await getSettings()
    const clientId = settings.getNote.clientId.trim()
    const authToken = settings.getNote.authToken.trim()
    getNoteIncomplete.value = !clientId || !authToken
    if (!clientId || !authToken) {
      throw new Error('请先在设置中填写 Get 笔记的 X-Client-ID 和 Authorization')
    }

    const currentDoc = mergedDoc()
    if (!currentDoc.source.trim()) {
      throw new Error('当前文章缺少可保存的链接')
    }

    await saveLinkNote({
      clientId,
      authToken,
      linkUrl: currentDoc.source,
      tags: currentDoc.tags,
    })

    getNoteSuccess.value = true
  } catch (e) {
    getNoteError.value = e instanceof Error ? e.message : String(e)
  } finally {
    getNoteSaving.value = false
  }
}

function openSettings() {
  browser.tabs.create({ url: '/options.html' })
}

function openBookmarks() {
  browser.tabs.create({ url: browser.runtime.getURL('/bookmarks.html') })
}

async function handleSubDirBlur() {
  const settings = await getSettings()
  await saveSettings({ ...settings, subDir: subDir.value })
}
</script>

<template>
  <div class="popup">
    <!-- 版本更新提示 -->
    <div v-if="updateChecker.updateAvailable.value" class="update-banner">
      🔔 有新版本 v{{ updateChecker.latestVersion.value }} 可用
      <a :href="updateChecker.releaseUrl.value" target="_blank" class="update-link">查看更新</a>
    </div>
    <!-- 非支持页 / 提取失败 -->
    <div v-if="!hasDoc && !docContent.isLoading.value" class="empty-state">
      <p v-if="docContent.error.value" class="error-msg" style="white-space: pre-line">{{ docContent.error.value }}</p>
      <p v-else>当前页面不支持提取，如果是刚安装完插件，请刷新页面后，在重新点击插件提取内容。</p>
    </div>

    <!-- 加载中 -->
    <div v-else-if="docContent.isLoading.value" class="loading">
      <p>正在提取文档内容…</p>
    </div>

    <!-- 主界面 -->
    <template v-else-if="doc">
      <!-- 标题 + 设置入口 -->
      <div class="title-row">
        <span class="header-brand">{{ sourceLabel }}</span>
        <span class="header-version">v{{ version }}</span>
        <button class="btn-settings" @click="openSettings">设置</button>
        <button class="btn-bookmarks" @click="openBookmarks">标签管理</button>
      </div>

      <div class="doc-meta">
        <h2 class="doc-title">{{ doc.title }}</h2>
      </div>

      <!-- 中间可滚动区域 -->
      <div class="middle">

      <!-- 属性面板 -->
      <div class="properties">
        <div v-if="propertiesOpen" class="properties-body">
          <div class="prop-row">
            <span class="prop-label">标题</span>
            <input v-model="editableTitle" class="prop-input" />
          </div>
          <div class="prop-row">
            <span class="prop-label">来源</span>
            <input v-model="editableSource" class="prop-input" />
          </div>
          <div class="prop-row">
            <span class="prop-label">作者</span>
            <input v-model="editableAuthor" class="prop-input" />
          </div>
          <div class="prop-row">
            <span class="prop-label">发布时间</span>
            <input v-model="editablePublished" class="prop-input" />
          </div>
          <div class="prop-row">
            <span class="prop-label">创建时间</span>
            <input v-model="editableCreated" class="prop-input" />
          </div>
          <div class="prop-row prop-row-desc">
            <span class="prop-label">描述</span>
            <textarea v-model="editableDescription" class="prop-textarea" rows="3" />
          </div>
          <div class="prop-row">
            <span class="prop-label">标签</span>
            <input v-model="editableTags" class="prop-input" />
          </div>
        </div>
      </div>

      <!-- 内容预览 -->
      <textarea class="preview" readonly :value="previewText" />

      </div><!-- end .middle -->

      <!-- 底部操作区 -->
      <div class="footer">
        <template v-if="!vault.isAuthorized.value && !vault.needsReauth.value && !vault.isLoading.value">
          <p class="warn-msg">请先在设置中配置 Vault 目录</p>
          <button class="btn-authorize" @click="openSettings">去设置</button>
        </template>

        <template v-else-if="vault.needsReauth.value">
          <button class="btn-authorize" @click="vault.reauthorize()">点击授权访问 Vault</button>
        </template>

        <template v-else-if="ossIncomplete">
          <p class="warn-msg">OSS 配置不完整</p>
          <button class="btn-authorize" @click="openSettings">去设置</button>
        </template>

        <template v-else>
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
              <button @click="handleCopy">{{ copyDone ? '✓ 已复制' : '复制 Markdown' }}</button>
              <button @click="handleSaveAs">另存为</button>
            </div>
          </div>
        </template>

        <button
          class="btn-get-note"
          :disabled="getNoteSaving || getNoteIncomplete"
          @click="handleSaveToGetNote"
        >
          {{ getNoteSaving ? '保存中…' : '保存链接到 Get 笔记' }}
        </button>
        <p v-if="getNoteIncomplete" class="warn-msg">请先在设置中配置 Get 笔记</p>

        <!-- 保存结果 -->
        <p v-if="fileSave.savedFilename.value" class="success">
          ✓ 已保存：{{ fileSave.savedFilename.value }}
        </p>
        <p v-if="getNoteSuccess" class="success">✓ 已保存到 Get 笔记</p>
        <p v-if="fileSave.error.value" class="error-msg">{{ fileSave.error.value }}</p>
        <p v-if="getNoteError" class="error-msg">{{ getNoteError }}</p>
        <p v-if="saveAsError" class="error-msg">{{ saveAsError }}</p>
      </div>
    </template>
  </div>
</template>

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
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--color-text);
  flex: 1;
}
.header-version {
  font-size: 11px;
  color: var(--color-text-muted);
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.btn-settings {
  font-size: 14px;
  background: var(--color-dark);
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.btn-settings:hover { opacity: 0.8; }
.btn-bookmarks {
  font-size: 14px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.btn-bookmarks:hover { opacity: 0.85; }

/* Doc title area */
.doc-meta { padding: 10px 0 0; flex-shrink: 0; }
.doc-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 3px;
  line-height: 1.4;
}
.doc-source {
  font-size: 14px;
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
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.5px;
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
  width: 60px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-align: right;
  flex-shrink: 0;
  white-space: nowrap;
}
.prop-input {
  flex: 1;
  min-width: 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
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
  font-size: 14px;
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
  font-size: 14px;
  color: var(--color-text-secondary);
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
  gap: 8px;
  padding: 10px 0 14px;
  border-top: 1px solid var(--color-border-light);
}
.save-row {
  display: flex;
  gap: 0;
  position: relative;
  overflow: visible;
}
.btn-save {
  flex: 1;
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15px;
  cursor: pointer;
  border-radius: 2px 0 0 2px;
  font-family: var(--font-ui);
  transition: background-color 0.18s ease, opacity 0.18s ease;
}
.btn-save:hover { background: #b86425; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-get-note {
  width: 100%;
  background: var(--color-surface);
  color: var(--color-accent);
  border: 1px solid rgba(196, 116, 47, 0.22);
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1px;
  cursor: pointer;
  border-radius: 2px;
  font-family: var(--font-ui);
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}
.btn-get-note:hover {
  background: rgba(196, 116, 47, 0.08);
  border-color: rgba(196, 116, 47, 0.4);
}
.btn-get-note:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-dropdown {
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-left: 1px solid rgba(255,255,255,0.12);
  width: 32px;
  padding: 0;
  cursor: pointer;
  border-radius: 0 2px 2px 0;
  flex: 0 0 32px;
  transition: background-color 0.18s ease, opacity 0.18s ease;
}
.btn-dropdown:hover { background: #b86425; }
.dropdown {
  position: absolute;
  bottom: 36px;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  z-index: 10;
  min-width: 140px;
  overflow: hidden;
}
.dropdown button {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
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
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1px;
  cursor: pointer;
  font-family: var(--font-ui);
}
.btn-authorize:hover { opacity: 0.85; }
.warn-msg { color: #b45309; font-size: 14px; margin: 0; }
.success { color: #2e7d32; font-size: 14px; margin: 0; }
.error-msg { color: #c62828; font-size: 14px; margin: 0; }
.loading, .empty-state {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}
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

/* Update banner */
.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff8e1;
  border-bottom: 1px solid #ffe082;
  padding: 6px 16px;
  font-size: 12px;
  color: #5d4037;
  margin: 0 -16px;
  flex-shrink: 0;
}
.update-link {
  color: var(--color-accent);
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
}
.update-link:hover { text-decoration: underline; }
</style>
