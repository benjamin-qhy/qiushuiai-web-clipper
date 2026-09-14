<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { AIModelSelection, AIPlatformConfig } from '../../../src/storage/settings'
import {
  getModelOptions,
  getProviderOptions,
  type AIReasoningLevel,
} from '../../../src/ai/catalog'
import { createAIProvider } from '../../../src/ai'

const platforms = defineModel<AIPlatformConfig[]>('platforms', { required: true })
const lastUsedModel = defineModel<AIModelSelection | null>('lastUsedModel', { required: true })
const emit = defineEmits<{
  save: []
  'update:lastUsedModel': [value: AIModelSelection | null]
}>()

const providerOptions = getProviderOptions()
const selectedModelKey = ref('')
const reasoningLevel = ref<AIReasoningLevel>('off')
const testPrompt = ref('请回复：连接成功')
const testStatus = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const testResult = ref('')
const visibleKeys = ref<Set<string>>(new Set())

function modelKey(platformId: string, modelId: string) {
  return JSON.stringify([platformId, modelId])
}

function parseModelKey(key: string): AIModelSelection | null {
  try {
    const value = JSON.parse(key) as unknown
    if (!Array.isArray(value) || value.length !== 2) return null
    const [platformId, modelId] = value
    if (typeof platformId !== 'string' || typeof modelId !== 'string') return null
    return { platformId, modelId }
  } catch {
    return null
  }
}

function providerName(providerId: string) {
  return providerOptions.find(option => option.id === providerId)?.name ?? providerId
}

const modelGroups = computed(() => platforms.value.map(platform => ({
  platform,
  label: providerName(platform.provider),
  models: getModelOptions(platform).map(model => ({
    ...model,
    key: modelKey(platform.id, model.id),
  })),
})).filter(group => group.models.length > 0))
const selectedSelection = computed(() => parseModelKey(selectedModelKey.value))
const selectedPlatform = computed(() => platforms.value.find(
  platform => platform.id === selectedSelection.value?.platformId,
))
const selectedModel = computed(() => selectedPlatform.value
  ? getModelOptions(selectedPlatform.value).find(
      model => model.id === selectedSelection.value?.modelId,
    )
  : undefined,
)
const reasoningOptions = computed(() => selectedModel.value?.reasoningLevels ?? [])

function providerOptionsFor(platform: AIPlatformConfig) {
  const configured = new Set(
    platforms.value
      .filter(item => item.id !== platform.id)
      .map(item => item.provider),
  )
  return providerOptions.filter(option => !configured.has(option.id))
}

function addPlatform() {
  const configured = new Set(platforms.value.map(platform => platform.provider))
  const provider = providerOptions.find(option => !configured.has(option.id))
  if (!provider) return

  const platform: AIPlatformConfig = {
    id: crypto.randomUUID(),
    provider: provider.id,
    apiKey: '',
    customModels: provider.id === 'openai-compatible' ? [''] : [],
  }
  platforms.value = [...platforms.value, platform]
  const firstModel = getModelOptions(platform)[0]
  selectedModelKey.value = firstModel ? modelKey(platform.id, firstModel.id) : ''
  resetTest()
}

function removePlatform(platformId: string) {
  platforms.value = platforms.value.filter(platform => platform.id !== platformId)
  if (lastUsedModel.value?.platformId === platformId) lastUsedModel.value = null
  resetTest()
}

function changeProvider(platform: AIPlatformConfig, provider: string) {
  platform.provider = provider
  platform.baseUrl = provider === 'openai-compatible' ? '' : undefined
  platform.customModels = provider === 'openai-compatible' ? [''] : []
  const firstModel = getModelOptions(platform)[0]
  selectedModelKey.value = firstModel ? modelKey(platform.id, firstModel.id) : ''
  resetTest()
}

function updateCustomModels(platform: AIPlatformConfig, value: string) {
  platform.customModels = value.split(',').map(model => model.trim()).filter(Boolean)
  resetTest()
}

function toggleKey(platformId: string) {
  const next = new Set(visibleKeys.value)
  if (next.has(platformId)) next.delete(platformId)
  else next.add(platformId)
  visibleKeys.value = next
}

function resetTest() {
  testStatus.value = 'idle'
  testResult.value = ''
}

watch(
  [platforms, lastUsedModel],
  () => {
    const availableKeys = new Set(
      modelGroups.value.flatMap(group => group.models.map(model => model.key)),
    )
    if (availableKeys.has(selectedModelKey.value)) return

    const preferredKey = lastUsedModel.value
      ? modelKey(lastUsedModel.value.platformId, lastUsedModel.value.modelId)
      : ''
    selectedModelKey.value = availableKeys.has(preferredKey)
      ? preferredKey
      : modelGroups.value[0]?.models[0]?.key ?? ''
  },
  { immediate: true, deep: true },
)

watch(selectedModelKey, resetTest)

watch(selectedModel, () => {
  if (
    reasoningLevel.value !== 'off'
    && (!selectedModel.value?.reasoning || !reasoningOptions.value.includes(reasoningLevel.value))
  ) {
    reasoningLevel.value = 'off'
  }
  resetTest()
})

