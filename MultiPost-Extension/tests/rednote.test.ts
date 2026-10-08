import { expect, it, vi } from 'vitest'
import { DynamicRednote } from '../src/sync/dynamic/rednote'

it('refuses uncontrolled auto-publication before touching any page or network', async () => {
  const query = vi.spyOn(document, 'querySelector'); const fetcher = vi.spyOn(globalThis, 'fetch')
  try {
    await expect(DynamicRednote({ platforms: [], isAutoPublish: true, data: { title: '测试', content: '正文', images: [], videos: [] } })).rejects.toThrow('SUBMIT_INTENT_REQUIRED')
    expect(query).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
  } finally { query.mockRestore(); fetcher.mockRestore() }
})
it('rejects missing images and unsupported fields instead of dropping content', async () => {
  const base = { platforms: [], isAutoPublish: false, data: { title: '测试', content: '完整正文', images: [], videos: [] } }
  await expect(DynamicRednote(base)).rejects.toThrow('MISSING_REQUIRED_FIELD')
  await expect(DynamicRednote({ ...base, data: { ...base.data, images: [{ name: 'test.png', url: 'blob:local' }], tags: ['话题'] } })).rejects.toThrow('UNSUPPORTED_FIELD')
})
