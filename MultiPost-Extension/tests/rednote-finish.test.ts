import { afterEach, expect, it, vi } from 'vitest'
import { finishRednoteEditor } from '../src/sync/dynamic/rednote-finish'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete (globalThis as any).haiqiaiPreparation; delete (globalThis as any).haiqiaiFinish })
it.each(['save_draft', 'publish'] as const)('clicks only the selected action once and confirms its visible receipt (%s)', async finish => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦" value="原题"><div class="tiptap ProseMirror"></div><xhs-publish-btn></xhs-publish-btn>'
  const editor = document.querySelector('.tiptap')!; Object.defineProperty(editor, 'innerText', { value: '原文' })
  const root = document.querySelector('xhs-publish-btn')!.attachShadow({ mode: 'closed' }); root.innerHTML = '<button>暂存离开</button><button>发布</button>'
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: () => root } })
  vi.stubGlobal('haiqiaiPreparation', { id: 'run', finished: true, result: { ok: true }, snapshot: JSON.stringify({ title: '原题', body: '原文', images: [], collection: '', original: false }) })
  const clicks = { save_draft: 0, publish: 0 }
  root.querySelectorAll('button').forEach((button, index) => button.addEventListener('click', () => { clicks[index ? 'publish' : 'save_draft']++; document.body.innerHTML = `<p>${index ? '发布成功' : '保存成功'}</p>` }))
  const input = { runId: 'run', finish, mode: 'execute' as const, deadline: Date.now() + 1000, title: '原题' }
  const result = await finishRednoteEditor(input)
  expect(result.state).toBe(finish === 'save_draft' ? 'draft_saved' : 'submitted')
  expect(clicks).toEqual(finish === 'save_draft' ? { save_draft: 1, publish: 0 } : { save_draft: 0, publish: 1 })
  expect(await finishRednoteEditor(input)).toEqual(result)
  expect(clicks.save_draft + clicks.publish).toBe(1)
})
it('does not click a changed or unverified editor', async () => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<button>发布</button>'
  const click = vi.fn(); document.querySelector('button')!.addEventListener('click', click)
  expect(await finishRednoteEditor({ runId: 'missing', finish: 'publish', mode: 'execute', deadline: Date.now() + 1000, title: '原题' })).toMatchObject({ state: 'outcome_unknown', code: 'PREPARATION_UNVERIFIED' })
  expect(click).not.toHaveBeenCalled()
})

it.each([false, true])('observes late success only while the original editor is unchanged (edited=%s)', async edited => {
  vi.useFakeTimers()
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦" value="原题"><div class="tiptap ProseMirror"></div><button>暂存离开</button>'
  Object.defineProperty(document.querySelector('.tiptap'), 'innerText', { value: '原文' })
  vi.stubGlobal('haiqiaiPreparation', { id: 'late', finished: true, result: { ok: true }, snapshot: JSON.stringify({ title: '原题', body: '原文', images: [], collection: '', original: false }) })
  const click = vi.fn(); document.querySelector('button')!.addEventListener('click', click)
  const input = { runId: 'late', finish: 'save_draft' as const, mode: 'execute' as const, deadline: Date.now() + 30000, title: '原题' }
  const result = finishRednoteEditor(input)
  await vi.advanceTimersByTimeAsync(20000)
  expect(await result).toMatchObject({ state: 'outcome_unknown' })
  if (edited) { document.querySelector('input')!.value = '另一篇'; document.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true })) }
  document.body.innerHTML = '<p>保存成功</p>'
  expect(await finishRednoteEditor({ ...input, mode: 'observe' })).toMatchObject({ state: edited ? 'outcome_unknown' : 'draft_saved' })
  expect(click).toHaveBeenCalledTimes(1)
})

