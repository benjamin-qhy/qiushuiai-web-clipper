import { ref } from 'vue'
import { browser } from 'wxt/browser'

const VERSION_URL = 'http://version.qiushui.me/qiushuiai-web-clipper.json'

interface RemoteVersion {
  version: string
  releaseUrl: string
  notes?: string
}

function isNewer(remote: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [rMaj = 0, rMin = 0, rPat = 0] = parse(remote)
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current)
  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPat > cPat
}

export function useUpdateChecker() {
  const updateAvailable = ref(false)
  const latestVersion = ref('')
  const releaseUrl = ref('')

  async function check() {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    try {
      const res = await fetch(VERSION_URL, { signal: controller.signal })
      if (!res.ok) return
      const data: RemoteVersion = await res.json()
      const current = browser.runtime.getManifest().version
      if (isNewer(data.version, current)) {
        updateAvailable.value = true
        latestVersion.value = data.version
        releaseUrl.value = data.releaseUrl
      }
    } catch {
      // 网络失败或超时静默忽略
    } finally {
      clearTimeout(timeout)
    }
  }

  return { updateAvailable, latestVersion, releaseUrl, check }
}
