import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../storage/settings'
import type { Settings } from '../storage/settings'

export function useSettings() {
  const settings = ref<Settings>({
    ...DEFAULT_SETTINGS,
    aliyunOSS: { ...DEFAULT_SETTINGS.aliyunOSS },
    aiPlatforms: DEFAULT_SETTINGS.aiPlatforms.map(platform => ({
      ...platform,
      customModels: [...platform.customModels],
    })),
    lastUsedAIModel: DEFAULT_SETTINGS.lastUsedAIModel
      ? { ...DEFAULT_SETTINGS.lastUsedAIModel }
      : null,
    systemPrompts: DEFAULT_SETTINGS.systemPrompts.map(prompt => ({ ...prompt })),
    getNote: { ...DEFAULT_SETTINGS.getNote },
  })
  const isSaving = ref(false)
  const saveStatus = ref<'idle' | 'saved' | 'error'>('idle')
  let resetStatusTimer: ReturnType<typeof setTimeout> | undefined
  let latestSaveId = 0
  let pendingSave: { id: number; snapshot: Settings } | undefined
  let saveQueue: Promise<void> | undefined
  let isDisposed = false

  async function load() {
    settings.value = await getSettings()
  }

  function getSettingsSnapshot(): Settings {
    return {
      ...settings.value,
      aliyunOSS: { ...settings.value.aliyunOSS },
      aiPlatforms: settings.value.aiPlatforms.map(platform => ({
        ...platform,
        customModels: [...platform.customModels],
      })),
      lastUsedAIModel: settings.value.lastUsedAIModel
        ? { ...settings.value.lastUsedAIModel }
        : null,
      systemPrompts: settings.value.systemPrompts.map(prompt => ({ ...prompt })),
      getNote: { ...settings.value.getNote },
    }
  }

  function clearResetStatusTimer() {
    if (resetStatusTimer !== undefined) {
      clearTimeout(resetStatusTimer)
      resetStatusTimer = undefined
    }
  }

  function scheduleResetStatus(saveId: number) {
    if (isDisposed) {
      return
    }
    clearResetStatusTimer()
    resetStatusTimer = setTimeout(() => {
      if (isDisposed || saveId !== latestSaveId) {
        resetStatusTimer = undefined
        return
      }
      saveStatus.value = 'idle'
      resetStatusTimer = undefined
    }, 2000)
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      isDisposed = true
      latestSaveId += 1
      clearResetStatusTimer()
    })
  }

  function flushPendingSaves() {
    if (saveQueue) {
      return saveQueue
    }

    saveQueue = (async () => {
      try {
        while (pendingSave) {
          const currentSave = pendingSave
          pendingSave = undefined

          try {
            await saveSettings(currentSave.snapshot)
            if (isDisposed || currentSave.id !== latestSaveId) {
              continue
            }
            saveStatus.value = 'saved'
            scheduleResetStatus(currentSave.id)
          } catch {
            if (isDisposed || currentSave.id !== latestSaveId) {
              continue
            }
            saveStatus.value = 'error'
          }
        }
      } finally {
        saveQueue = undefined
        if (!isDisposed && !pendingSave) {
          isSaving.value = false
        }
      }
    })()

    return saveQueue
  }

  async function save() {
    if (isDisposed) {
      return
    }
    pendingSave = { id: ++latestSaveId, snapshot: getSettingsSnapshot() }
    isSaving.value = true
    clearResetStatusTimer()
    await flushPendingSaves()
  }

  return { settings, isSaving, saveStatus, load, save }
}