async function sendTestInstruction() {
  const platform = selectedPlatform.value
  if (!platform) {
    testStatus.value = 'fail'
    testResult.value = '请先添加并选择平台'
    return
  }
  if (!selectedSelection.value) {
    testStatus.value = 'fail'
    testResult.value = '请选择模型'
    return
  }
  if (!testPrompt.value.trim()) {
    testStatus.value = 'fail'
    testResult.value = '请输入测试指令'
    return
  }

  testStatus.value = 'testing'
  testResult.value = ''
  try {
    const provider = createAIProvider(platform, selectedSelection.value.modelId, reasoningLevel.value)
    testResult.value = await provider.complete(
      testPrompt.value.trim(),
      undefined,
      { responseFormat: 'text' },
    )
    testStatus.value = 'ok'
    emit('update:lastUsedModel', {
      platformId: platform.id,
      modelId: selectedSelection.value.modelId,
    })
    await nextTick()
    emit('save')
  } catch (error) {
    testStatus.value = 'fail'
    testResult.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <section id="section-models" class="model-settings-section">
    <div class="section-header">
      <h2>模型配置</h2>
      <p>配置模型平台，并从平台目录中选择具体模型。</p>
    </div>

    <div v-for="(platform, index) in platforms" :key="platform.id" class="platform-card">
      <div class="card-header">
        <strong>平台 {{ index + 1 }}</strong>
        <button class="text-danger" type="button" @click="removePlatform(platform.id)">删除</button>
      </div>
      <label>
        <span>模型平台</span>
        <select :value="platform.provider" @change="changeProvider(platform, ($event.target as HTMLSelectElement).value)">
          <option v-for="option in providerOptionsFor(platform)" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </select>
      </label>
      <label>
        <span>API Key</span>
        <span class="secret-row">
          <input v-model="platform.apiKey" :type="visibleKeys.has(platform.id) ? 'text' : 'password'" autocomplete="off" />
          <button type="button" @click="toggleKey(platform.id)">{{ visibleKeys.has(platform.id) ? '隐藏' : '显示' }}</button>
        </span>
      </label>
      <template v-if="platform.provider === 'openai-compatible'">
        <label>
          <span>接口地址</span>
          <input v-model="platform.baseUrl" placeholder="https://api.example.com/v1" />
        </label>
        <label>
          <span>模型型号</span>
          <input :value="platform.customModels.join(', ')" placeholder="model-a, model-b" @input="updateCustomModels(platform, ($event.target as HTMLInputElement).value)" />
        </label>
      </template>
    </div>

    <button class="add-button" type="button" @click="addPlatform">+ 添加平台</button>

    <div class="test-panel">
      <h3>发送测试指令</h3>
      <div class="test-grid">
        <label>
          <span>选择模型</span>
          <select v-model="selectedModelKey">
            <option value="" disabled>请选择模型</option>
            <optgroup v-for="group in modelGroups" :key="group.platform.id" :label="group.label">
              <option v-for="model in group.models" :key="model.key" :value="model.key">{{ model.name }}</option>
            </optgroup>
          </select>
        </label>
        <label>
          <span>推理程度</span>
          <select v-model="reasoningLevel">
            <option value="off">关闭</option>
            <option v-for="level in reasoningOptions" :key="level" :value="level">
              {{ { minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' }[level] }}
            </option>
          </select>
        </label>
      </div>
      <label>
        <span>测试指令</span>
        <textarea v-model="testPrompt" rows="3" />
      </label>
      <button class="send-button" type="button" :disabled="testStatus === 'testing'" @click="sendTestInstruction">
        {{ testStatus === 'testing' ? '发送中…' : '发送测试' }}
      </button>
      <pre v-if="testResult" :class="['test-result', testStatus]">{{ testResult }}</pre>
    </div>
  </section>
</template>

<style scoped>
.model-settings-section { padding: 28px 40px; }
.section-header { margin-bottom: 20px; }
.section-header h2 { margin: 0 0 3px; font-size: 14px; }
.section-header p { margin: 0; color: var(--color-text-muted); font-size: 14px; }
.platform-card, .test-panel {
  max-width: 620px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: 4px;
}
.card-header { display: flex; justify-content: space-between; margin-bottom: 14px; }
label { display: block; margin-bottom: 14px; }
label > span:first-child { display: block; margin-bottom: 6px; color: var(--color-text-muted); font-size: 14px; font-weight: 600; }
input, select, textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  font: inherit;
}
textarea { resize: vertical; line-height: 1.5; }
.secret-row { display: flex; gap: 8px; }
.secret-row input { flex: 1; }
button { cursor: pointer; font: inherit; }
.secret-row button, .add-button {
  padding: 7px 14px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 2px;
}
.text-danger { padding: 0; color: #c62828; background: none; border: 0; }
.test-panel { margin-top: 24px; }
.test-panel h3 { margin: 0 0 14px; font-size: 14px; }
.test-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.send-button { padding: 8px 18px; color: #fff; background: var(--color-accent); border: 0; border-radius: 2px; }
.send-button:disabled { cursor: not-allowed; opacity: 0.5; }
.test-result { white-space: pre-wrap; margin: 14px 0 0; padding: 12px; background: var(--color-bg); border-radius: 2px; font-size: 13px; }
.test-result.ok { color: #2e7d32; }
.test-result.fail { color: #c62828; }
</style>
