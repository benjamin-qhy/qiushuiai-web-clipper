import { expect, it, vi } from 'vitest'
import { prepareXPost } from '../src/sync/dynamic/x-prepare'

it('does not overwrite another account or an existing X composition', async () => {
  vi.stubGlobal('location', new URL('https://x.com/home'))
  document.body.innerHTML = '<a data-testid="AppTabBar_Profile_Link" href="/other"></a><button data-testid="SideNav_AccountSwitcher_Button">@other</button><div contenteditable="true" data-testid="tweetTextarea_0">我的草稿</div>'
  const input = { runId: 'x', deadline: Date.now() + 10000, accountId: 'owner', title: '', content: '新文案', tags: [], images: [] }
  try {
    expect(await prepareXPost(input)).toMatchObject({ ok: false, code: 'ACCOUNT_MISMATCH' })
    expect(document.querySelector('[contenteditable]')!.textContent).toBe('我的草稿')
    expect(await prepareXPost({ ...input, accountId: 'other' })).toMatchObject({ ok: false, code: 'EDITOR_NOT_EMPTY' })
  } finally { vi.unstubAllGlobals(); delete (globalThis as any).haiqiaiPreparation }
})
