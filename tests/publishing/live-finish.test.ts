// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { startServer } from '../../packages/publishing-api/server.mts'
import { runLivePreflight, type PreflightProgress } from '../../MultiPost-Extension/src/haiqiai/preflight'

it.each(['intent-response', 'click-response', 'event-response', 'late-event', 'publish-reconcile', 'video-staging-error', 'video-cancel', 'video-covers', 'video-continue-diagnostic', 'video-continue-topic-retry', 'video-continue-topic', 'video-continue', 'video-continue-text', 'video-continue-cover', 'video-continue-cover-retry', 'video-continue-cover-uploaded', 'video-continue-cover-uploaded-crop', 'video-continue-restart', 'x-text'])('never repeats final action after losing %s', async loss => {
  const isVideo = loss.startsWith('video-')
  const continuation = loss.startsWith('video-continue')
  const isX = loss === 'x-text'
  const platform = isX ? 'x' : 'xiaohongshu'
  const directory = mkdtempSync(join(tmpdir(), 'hq-finish-'))
  const adminKey = 'test-key-32-characters-long-for-finish'
  let time = Date.now()
  const server = await startServer({ directory, adminKey, port: 0, now: () => time })
  const fetcher = globalThis.fetch
  const api = async (path: string, body?: unknown, key = adminKey, requestId: string = randomUUID()) => {
    const r = await fetcher(`${server.url}/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await r.json(); if (!r.ok) throw Object.assign(new Error(data.error?.code), { status: r.status }); return data
  }
  try {
    const computer = await api('/computers', { name: 'test' }); const pair = await api('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: 'work' })
    const executor = await api('/executors/pair', { pairingCode: pair.code, installationId: randomUUID(), extensionVersion: '1' }, '')
    const account = await api('/accounts', { executorId: executor.executorId, platform, platformAccountId: '6a275c1f0000000001007c00', displayName: 'test' })
    const bytes = Buffer.from('test'); const asset = await api('/assets', { filename: isVideo ? '1.mp4' : '1.png', mediaType: isVideo ? 'video/mp4' : 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    await fetcher(`${server.url}/v1/assets/${asset.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes })
    let coverId: string | undefined;
    if ((loss === 'video-covers' || loss.startsWith('video-continue-cover'))) {
      const cover = await api('/assets', { filename: 'cover.png', mediaType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      await fetcher(`${server.url}/v1/assets/${cover.assetId}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${adminKey}`, 'Idempotency-Key': randomUUID() }, body: bytes });
      coverId = cover.assetId;
    }
    const task = await api('/tasks', { executionMode: 'live', confirmation: { action: 'fill', finish: isX ? 'stay' : loss === 'publish-reconcile' ? 'publish' : 'save_draft', confirmedAt: new Date().toISOString(), contentRevision: 'r1' }, targets: [{ clientTargetId: 'x', computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, accountId: account.id, platform, content: { type: isVideo ? 'video' : 'dynamic', title: '原题', content: '原文', ...(isX ? {} : isVideo ? { videoAssetId: asset.assetId, ...(coverId ? { horizontalCoverAssetId: coverId, verticalCoverAssetId: coverId } : {}) } : { imageAssetIds: loss === 'publish-reconcile' ? [asset.assetId, asset.assetId] : [asset.assetId] }) } }] })
    let nextTab = 10; const tabs = [{ id: 2, url: 'https://www.xiaohongshu.com/user/profile/6a275c1f0000000001007c00' }]; let clicks = 0; let uploads = 0; let lost = false; let staged = 0; let originalEditor: number | undefined
    let result: any
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '1' }) },
      tabs: { create: async ({ url }: any) => { const tab = { id: nextTab++, url }; tabs.push(tab); return tab }, get: async (id: number) => ({ ...tabs.find(t => t.id === id), status: 'complete' }), query: async () => tabs, remove: async (id: number) => { const i = tabs.findIndex(t => t.id === id); if (i >= 0) tabs.splice(i, 1) } },
      scripting: { executeScript: async ({ func, args, target }: any) => {
        if (func.name === 'inspectPlatformAccount') return [{ result: { accountMatched: true, code: 'ACCOUNT_MATCHED', platformAccountId: args[1], displayName: 'test' } }];
        if (func.name === 'prepareXPost') { expect(args[0].images).toEqual([]); uploads++; return [{ result: { ok: true, code: 'AWAITING_PUBLISH_CONFIRMATION' } }]; }
        if (func.name === 'stagePublishingMedia') { staged++; if (continuation) { expect(uploads).toBe(0); originalEditor = target.tabId; }
          if (loss === 'video-staging-error') return [{ result: 'MEDIA_ORDER_MISMATCH' }];
          if (loss === 'video-cancel' && !lost) { lost = true; await api('/tasks/' + task.taskId + '/cancel', {}); }
          return [{ result: args[0].final ? 'MEDIA_READY' : 'MEDIA_CHUNK_STAGED' }];
        }
        if (func.name === 'inspectRednoteResult') {
          const input = args[0]; expect(input.imageCount).toBe(2);
          if (!lost) return [{ result: { code: 'RESULT_AMBIGUOUS' } }];
          return [{ result: input.mode === 'manager' ? { code: 'CANDIDATE_FOUND', noteId: '6ac7aeda000000001a021cd9', publishedAt: '2026-10-08 22:55' } : input.mode === 'profile' ? { code: 'DETAIL_LINK_FOUND', url: 'https://www.xiaohongshu.com/explore/6ac7aeda000000001a021cd9' } : { code: 'PUBLISHED_CONFIRMED', url: 'https://www.xiaohongshu.com/explore/6ac7aeda000000001a021cd9' } }];
        }
        if (func.name === 'prepareRednoteEditor') { if (continuation) { if (!uploads) { uploads++; return [{ result: { ok: false, code: loss.startsWith('video-continue-cover') ? 'VIDEO_COVER_CONTROL_UNVERIFIED' : loss.startsWith('video-continue-topic') ? 'TOPIC_NOT_FOUND' : loss === 'video-continue-text' ? 'CONTENT_MISMATCH' : 'VIDEO_UPLOAD_UNCONFIRMED' } }]; } expect(target.tabId).toBe(originalEditor); if (loss === 'video-continue-diagnostic' && uploads === 1) { uploads++; return [{ result: { ok: false, code: 'PREPARATION_INTERRUPTED', detail: 'video_preview_fetch; preview=2; error=TypeError' } }]; } if (loss === 'video-continue-diagnostic') expect(args[0].existingVideo.previousResultCode).toBe('PREPARATION_INTERRUPTED'); if (loss.startsWith('video-continue-topic')) expect(args[0].existingVideo).toMatchObject({ topicsInProgress: true, previousResultCode: uploads === 1 ? 'TOPIC_NOT_FOUND' : 'CONTINUATION_UNVERIFIED' }); if (loss === 'video-continue-topic-retry' && uploads === 1) { uploads++; return [{ result: { ok: false, code: 'CONTINUATION_UNVERIFIED' } }]; } if (loss === 'video-continue-restart') throw new Error('worker restarted before injection'); expect(args[0].existingVideo).toMatchObject({ size: 4, textAlreadyFilled: (loss.startsWith('video-continue-topic') || loss === 'video-continue-text' || loss.startsWith('video-continue-cover')), topicsAlreadyFilled: loss.startsWith('video-continue-cover') }); expect(Number.isFinite(Date.parse(args[0].existingVideo.previousStoppedAt))).toBe(true); if (loss.startsWith('video-continue-cover-uploaded') && uploads === 2) expect(args[0].existingVideo.coverAlreadyUploaded).toBe(true); if ((loss === 'video-continue-cover-retry' || loss.startsWith('video-continue-cover-uploaded')) && (uploads === 1 || (loss === 'video-continue-cover-uploaded-crop' && uploads === 2))) { uploads++; return [{ result: { ok: false, code: loss.startsWith('video-continue-cover-uploaded') ? 'COVER_IDENTITY_UNCONFIRMED' : 'CONTINUATION_UNVERIFIED' } }]; } } if (loss === 'video-continue-cover-uploaded-crop' && uploads === 3) { expect(args[0].coverCropAccepted).toBe(true); uploads++; return [{ result: { ok: false, code: 'PREVIEW_MISMATCH' } }]; } if (loss === 'video-continue-cover-uploaded-crop' && uploads === 4) expect(args[0].existingVideo.confirmedCoverPreviewSha256).toBe('a'.repeat(64)); if (loss.startsWith('video-continue-cover') && uploads) expect(args[0].covers.map((c: any) => c.kind)).toEqual(['default']); if (loss === 'video-covers') expect(args[0].covers.map((c: any) => c.kind)).toEqual(['horizontal', 'vertical']); uploads++; return [{ result: { ok: true, code: 'AWAITING_PUBLISH_CONFIRMATION' } }] }
        if (func.name === 'finishRednoteEditor') {
          if (args[0].mode === 'inspect') return [{ result: { state: 'ready' } }]
          if (args[0].mode === 'execute') { clicks++; result = { state: loss === 'publish-reconcile' ? 'submitted' : 'draft_saved', code: 'DRAFT_SAVED', detail: '保存成功', observedAt: new Date().toISOString() }; if (loss === 'click-response' && !lost) { lost = true; throw new Error('lost click response') } }
          return [{ result: result || { state: 'outcome_unknown', code: 'RESULT_NOT_FOUND', detail: 'unknown' } }]
        }
        if (loss === 'video-continue-restart' && target.tabId === originalEditor && func.name !== 'prepareRednoteEditor') {
          vi.stubGlobal('haiqiaiPreparation', { id: args[1], stopped: true, finished: true, result: { ok: false, code: 'VIDEO_UPLOAD_UNCONFIRMED' } });
          const stopped = func(...args); expect((globalThis as any).haiqiaiPreparation).toMatchObject({ id: args[0], stopped: true, finished: true }); delete (globalThis as any).haiqiaiPreparation;
          return [{ result: stopped }];
        }
        if (target.tabId >= 10 && tabs.find(t => t.id === target.tabId)?.url.includes('/publish/')) return [{ result: { finished: true, result: { ok: true, code: 'AWAITING_PUBLISH_CONFIRMATION' } } }]
        return [{ result: func.name === 'inspectRednoteProfile' ? { platformAccountId: '6a275c1f0000000001007c00', number: '123' } : { creatorAccountNumber: '123', displayName: 'test' } }]
      } },
    })
    const request = async (path: string, body?: unknown, requestId?: string) => {
      if (loss === 'late-event' && !lost && path.endsWith('/events')) { lost = true; time += 130_000 }
      const response = await api(path, body, executor.key, requestId)
      if (!lost && ((loss === 'intent-response' && path.endsWith('/submit-intent')) || (loss === 'event-response' && path.endsWith('/events')))) { lost = true; throw new Error('lost response') }
      return response
    }
    const progress: PreflightProgress = {}; const options = { apiUrl: server.url, key: executor.key, executorId: executor.executorId, request, save: async () => {} }
    await runLivePreflight(progress, options).catch(e => { if (loss !== 'event-response') throw e })
    if (continuation) {
      expect((await api('/tasks/' + task.taskId)).targets[0].state).toBe('needs_attention');
      if (loss.startsWith('video-continue-cover')) {
        await expect(api('/targets/' + task.targets[0].id + '/continue-video', { coverSelection: 'invalid' })).rejects.toThrow('INVALID_FIELD');
        await expect(api('/targets/' + task.targets[0].id + '/continue-video', {})).rejects.toThrow('CONTINUATION_NOT_ALLOWED');
      }
      await api('/targets/' + task.targets[0].id + '/continue-video', loss.startsWith('video-continue-cover') ? { coverSelection: 'horizontal' } : {});
      if (loss.startsWith('video-continue-cover')) { const t = (await api('/tasks/' + task.taskId)).targets[0]; expect(t.content).toMatchObject({ horizontalCoverAssetId: coverId, verticalCoverAssetId: coverId }); expect(t.coverSelection).toMatchObject({ kind: 'horizontal', assetId: coverId }); }
    }
    if (loss === 'publish-reconcile') {
      expect((await api('/tasks/' + task.taskId)).targets[0].state).toBe('submitted');
      lost = true;
      await api('/targets/' + task.targets[0].id + '/reconcile', {});
    }
    await runLivePreflight(progress, options)
    if ((loss === 'video-continue-cover-retry' || loss.startsWith('video-continue-cover-uploaded'))) { await api('/targets/' + task.targets[0].id + '/continue-video', {}); await runLivePreflight(progress, options); }
    if (loss === 'video-continue-cover-uploaded-crop') { await expect(api('/targets/' + task.targets[0].id + '/continue-video', { acceptCoverCrop: false })).rejects.toThrow('INVALID_FIELD'); await api('/targets/' + task.targets[0].id + '/continue-video', { acceptCoverCrop: true }); expect((await api('/tasks/' + task.taskId)).targets[0].coverSelection.cropAcceptedAt).toBeTruthy(); await runLivePreflight(progress, options); }
    if (loss === 'video-continue-cover-uploaded-crop') { await expect(api('/targets/' + task.targets[0].id + '/continue-video', {})).rejects.toThrow('CONTINUATION_NOT_ALLOWED'); await expect(api('/targets/' + task.targets[0].id + '/continue-video', { confirmedCoverPreviewSha256: 'bad' })).rejects.toThrow('INVALID_FIELD'); await api('/targets/' + task.targets[0].id + '/continue-video', { confirmedCoverPreviewSha256: 'a'.repeat(64) }); await runLivePreflight(progress, options); }
    if (loss === 'video-continue-diagnostic') { expect((await api('/tasks/' + task.taskId)).targets[0].reason.message).toContain('video_preview_fetch; preview=2; error=TypeError'); await api('/targets/' + task.targets[0].id + '/continue-video', {}); await runLivePreflight(progress, options); }
    if (loss === 'video-continue-topic-retry') { await api('/targets/' + task.targets[0].id + '/continue-video', {}); await runLivePreflight(progress, options); }
    if (isX) {
      expect(uploads).toBe(1); expect(clicks).toBe(0);
      expect((await api('/tasks/' + task.taskId)).targets[0]).toMatchObject({ state: 'needs_attention', reason: { code: 'AWAITING_PUBLISH_CONFIRMATION' } });
      return;
    }
    if (loss === 'video-continue-restart') {
      await runLivePreflight(progress, options);
      expect(clicks).toBe(0); expect(uploads).toBe(1); expect(staged).toBe(2);
      expect((await api('/tasks/' + task.taskId)).targets[0]).toMatchObject({ state: 'needs_attention', reason: { code: 'PREPARATION_INTERRUPTED' } }); return;
    }
    if (continuation) { expect(uploads).toBe((loss === 'video-continue-diagnostic' || loss === 'video-continue-topic-retry') ? 3 : loss === 'video-continue-cover-uploaded-crop' ? 5 : (loss === 'video-continue-cover-retry' || loss.startsWith('video-continue-cover-uploaded')) ? 3 : 2); expect(staged).toBe(2); expect(clicks).toBe(1); expect((await api('/tasks/' + task.taskId)).targets[0].state).toBe('draft_saved'); return; }
    if (isVideo && loss !== 'video-covers') {
      expect(uploads).toBe(0); expect(clicks).toBe(0);
      const target = (await api('/tasks/' + task.taskId)).targets[0];
      expect(target.state).toBe(loss === 'video-cancel' ? 'cancelled' : 'needs_attention');
      if (loss === 'video-staging-error') expect(target.reason.code).toBe('MEDIA_ORDER_MISMATCH');
      return;
    }
    expect(uploads).toBe(1); expect(clicks).toBe(loss === 'intent-response' ? 0 : 1)
    expect((await api(`/tasks/${task.taskId}`)).targets[0].state).toBe(loss === 'intent-response' ? 'outcome_unknown' : loss === 'publish-reconcile' ? 'published' : 'draft_saved')
  } finally { vi.unstubAllGlobals(); await server.close(); rmSync(directory, { recursive: true, force: true }) }
})
