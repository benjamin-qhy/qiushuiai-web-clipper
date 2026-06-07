import { ref } from 'vue'
import { getVaultHandle, setVaultHandle, clearVaultHandle } from '../storage/vault'

export function useVaultStore() {
  const handle = ref<FileSystemDirectoryHandle | null>(null)
  const isAuthorized = ref(false)
  const isLoading = ref(true)
  const needsReauth = ref(false)

  async function init() {
    isLoading.value = true
    try {
      const stored = await getVaultHandle()
      if (!stored) return
      const permission = await stored.queryPermission({ mode: 'readwrite' })
      if (permission === 'granted') {
        handle.value = stored
        isAuthorized.value = true
      } else {
        // 有 handle 但权限已过期（如浏览器重启），保留 handle 等待用户手势重新授权
        handle.value = stored
        needsReauth.value = true
      }
    } finally {
      isLoading.value = false
    }
  }

  // 首次选择目录，需要完整的目录选择器
  async function authorize() {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' })
    await setVaultHandle(dir)
    handle.value = dir
    isAuthorized.value = true
    needsReauth.value = false
  }

  // 浏览器重启后重新授权，不需要重新选目录，只弹小授权栏
  async function reauthorize() {
    if (!handle.value) return
    const permission = await handle.value.requestPermission({ mode: 'readwrite' })
    if (permission === 'granted') {
      isAuthorized.value = true
      needsReauth.value = false
    }
  }

  // 更换 vault 目录
  async function changeVault() {
    await clearVaultHandle()
    handle.value = null
    isAuthorized.value = false
    needsReauth.value = false
    await authorize()
  }

  return { handle, isAuthorized, isLoading, needsReauth, init, authorize, reauthorize, changeVault }
}
