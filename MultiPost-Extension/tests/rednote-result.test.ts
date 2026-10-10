import { afterEach, expect, it, vi } from 'vitest'
import { inspectRednoteResult } from '../src/sync/dynamic/rednote-result'
afterEach(() => vi.unstubAllGlobals())
const account = '6a275c1f0000000001007c00'
const note = '6ac7aeda000000001a021cd9'
const expected = { mode: 'manager' as const, title: '原题', submittedAt: '2026-10-08T14:55:18.409Z', accountId: account, content: '原文', tags: ['AI'], imageCount: 7 }
function card(time = '2026-10-08 22:55') {
  return `<div class="note-card" data-impression='{"noteTarget":{"value":{"noteId":"${note}"}}}'><span class="note-card__title">原题</span><span class="note-card__time">${time}</span></div>`
}
it('identifies one current submission by exact title and China-local minute, excluding old notes', () => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/new/note-manager'))
  document.body.innerHTML = card()
  expect(inspectRednoteResult(expected)).toMatchObject({ code: 'CANDIDATE_FOUND', noteId: note })
  document.body.innerHTML = card('2026-10-07 22:55')
  expect(inspectRednoteResult(expected).code).toBe('RESULT_NOT_FOUND')
  document.body.innerHTML = card() + card()
  expect(inspectRednoteResult(expected).code).toBe('RESULT_AMBIGUOUS')
})
it('requires the same public author, full text, topics and image count', () => {
  vi.stubGlobal('location', new URL(`https://www.xiaohongshu.com/explore/${note}`))
  document.body.innerHTML = `<div class="author"><a class="name" href="/user/profile/${account}">作者</a></div><h1 id="detail-title">原题</h1><div id="detail-desc"><span>原文 </span><a class="tag">#AI</a></div><div class="pagination-media-container">${'<i class="pagination-item"></i>'.repeat(7)}</div>`
  expect(inspectRednoteResult({ ...expected, mode: 'detail', noteId: note })).toMatchObject({ code: 'PUBLISHED_CONFIRMED', url: `https://www.xiaohongshu.com/explore/${note}` })
  document.querySelector('a.name')!.setAttribute('href', '/user/profile/another')
  expect(inspectRednoteResult({ ...expected, mode: 'detail', noteId: note }).code).toBe('RESULT_CONTENT_MISMATCH')
})

it('never infers review or rejection from the title itself', () => {
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/new/note-manager'))
  document.body.innerHTML = card().replace('原题', '未通过')
  expect(inspectRednoteResult({ ...expected, title: '未通过' }).platformState).toBeUndefined()
  document.body.innerHTML = card().replace('<span class="note-card__title">原题</span>', '<div class="note-card__title-group"><span>未通过</span><span class="note-card__title">原题</span></div>')
  expect(inspectRednoteResult(expected).platformState).toBe('rejected')
})
