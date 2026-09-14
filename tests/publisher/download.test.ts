import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadPublisherArtifact } from '../../src/publisher/download'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('publisher artifact download adapter', () => {
  it('downloads through a temporary in-document anchor and revokes its URL', async () => {
    vi.useFakeTimers()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      expect(document.querySelector('a[download="card.png"]')).not.toBeNull()
    })

    await downloadPublisherArtifact({ blob: new Blob(['png']), fileName: 'card.png' })

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download="card.png"]')).toBeNull()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('cleans up the anchor and Blob URL when clicking fails', async () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-export')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked')
    })

    await expect(downloadPublisherArtifact({ blob: new Blob(['png']), fileName: 'card.png' }))
      .rejects.toThrow('download blocked')

    expect(document.querySelector('a[download="card.png"]')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed-export')
  })
})
