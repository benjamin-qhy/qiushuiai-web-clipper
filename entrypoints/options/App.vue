<script setup lang="ts">
import { browser } from 'wxt/browser'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSettings } from '../../src/composables/useSettings'
import { useVaultStore } from '../../src/composables/useVaultStore'
import { computeSharedImagePath } from '../../src/filesystem/paths'
import ModelConfigSection from './components/ModelConfigSection.vue'
import SystemPromptSection from './components/SystemPromptSection.vue'

const { settings, isSaving, saveStatus, load, save } = useSettings()
const vault = useVaultStore()

const showSecret = ref(false)
const showGetNoteSecret = ref(false)
const testStatus = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const testError = ref('')
const dirPickerError = ref('')

const ossRegions = [
  { value: 'oss-cn-hangzhou', label: '华东1（杭州）' },
  { value: 'oss-cn-shanghai', label: '华东2（上海）' },
  { value: 'oss-cn-beijing', label: '华北2（北京）' },
  { value: 'oss-cn-shenzhen', label: '华南1（深圳）' },
  { value: 'oss-cn-chengdu', label: '西南1（成都）' },
  { value: 'oss-cn-hongkong', label: '中国香港' },
]

const version = browser.runtime.getManifest().version
const mainEl = ref<HTMLElement | null>(null)
const activeSection = ref('vault')
const sectionIds = ['vault', 'images', 'get-note', 'models']

let observer: IntersectionObserver | null = null

function scrollTo(id: string) {
  const el = document.getElementById(`section-${id}`)
  if (el && mainEl.value) {
    const top = el.getBoundingClientRect().top - mainEl.value.getBoundingClientRect().top + mainEl.value.scrollTop - 16
    mainEl.value.scrollTo({ top, behavior: 'smooth' })
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
    { root: mainEl.value, threshold: 0, rootMargin: '-10% 0px -80% 0px' }
  )
  for (const id of sectionIds) {
    const el = document.getElementById(`section-${id}`)
    if (el) observer.observe(el)
  }
}

onUnmounted(() => observer?.disconnect())

onMounted(async () => {
  await load()
  await vault.init()
  await nextTick()
  setupObserver()
})

const vaultName = computed(() => vault.handle.value?.name ?? null)
const vaultButtonLabel = computed(() => {
  if (vault.needsReauth.value) return '重新授权'
  return vaultName.value ? '重新选择' : '选择目录'
})

const ossPathPreview = computed(() => {
  const prefix = settings.value.aliyunOSS.prefix.trim().replace(/^\/+|\/+$/g, '')
  const prefixPath = prefix ? `${prefix}/` : ''
  return `${prefixPath}202605/笔记标题-20260509143022583.png`
})

const sharedImagePathPreview = computed(() => {
  const dir = settings.value.imageLocalDir.trim() || 'images'
  return computeSharedImagePath(settings.value.subDir, dir, '笔记标题-20260518143022583.png')
})

function resetTestStatus() {
  testStatus.value = 'idle'
  testError.value = ''
}

function handleVaultAction() {
  if (vault.needsReauth.value) {
    return vault.reauthorize()
  }
  return vault.authorize()
}

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

async function chooseSubDir(target: 'subDir' | 'bookmarkSubDir') {
  dirPickerError.value = ''

  if (!vault.handle.value || !vault.isAuthorized.value) {
    dirPickerError.value = '请先完成笔记库授权后再选择子目录'
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
    settings.value[target] = relativeParts.join('/')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    dirPickerError.value = error instanceof Error ? error.message : String(error)
  }
}

watch(
  () => [
    settings.value.imageMode,
    settings.value.ossProvider,
    settings.value.aliyunOSS.accessKeyId,
    settings.value.aliyunOSS.accessKeySecret,
    settings.value.aliyunOSS.bucket,
    settings.value.aliyunOSS.region,
    settings.value.aliyunOSS.prefix,
    settings.value.aliyunOSS.customDomain,
  ],
  () => {
    resetTestStatus()
  },
)

async function testConnection() {
  const config = settings.value.aliyunOSS
  if (
    !config.accessKeyId.trim() ||
    !config.accessKeySecret.trim() ||
    !config.bucket.trim() ||
    !config.region.trim()
  ) {
    testStatus.value = 'fail'
    testError.value = '请先填写完整的 OSS 连接信息'
    return
  }

  testStatus.value = 'testing'
  testError.value = ''

  try {
    const { AliyunOSSUploader } = await import('../../src/uploader/aliyun')
    const uploader = new AliyunOSSUploader(config)
    const transparentPng1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    await uploader.upload({
      base64: transparentPng1x1,
      mimeType: 'image/png',
      notename: '.connection-test',
      source: 'feishu',
    })

    testStatus.value = 'ok'
  } catch (error) {
    testStatus.value = 'fail'
    testError.value = error instanceof Error ? error.message : String(error)
  }
}

