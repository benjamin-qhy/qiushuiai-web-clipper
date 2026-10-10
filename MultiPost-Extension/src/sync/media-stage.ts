export interface MediaStageInput {
  runId: string; deadline: number; name: string; type: string; size: number; sha256: string;
  offset: number; chunk: string; final: boolean;
}
export interface StagedPublishingMedia {
  id: string; deadline: number; name: string; type: string; size: number; sha256: string;
  bytes: number; chunks: Uint8Array<ArrayBuffer>[]; file?: File; consumed?: boolean;
}
// A bounded chunk bridge into the isolated world. No API credentials or remote asset URLs enter the page.
export async function stagePublishingMedia(data: MediaStageInput): Promise<string> {
  if (location.origin !== 'https://creator.xiaohongshu.com' || location.pathname !== '/publish/publish') return 'PAGE_NOT_READY';
  if (!Number.isFinite(data.deadline) || Date.now() >= data.deadline) return 'PREPARATION_EXPIRED';
  if (!Number.isSafeInteger(data.size) || data.size <= 0 || data.size > 128 * 1024 * 1024 || data.type !== 'video/mp4' || !/^[a-f0-9]{64}$/.test(data.sha256) || data.chunk.length > 350000) return 'INVALID_VIDEO';
  const scope = globalThis as typeof globalThis & { haiqiaiMedia?: StagedPublishingMedia };
  if (!scope.haiqiaiMedia) {
    if (data.offset !== 0) return 'MEDIA_ORDER_MISMATCH';
    scope.haiqiaiMedia = { id: data.runId, deadline: data.deadline, name: data.name, type: data.type, size: data.size, sha256: data.sha256, bytes: 0, chunks: [] };
  }
  const staged = scope.haiqiaiMedia;
  if (staged.id !== data.runId || staged.deadline !== data.deadline || staged.size !== data.size || staged.sha256 !== data.sha256 || staged.type !== data.type || staged.name !== data.name || staged.bytes !== data.offset || staged.file || staged.consumed) return 'MEDIA_ORDER_MISMATCH';
  let raw: string;
  try { raw = atob(data.chunk); } catch { return 'INVALID_VIDEO'; }
  if (staged.bytes + raw.length > staged.size) return 'ASSET_SIZE_MISMATCH';
  staged.chunks.push(Uint8Array.from(raw, c => c.charCodeAt(0))); staged.bytes += raw.length;
  if (!data.final) return 'MEDIA_CHUNK_STAGED';
  if (staged.bytes !== staged.size) return 'ASSET_SIZE_MISMATCH';
  const file = new File(staged.chunks, staged.name, { type: staged.type });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== staged.sha256) { staged.chunks = []; staged.consumed = true; return 'ASSET_DIGEST_MISMATCH'; }
  if (staged.consumed || Date.now() >= staged.deadline) return 'PREPARATION_EXPIRED';
  staged.file = file; staged.chunks = []; return 'MEDIA_READY';
}
