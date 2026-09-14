import type { DownloadArtifact } from '@qiushui/content-publishing-workbench'

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('导出已取消', 'AbortError')
}

export async function downloadPublisherArtifact({ blob, fileName, signal }: DownloadArtifact): Promise<void> {
  if (signal?.aborted) throw abortReason(signal)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  let clicked = false
  try {
    anchor.href = url
    anchor.download = fileName
    document.body.append(anchor)
    if (signal?.aborted) throw abortReason(signal)
    anchor.click()
    clicked = true
  } finally {
    anchor.remove()
    if (clicked) globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000)
    else URL.revokeObjectURL(url)
  }
}
