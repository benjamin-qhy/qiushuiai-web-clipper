import type { SaveLinkNoteParams } from './types'

const GET_NOTE_SAVE_URL = 'https://openapi.biji.com/open/api/v1/resource/note/save'

export async function saveLinkNote(params: SaveLinkNoteParams): Promise<void> {
  const response = await fetch(GET_NOTE_SAVE_URL, {
    method: 'POST',
    headers: {
      'X-Client-ID': params.clientId.trim(),
      'Authorization': params.authToken.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      note_type: 'link',
      link_url: params.linkUrl,
      tags: params.tags,
    }),
  })

  if (response.ok) return

  const text = await response.text()
  throw new Error(`Get 笔记保存失败 ${response.status}: ${text}`)
}