it('refuses a video submission when horizontal and vertical cover slots are swapped', async () => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦" value="原题"><div class="tiptap ProseMirror"></div><video></video><section><span>横版封面</span><input type="file" accept="image/png"><img src="blob:https://creator.xiaohongshu.com/vertical"></section><section><span>竖版封面</span><input type="file" accept="image/png"><img src="blob:https://creator.xiaohongshu.com/horizontal"></section><button>发布</button>'
  Object.defineProperty(document.querySelector('.tiptap'), 'innerText', { value: '原文' })
  for (const span of document.querySelectorAll('span')) span.getBoundingClientRect = () => ({ width: 80 } as DOMRect)
  for (const image of document.querySelectorAll('img')) { Object.defineProperty(image, 'complete', { value: true }); Object.defineProperty(image, 'naturalWidth', { value: 100 }) }
  for (const [key, value] of Object.entries({ currentSrc: 'blob:https://creator.xiaohongshu.com/video', duration: 12, readyState: 2, videoWidth: 1920 })) Object.defineProperty(document.querySelector('video'), key, { value })
  vi.stubGlobal('haiqiaiPreparation', { id: 'video', finished: true, result: { ok: true }, snapshot: JSON.stringify({ title: '原题', body: '原文', images: [], video: 'blob:https://creator.xiaohongshu.com/video', duration: 12, covers: [{ kind: 'horizontal', src: 'blob:https://creator.xiaohongshu.com/horizontal' }, { kind: 'vertical', src: 'blob:https://creator.xiaohongshu.com/vertical' }], collection: '', original: false }) })
  const click = vi.fn(); document.querySelector('button')!.addEventListener('click', click)
  expect(await finishRednoteEditor({ runId: 'video', finish: 'publish', mode: 'execute', deadline: Date.now() + 1000, title: '原题' })).toMatchObject({ code: 'COVER_CONFIRM_UNVERIFIED' })
  expect(click).not.toHaveBeenCalled()
})

it.each([false, true])('accepts duplicate previews only for the same video (different=%s)', async different => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦" value="原题"><div class="tiptap ProseMirror"></div><video></video><video></video><button>暂存离开</button>'
  Object.defineProperty(document.querySelector('.tiptap'), 'innerText', { value: '原文' })
  for (const [index, video] of Array.from(document.querySelectorAll('video')).entries()) {
    for (const [key, value] of Object.entries({ currentSrc: 'blob:https://creator.xiaohongshu.com/' + (different && index ? 'other' : 'video'), duration: 12, readyState: 2, videoWidth: 1920 })) Object.defineProperty(video, key, { value })
  }
  vi.stubGlobal('haiqiaiPreparation', { id: 'preview', finished: true, result: { ok: true }, snapshot: JSON.stringify({ title: '原题', body: '原文', images: [], video: 'blob:https://creator.xiaohongshu.com/video', duration: 12, covers: [], collection: '', original: false }) })
  const click = vi.fn(() => { document.body.innerHTML = '<p>保存成功</p>' }); document.querySelector('button')!.addEventListener('click', click)
  const result = await finishRednoteEditor({ runId: 'preview', finish: 'save_draft', mode: 'execute', deadline: Date.now() + 1000, title: '原题' })
  expect(result.state).toBe(different ? 'outcome_unknown' : 'draft_saved')
  expect(click).toHaveBeenCalledTimes(different ? 0 : 1)
})

it.each([false, true])('accepts original-source proof with player snapshots and rejects a changed source (different=%s)', async different => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦" value="原题"><div class="tiptap ProseMirror"></div><video></video><video></video><button>暂存离开</button>'
  Object.defineProperty(document.querySelector('.tiptap'), 'innerText', { value: '原文' })
  for (const [index, video] of Array.from(document.querySelectorAll('video')).entries()) {
    for (const [key, value] of Object.entries({ currentSrc: 'blob:https://creator.xiaohongshu.com/' + (index ? (different ? 'changed' : 'other') : 'video'), duration: 12, readyState: 2, videoWidth: 1920 })) Object.defineProperty(video, key, { value })
  }
  const original = document.querySelector('video')!; original.className = 'exact-video'; const originalBox = document.createElement('div'); originalBox.className = 'hide-view-for-exact'; original.parentElement!.insertBefore(originalBox, original); originalBox.append(original);
  vi.stubGlobal('haiqiaiPreparation', { id: 'preview', finished: true, result: { ok: true }, snapshot: JSON.stringify({ title: '原题', body: '原文', images: [], video: 'blob:https://creator.xiaohongshu.com/video', duration: 12, videoSources: ['blob:https://creator.xiaohongshu.com/other', 'blob:https://creator.xiaohongshu.com/video'], covers: [], collection: '', original: false }) })
  const click = vi.fn(() => { document.body.innerHTML = '<p>保存成功</p>' }); document.querySelector('button')!.addEventListener('click', click)
  const result = await finishRednoteEditor({ runId: 'preview', finish: 'save_draft', mode: 'execute', deadline: Date.now() + 1000, title: '原题' })
  expect(result.state).toBe(different ? 'outcome_unknown' : 'draft_saved')
  expect(click).toHaveBeenCalledTimes(different ? 0 : 1)
})
