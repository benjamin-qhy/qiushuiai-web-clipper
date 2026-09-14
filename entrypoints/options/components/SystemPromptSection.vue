<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SystemPrompt } from '../../../src/storage/settings'

const prompts = defineModel<SystemPrompt[]>('prompts', { required: true })

const editingId = ref<string | null>(null)
const formTitle = ref('')
const formContent = ref('')
const titleError = ref('')
const contentError = ref('')
const isFormVisible = ref(false)

const formHeading = computed(() => editingId.value ? '编辑提示词' : '新增提示词')

function promptPreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized
}

function resetForm() {
  editingId.value = null
  formTitle.value = ''
  formContent.value = ''
  titleError.value = ''
  contentError.value = ''
  isFormVisible.value = false
}

function startNewPrompt() {
  editingId.value = null
  formTitle.value = ''
  formContent.value = ''
  titleError.value = ''
  contentError.value = ''
  isFormVisible.value = true
}

function startEdit(prompt: SystemPrompt) {
  editingId.value = prompt.id
  formTitle.value = prompt.title
  formContent.value = prompt.content
  titleError.value = ''
  contentError.value = ''
  isFormVisible.value = true
}

function savePrompt() {
  const title = formTitle.value.trim()
  const content = formContent.value.trim()
  titleError.value = title ? '' : '请输入标题'
  contentError.value = content ? '' : '请输入提示词内容'
  if (!title || !content) return

  const prompt: SystemPrompt = {
    id: editingId.value ?? crypto.randomUUID(),
    title,
    content,
  }
  prompts.value = editingId.value
    ? prompts.value.map(item => item.id === editingId.value ? prompt : item)
    : [...prompts.value, prompt]
  resetForm()
}
</script>

<template>
  <section class="system-prompt-section">
    <div class="section-header">
      <h2>系统提示词管理</h2>
      <p>维护可复用的本地提示词，不会自动应用到模型请求。</p>
    </div>

    <div class="prompt-list">
      <h3>已添加提示词</h3>
      <p v-if="prompts.length === 0" class="empty-state">暂无提示词</p>
      <div v-for="prompt in prompts" :key="prompt.id" class="prompt-card">
        <div>
          <strong>{{ prompt.title }}</strong>
          <p>{{ promptPreview(prompt.content) }}</p>
        </div>
        <button class="text-button" type="button" @click="startEdit(prompt)">编辑</button>
      </div>
    </div>

    <button v-if="!isFormVisible" class="add-button" type="button" @click="startNewPrompt">+ 新增提示词</button>

    <form v-else class="prompt-form" @submit.prevent="savePrompt">
      <h3>{{ formHeading }}</h3>
      <label>
        <span>标题</span>
        <input v-model="formTitle" autocomplete="off" />
        <span v-if="titleError" class="field-error">{{ titleError }}</span>
      </label>
      <label>
        <span>提示词内容</span>
        <textarea v-model="formContent" rows="6" />
        <span v-if="contentError" class="field-error">{{ contentError }}</span>
      </label>
      <div class="form-actions">
        <button class="save-button" type="submit">保存</button>
        <button class="cancel-button" type="button" @click="resetForm">取消</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.system-prompt-section { padding: 28px 40px; }
.section-header { margin-bottom: 20px; }
.section-header h2, .prompt-list h3, .prompt-form h3 { margin: 0 0 3px; font-size: 14px; }
.section-header p { margin: 0; color: var(--color-text-muted); font-size: 14px; }
.prompt-list, .prompt-form { max-width: 620px; margin-bottom: 16px; padding: 16px; background: var(--color-surface); border: 1px solid var(--color-border-light); border-radius: 4px; }
.prompt-list h3, .prompt-form h3 { margin-bottom: 14px; }
.empty-state { margin: 0; color: var(--color-text-muted); font-size: 14px; }
.prompt-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--color-border-light); }
.prompt-card strong { display: block; font-size: 14px; }
.prompt-card p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.5; }
label { display: block; margin-bottom: 14px; }
label > span:first-child { display: block; margin-bottom: 6px; color: var(--color-text-muted); font-size: 14px; font-weight: 600; }
input, textarea { box-sizing: border-box; width: 100%; padding: 8px 10px; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 2px; font: inherit; }
textarea { resize: vertical; line-height: 1.5; }
button { cursor: pointer; font: inherit; }
.add-button, .cancel-button { padding: 7px 14px; color: var(--color-text-secondary); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 2px; }
.text-button { padding: 0; color: var(--color-accent); background: none; border: 0; }
.save-button { padding: 8px 18px; color: #fff; background: var(--color-accent); border: 0; border-radius: 2px; }
.form-actions { display: flex; gap: 8px; }
.field-error { display: block; margin-top: 6px; color: #c62828; font-size: 13px; }
</style>