</script>

<template>
  <div class="settings-layout">
    <!-- Left nav -->
    <nav class="settings-nav">
      <div class="nav-header">
        <div class="nav-title">设置</div>
      </div>
      <div class="nav-body">
        <div class="nav-group-label">通用</div>
        <a class="nav-item" :class="{ active: activeSection === 'vault' }" href="#section-vault" @click.prevent="scrollTo('vault')">笔记库</a>
        <a class="nav-item" :class="{ active: activeSection === 'images' }" href="#section-images" @click.prevent="scrollTo('images')">图片</a>
        <div class="nav-group-label">同步</div>
        <a class="nav-item" :class="{ active: activeSection === 'get-note' }" href="#section-get-note" @click.prevent="scrollTo('get-note')">Get 笔记</a>
        <div class="nav-group-label">AI</div>
        <a class="nav-item" :class="{ active: activeSection === 'models' }" href="#section-models" @click.prevent="scrollTo('models')">模型配置</a>
        <div class="bookmark-settings-nav feature-hidden">
          <div class="nav-group-label">书签</div>
          <a class="nav-item" :class="{ active: activeSection === 'org' }" href="#section-org" @click.prevent="scrollTo('org')">整理</a>
        </div>
      </div>
      <div class="nav-footer">v{{ version }}</div>
    </nav>

    <!-- Right content -->
    <main class="settings-main" ref="mainEl">

      <div class="main-topbar">
        <div></div>
        <span v-if="saveStatus === 'saved'" class="status-ok">✓ 已保存</span>
        <span v-else-if="saveStatus === 'error'" class="status-fail">保存失败</span>
        <button class="btn-save" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? '保存中…' : '保存设置' }}
        </button>
      </div>

      <!-- Vault -->
      <section id="section-vault" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">笔记库</h2>
          <p class="section-desc">Obsidian 笔记库配置</p>
        </div>
        <div class="field">
          <label class="field-label">笔记库路径</label>
          <div class="vault-row">
            <span class="vault-name">{{ vaultName ?? '未选择' }}</span>
            <button class="btn-secondary" type="button" @click="handleVaultAction">{{ vaultButtonLabel }}</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="sub-dir">子目录</label>
          <div class="input-action-row">
            <input id="sub-dir" v-model="settings.subDir" class="field-input" placeholder="Clippings" />
            <button class="btn-secondary" type="button" @click="chooseSubDir('subDir')">选择目录</button>
          </div>
          <p class="field-hint">笔记会保存到笔记库下的此子目录，留空则保存到根目录。</p>
        </div>
        <p v-if="dirPickerError" class="status-fail field-inline-error">{{ dirPickerError }}</p>
      </section>

      <div class="section-divider"></div>

      <!-- Images -->
      <section id="section-images" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">图片</h2>
          <p class="section-desc">图片存储方式</p>
        </div>
        <div class="field">
          <label class="field-label">图片模式</label>
          <div class="mode-group">
            <button
              class="mode-btn"
              :class="{ active: settings.imageMode === 'local' }"
              type="button"
              @click="settings.imageMode = 'local'"
            >本地</button>
            <button
              class="mode-btn"
              :class="{ active: settings.imageMode === 'oss' }"
              type="button"
              @click="settings.imageMode = 'oss'"
            >阿里云 OSS</button>
          </div>
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
            <label class="field-label" for="oss-bucket">存储桶</label>
            <input id="oss-bucket" v-model="settings.aliyunOSS.bucket" class="field-input" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field-label" for="oss-region">地域</label>
            <select id="oss-region" v-model="settings.aliyunOSS.region" class="field-input field-select">
              <option v-for="region in ossRegions" :key="region.value" :value="region.value">{{ region.label }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="oss-prefix">路径前缀</label>
            <input id="oss-prefix" v-model="settings.aliyunOSS.prefix" class="field-input" placeholder="qiushui-web-clipper" />
            <p class="field-hint preview-path">{{ ossPathPreview }}</p>
          </div>
          <div class="field">
            <label class="field-label" for="oss-custom-domain">自定义域名</label>
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

      <!-- Get Note -->
      <section id="section-get-note" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Get 笔记</h2>
          <p class="section-desc">保存网页链接到 Get 笔记</p>
        </div>
        <div class="field">
          <label class="field-label" for="get-note-client-id">X-Client-ID</label>
          <input id="get-note-client-id" v-model="settings.getNote.clientId" class="field-input" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="get-note-auth-token">Authorization</label>
          <div class="secret-row">
            <input
              id="get-note-auth-token"
              v-model="settings.getNote.authToken"
              :type="showGetNoteSecret ? 'text' : 'password'"
              class="field-input"
              autocomplete="off"
            />
            <button class="btn-secondary" type="button" @click="showGetNoteSecret = !showGetNoteSecret">
              {{ showGetNoteSecret ? '隐藏' : '显示' }}
            </button>
          </div>
          <p class="field-hint">用于 popup 中"保存链接到 Get 笔记"按钮的接口认证。</p>
        </div>
        <div class="field">
          <label class="field-label" for="get-note-batch-interval">批量保存间隔（秒）</label>
          <input id="get-note-batch-interval" v-model.number="settings.getNote.batchIntervalSeconds" type="number" min="0" step="1" class="field-input" style="max-width: 120px" />
          <p class="field-hint">批量保存时每条之间的等待时间，避免接口限流。默认 1 秒。</p>
        </div>
      </section>

      <div class="section-divider"></div>

      <ModelConfigSection
        v-model:platforms="settings.aiPlatforms"
        v-model:last-used-model="settings.lastUsedAIModel"
        @save="save"
      />

      <div class="section-divider"></div>

      <SystemPromptSection v-model:prompts="settings.systemPrompts" />

      <div class="section-divider"></div>

      <!-- Organization -->
      <section id="section-org" class="settings-section feature-hidden">
        <div class="section-header">
          <h2 class="section-title">整理</h2>
          <p class="section-desc">书签整理配置</p>
        </div>
        <div class="field">
          <label class="field-label" for="bookmark-inbox">收件箱文件夹</label>
          <input id="bookmark-inbox" v-model="settings.bookmarkInboxFolder" class="field-input" placeholder="待整理" />
          <p class="field-hint">将书签收藏到该文件夹后，插件会自动整理其中的内容。</p>
        </div>
        <div class="field">
          <label class="field-label" for="bookmark-sub-dir">Obsidian 子目录</label>
          <div class="input-action-row">
            <input id="bookmark-sub-dir" v-model="settings.bookmarkSubDir" class="field-input" placeholder="Bookmarks" />
            <button class="btn-secondary" type="button" @click="chooseSubDir('bookmarkSubDir')">选择目录</button>
          </div>
          <p class="field-hint">整理后的书签笔记将保存到笔记库下的此子目录中。</p>
        </div>
        <div class="field">
          <label class="field-label" for="ai-system-prompt">系统提示词</label>
          <textarea
            id="ai-system-prompt"
            v-model="settings.bookmarkSystemPrompt"
            class="field-input field-textarea"
            rows="4"
          />
          <p class="field-hint">文件夹结构和输出格式由系统自动附加，此处可追加自定义指令。</p>
        </div>
        <p v-if="dirPickerError" class="status-fail field-inline-error">{{ dirPickerError }}</p>
      </section>

      <div class="section-divider"></div>

      <div class="bottom-save">
        <span v-if="saveStatus === 'saved'" class="status-ok">✓ 已保存</span>
        <span v-else-if="saveStatus === 'error'" class="status-fail">保存失败</span>
        <button class="btn-save" type="button" :disabled="isSaving" @click="save">
          {{ isSaving ? '保存中…' : '保存设置' }}
        </button>
      </div>

    </main>
  </div>
</template>

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
  font-size: 14px;
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
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
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
  font-size: 14px;
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
  font-size: 14px;
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
  gap: 12px;
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
  font-size: 14px;
  color: var(--color-text-muted);
}
.section-divider {
  height: 1px;
  background: var(--color-border-light);
  margin: 0 40px;
}
.field { margin-bottom: 18px; max-width: 520px; }
.field:last-child { margin-bottom: 0; }
.input-action-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.input-action-row .field-input {
  flex: 1;
}
.field-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
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
  font-size: 14px;
  color: var(--color-text);
  font-family: var(--font-ui);
  outline: none;
}
.field-input:focus { border-bottom-color: var(--color-accent); }
.field-select { cursor: pointer; }
.field-hint {
  margin: 6px 0 0;
  font-size: 14px;
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
  font-size: 14px;
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
  font-size: 14px;
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
  font-size: 14px;
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
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  font-family: var(--font-ui);
}
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.status-ok { color: #2e7d32; font-size: 14px; }
.status-fail { color: #c62828; font-size: 14px; word-break: break-word; }
.field-inline-error {
  margin: -8px 0 18px;
  max-width: 520px;
}
.field-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}
.bottom-save {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 24px 40px 40px;
}
.feature-hidden { display: none; }
</style>
