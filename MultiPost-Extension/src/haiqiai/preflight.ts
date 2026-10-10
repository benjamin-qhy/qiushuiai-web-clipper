import { inspectOtherPlatform } from "./platform-account";
import { prepareXPost } from "../sync/dynamic/x-prepare";
import { stagePublishingMedia } from "../sync/media-stage";
import { inspectRednoteResult, type RednoteResultInput, type RednoteResultObservation } from "../sync/dynamic/rednote-result";
import { finishRednoteEditor, type RednoteFinishResult } from "../sync/dynamic/rednote-finish";
import { prepareRednoteEditor, type RednotePreparation } from "../sync/dynamic/rednote-prepare";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { inspectRednote } from "./rednote";
import { message } from "./i18n";
import messages from "./messages.json";
import type { SimulationAttempt } from "./simulation";

export interface PreflightProgress {
  claimRequestId?: string;
  attempt?: SimulationAttempt;
  event?: Record<string, unknown>;
}

// prepare is read-only; fill honors its immutable finish choice after a separate submit-intent.
function failureMessage(code: string, fallback: keyof typeof messages) {
  const key = `hqFillReason${code}`;
  return message(key in messages ? key as keyof typeof messages : fallback);
}
function preparationFailure(result: { code: string; detail?: string }, fallback: keyof typeof messages) {
  const detail = result.detail && /^(initialization|video_preview_fetch|video_preview_body|video_preview_bytes|video_preview_hash|editor|topics|covers); preview=\d{1,3}; error=(Error|TypeError|RangeError|ReferenceError|AbortError|TimeoutError|SecurityError|NotReadableError)$/.test(result.detail) ? ` (${result.detail})` : "";
  return failureMessage(result.code, fallback) + detail;
}
function preparationReason(result?: { ok: boolean; code: string; detail?: string }) {
  const code = result?.code || "PREPARATION_INTERRUPTED";
  return { code, message: result?.ok ? message("hqFillReady") : preparationFailure(result || { code }, "hqFillInterrupted"), stage: "preparation", causeKnown: !!result && !["PREVIEW_MISMATCH", "IMAGE_UPLOAD_UNCONFIRMED", "IMAGE_ORDER_UNCONFIRMED", "PREPARATION_INTERRUPTED", "VIDEO_PREVIEW_FETCH_FAILED", "VIDEO_PREVIEW_BODY_FAILED", "VIDEO_PREVIEW_BYTES_FAILED", "VIDEO_PREVIEW_HASH_FAILED"].includes(code), retryable: false, nextAction: message("hqFillReview") };
}
async function loaded(tabId: number) {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("PAGE_NOT_READY");
}
async function freshInspection(expectedId: string, profileTabId?: number) {
  const profile = profileTabId === undefined && /^[a-f0-9]{24}$/.test(expectedId) ? await chrome.tabs.create({ url: 'https://www.xiaohongshu.com/user/profile/' + expectedId, active: false }) : undefined;
  if (profile?.id !== undefined) { profileTabId = profile.id; await loaded(profile.id); }
  const tab = await chrome.tabs.create({ url: "https://creator.xiaohongshu.com/new/home", active: false });
  if (tab.id === undefined) throw new Error("PAGE_NOT_READY");
  try {
    await loaded(tab.id);
    const end = Date.now() + 15_000;
    while (true) {
      const result = await inspectRednote(expectedId, tab.id, profileTabId);
      if (result.creatorAccountNumber || result.code === "LOGIN_REQUIRED" || Date.now() >= end) return result;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } finally { await chrome.tabs.remove(tab.id); if (profile?.id !== undefined) await chrome.tabs.remove(profile.id).catch(() => {}); }
}
async function preparationState(tabId: number, runId: string, previousRunId?: string) {
  if (!(await chrome.tabs.query({})).some(tab => tab.id === tabId)) return { stopped: true, pageClosed: true };
  const observed = (await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: (id: string, previous?: string) => {
    const scope = globalThis as typeof globalThis & { haiqiaiPreparation?: { id: string; stopped: boolean; finished: boolean; result?: { ok: boolean; code: string } } };
    const run = scope.haiqiaiPreparation;
    if (!run || run.id !== id) {
      if (previous && (!run || (run.id === previous && run.finished && run.stopped))) {
        // Fence a delayed injection as well as a worker restart before injection.
        const result = { ok: false, code: 'PREPARATION_INTERRUPTED' };
        scope.haiqiaiPreparation = { id, stopped: true, finished: true, result };
        return { finished: true, result };
      }
      const media = (scope as typeof scope & { haiqiaiMedia?: { id: string; consumed?: boolean; chunks: unknown[]; file?: File } }).haiqiaiMedia;
      if (media?.id === id) { media.consumed = true; media.chunks = []; delete media.file; return { finished: true, result: { ok: false, code: 'MEDIA_TRANSFER_INTERRUPTED' } }; }
      return { finished: false };
    }
    run.stopped = true; // request cancellation; finished proves the async writer has actually returned
    return { finished: run.finished, result: run.result };
  }, args: [runId, previousRunId] }))[0]?.result;
  return { stopped: observed?.finished === true, pageClosed: false, result: observed?.result };
}
async function publishedResult(current: any, accountId: string): Promise<RednoteFinishResult> {
  const opened: number[] = [];
  const unknown = (code: string): RednoteFinishResult => ({ state: "outcome_unknown", code, detail: "" });
  const input: RednoteResultInput = { mode: "manager", title: current.target.content.title, content: current.target.content.content || "", tags: current.target.content.tags || [], imageCount: current.target.content.imageAssetIds?.length || 0, ...(current.target.content.type === "video" ? { video: true } : {}), submittedAt: current.target.submitIntentAt, accountId };
  const open = async (url: string) => {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id === undefined) throw new Error("RESULT_PAGE_UNAVAILABLE");
    opened.push(tab.id); await loaded(tab.id); return tab.id;
  };
  const observe = async (tabId: number, params: RednoteResultInput) => {
    const end = Date.now() + 12000;
    let observation: RednoteResultObservation | undefined;
    do {
      observation = (await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: inspectRednoteResult, args: [params] }))[0]?.result;
      if (observation && observation.code !== "RESULT_NOT_FOUND") break;
      await new Promise(resolve => setTimeout(resolve, 300));
    } while (Date.now() < end);
    return observation || { code: "RESULT_PAGE_UNAVAILABLE" };
  };
  try {
    if (!/^[a-f0-9]{24}$/.test(accountId)) return unknown("ACCOUNT_UNVERIFIED");
    const profileId = await open('https://www.xiaohongshu.com/user/profile/' + accountId);
    if ((await freshInspection(accountId, profileId)).status !== "matched") return unknown("ACCOUNT_UNVERIFIED");
    const managerId = await open('https://creator.xiaohongshu.com/new/note-manager');
    const candidate = await observe(managerId, input);
    if (!candidate.noteId) return unknown(candidate.code);
    const link = await observe(profileId, { ...input, mode: 'profile', noteId: candidate.noteId });
    if (!link.url) return unknown(link.code);
    const detailId = await open(link.url);
    const detail = await observe(detailId, { ...input, mode: 'detail', noteId: candidate.noteId });
    if (detail.code !== 'PUBLISHED_CONFIRMED') return unknown(detail.code);
    if (candidate.platformState === 'rejected') return { state: 'failed', code: 'PLATFORM_REJECTED', detail: '', url: 'https://www.xiaohongshu.com/explore/' + candidate.noteId, observedAt: new Date().toISOString() };
    if (candidate.platformState === 'reviewing') return { state: 'submitted', code: 'PLATFORM_REVIEWING', detail: '', observedAt: new Date().toISOString() };
    return { state: 'published', code: detail.code, detail: '', url: detail.url, observedAt: new Date().toISOString() };
  } catch { return unknown("RESULT_PAGE_UNAVAILABLE"); }
  finally { for (const id of opened) await chrome.tabs.remove(id).catch(() => {}); }
}
export async function runLivePreflight(progress: PreflightProgress, options: {
  apiUrl: string; key: string; executorId: string;
  request: (path: string, body?: unknown, requestId?: string) => Promise<any>;
  save: () => Promise<void>;
}) {
  const { request, save } = options;
  const clear = async () => { delete progress.attempt; delete progress.event; await save(); };
  if (!progress.attempt) {
    progress.claimRequestId ||= crypto.randomUUID(); await save();
    const result = await request(`/executors/${options.executorId}/claims`, { executionMode: "live" }, progress.claimRequestId);
    progress.attempt = result.attempt || undefined; delete progress.claimRequestId; await save();
    if (!progress.attempt) return;
  }
  const attempt = progress.attempt;
  const isX = attempt.target.platform === 'x';
  const freshAccount = (id: string) => attempt.target.platform === 'xiaohongshu' ? freshInspection(id) : inspectOtherPlatform(attempt.target.platform, id);
  if (attempt.executionMode !== "live") throw new Error("LIVE_TASK_REQUIRED");
  const complete = async (current: any): Promise<Record<string, unknown> | undefined> => {
    const finish = attempt.confirmation?.finish;
    if (finish !== "save_draft" && finish !== "publish") return undefined;
    const tabId = current.target.editorTabId;
    const runId = current.target.preparationAttemptId || attempt.id;
    const execute = async (mode: "inspect" | "execute" | "observe", deadline = Date.now() + 30_000) => (await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: finishRednoteEditor, args: [{ runId, finish, mode, deadline, title: current.target.content.title }] }))[0]?.result;
    let result: RednoteFinishResult | undefined;
    if (!current.target.submitIntentAt && attempt.mode !== "reconcile") {
      const accounts = await request(`/accounts?executorId=${encodeURIComponent(options.executorId)}`);
      const account = accounts.accounts.find((item: { id: string }) => item.id === attempt.target.accountId);
      if (!account || (await freshAccount(account.platformAccountId)).status !== "matched") throw new Error("ACCOUNT_UNVERIFIED");
      const inspected = await execute("inspect");
      if (inspected?.state !== "ready") return { leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: current.seq + 1, stage: "preparation", state: "needs_attention", reason: { code: inspected?.code || "FINISH_CONTROL_MISSING", message: failureMessage(inspected?.code || "FINISH_CONTROL_MISSING", "hqFillInterrupted"), stage: "preparation", causeKnown: true, retryable: false, nextAction: message("hqFillReview") } };
      await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken });
      const started = Date.now();
      // If the response is lost, the next run observes only; it never requests another click.
      let grant;
      try { grant = await request(`/attempts/${attempt.id}/submit-intent`, { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: attempt.target.accountId, assetsChecked: true, editorTabId: tabId, preparationChecked: true, finish }); } catch { return undefined; }
      if (grant.authorized !== true || grant.finish !== finish || !Number.isFinite(grant.durationMs) || grant.durationMs <= 0 || grant.durationMs > 30_000) return undefined;
      try { result = await execute("execute", started + grant.durationMs); } catch { return undefined; }
    } else {
      try { result = await execute("observe"); } catch { result = { state: "outcome_unknown", code: "RESULT_PAGE_UNAVAILABLE", detail: "" }; }
    }
    if (finish === "publish" && (result?.state === "submitted" || attempt.mode === "reconcile" || current.target.evidence?.signal === "submitted")) {
      const accounts = await request('/accounts?executorId=' + encodeURIComponent(options.executorId));
      const account = accounts.accounts.find((item: { id: string }) => item.id === attempt.target.accountId);
      const latest = await request('/attempts/' + attempt.id);
      await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken });
      const heartbeat = setInterval(() => { void request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken }).catch(() => {}); }, 30_000);
      let observed: RednoteFinishResult;
      try { observed = account ? await publishedResult(latest, account.platformAccountId) : { state: 'outcome_unknown', code: 'ACCOUNT_UNVERIFIED', detail: '' }; }
      finally { clearInterval(heartbeat); }
      if (['published', 'failed', 'submitted'].includes(observed.state)) result = observed;
      else if (result?.state !== 'submitted' && current.target.evidence?.signal !== 'submitted') result = observed;
      else result = { state: 'submitted', code: observed.code, detail: '', observedAt: new Date().toISOString() };
    }
    if (!result) return undefined;
    const success = result.state === "draft_saved" || result.state === "submitted" || result.state === "published" || result.state === "failed";
    return { leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: current.seq + 1, stage: "reconciliation", state: success ? result.state : "outcome_unknown",
      ...(result.state === "failed" ? { reason: { code: result.code, message: failureMessage(result.code, "hqFillInterrupted"), stage: "reconciliation", causeKnown: true, retryable: false, nextAction: message("hqFillReview") } } : {}),
      ...(success ? { evidence: { kind: result.state === "failed" ? "platform_rejection" : "platform_receipt", platform: "xiaohongshu", accountId: attempt.target.accountId, observedAt: result.observedAt, detail: failureMessage(result.code, "hqFillInterrupted"), finish, editorTabId: tabId, title: current.target.content.title, signal: result.state, ...(result.url ? { url: result.url } : {}), ...(result.state === "draft_saved" ? { storage: "browser_local" } : {}) } } : { reason: { code: result.code, message: failureMessage(result.code, "hqFillInterrupted"), stage: "reconciliation", causeKnown: false, retryable: false, nextAction: message("hqFillReview") } }) };
  };
  if (!progress.event) {
    const current = await request(`/attempts/${attempt.id}`);
    if (current.target.attemptId !== attempt.id || current.stoppedAt) { await clear(); return; }
    if (current.target.submitIntentAt || attempt.mode === "reconcile") {
      progress.event = await complete(current); if (!progress.event) return; await save();
    }
    if (!progress.event && current.target.preparationStartedAt && !(attempt.videoContinuation && current.target.preparationAttemptId === attempt.videoContinuation.previousRunId)) {
      // A lost response or background restart must never inject the same upload twice.
      const stopped = await preparationState(current.target.editorTabId, attempt.id, attempt.videoContinuation?.previousRunId);
      if (!stopped.stopped) return;
      if (current.target.cancelRequested || current.target.state !== "running" || Date.parse(current.expiresAt) <= Date.now()) {
        await request(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: stopped.pageClosed, preparationStopped: true, ...(stopped.result ? { preparationResult: preparationReason(stopped.result) } : {}) });
        await clear(); return;
      }
      if (stopped.result?.ok && ["save_draft", "publish"].includes(attempt.confirmation?.finish || "")) {
        progress.event = await complete(current); if (!progress.event) return;
      } else progress.event = { leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: current.seq + 1, stage: "preparation", state: "needs_attention", reason: preparationReason(stopped.result) };
      await save();
    }
    if (!progress.event && (current.target.cancelRequested || current.target.state !== "running" || Date.parse(current.expiresAt) <= Date.now())) {
      // Only DOM reads and API downloads ran. Never reuse this stop proof after adding page writes.
      await request(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true });
      await clear(); return;
    }
    if (!progress.event) {
      let stage = "validation";
      const fill = attempt.action === "fill";
      const images: RednotePreparation["images"] = [];
      const isVideo = current.target.content.type === 'video';
      const covers: NonNullable<RednotePreparation["covers"]> = [];
      let videoMedia: { name: string; type: string; size: number; sha256: string; chunks: Uint8Array[] } | undefined;
      let total = 0;
      let code = "ACCOUNT_UNVERIFIED";
      let detail = message("hqXhsUnverified");
      let nextAction = message("hqLiveAccountAction");
      let causeKnown = true;
      try {
        const accounts = await request(`/accounts?executorId=${encodeURIComponent(options.executorId)}`);
        const account = accounts.accounts.find((item: { id: string }) => item.id === attempt.target.accountId);
        if (!account) throw new Error("ACCOUNT_NOT_FOUND");
        const inspection = fill || attempt.target.platform !== "xiaohongshu" ? await freshAccount(account.platformAccountId) : await inspectRednote(account.platformAccountId);
        code = inspection.code; detail = inspection.message;
        if (inspection.status === "matched") {
          await request(`/executors/${options.executorId}/heartbeat`, {
            extensionVersion: chrome.runtime.getManifest().version,
            accountObservations: [{ accountId: account.id, platformAccountId: inspection.platformAccountId }],
          });
          stage = "download";
          for (const assetId of (fill && !isVideo ? (current.target.content.imageAssetIds || []) : attempt.target.assetIds)) {
            await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken });
            const metadata = await request(`/assets/${encodeURIComponent(assetId)}`);
            total += metadata.sizeBytes;
            if (fill && total > (isVideo ? 128 : 32) * 1024 * 1024) throw new Error("ASSET_TRANSPORT_LIMIT");
            const chunks: Uint8Array[] = [];
            if (!metadata.ready) throw new Error("ASSET_NOT_READY");
            const response = await fetch(`${options.apiUrl}/v1/assets/${encodeURIComponent(assetId)}/content`, {
              headers: { Authorization: `Bearer ${options.key}` }, redirect: "error", signal: AbortSignal.timeout(25_000),
            });
            if (!response.ok || !response.body) throw new Error("ASSET_DOWNLOAD_FAILED");
            const reader = response.body.getReader(); const digest = sha256.create(); let bytes = 0;
            try {
              while (true) {
                const { value, done } = await reader.read(); if (done) break;
                bytes += value.byteLength;
                if (bytes > metadata.sizeBytes) throw new Error("ASSET_SIZE_MISMATCH");
                digest.update(value); if (fill) chunks.push(value);
              }
              if (bytes !== metadata.sizeBytes) throw new Error("ASSET_SIZE_MISMATCH");
              if (bytesToHex(digest.digest()) !== metadata.sha256) throw new Error("ASSET_DIGEST_MISMATCH");
              if (fill && isVideo && metadata.mediaType.startsWith("video/")) videoMedia = { name: metadata.filename, type: metadata.mediaType, size: bytes, sha256: metadata.sha256, chunks };
              if (fill && (!isVideo || metadata.mediaType.startsWith("image/"))) {
                let binary = "";
                for (const chunk of chunks) for (let offset = 0; offset < chunk.length; offset += 8192) binary += String.fromCharCode(...chunk.subarray(offset, offset + 8192));
                const image = { name: metadata.filename, size: bytes, url: `data:${metadata.mediaType};base64,${btoa(binary)}` };
                if (isVideo) {
                  for (const [field, kind] of [['horizontalCoverAssetId', 'horizontal'], ['verticalCoverAssetId', 'vertical'], ['coverAssetId', 'default']] as const) {
                    if (current.target.content[field] === assetId) covers.push({ ...image, kind });
                  }
                }
                else images.push(image);
              }
            } finally { await reader.cancel(); digest.destroy(); }
          }
          if (fill) {
            // Recheck after downloads, immediately before opening and granting the one-shot writer.
            const fresh = await freshAccount(account.platformAccountId);
            if (fresh.status !== "matched") throw new Error(fresh.code);
            await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken });
            const tab = attempt.videoContinuation ? await chrome.tabs.get(attempt.videoContinuation.editorTabId) : await chrome.tabs.create({ url: isX ? "https://x.com/home" : "https://creator.xiaohongshu.com/publish/publish" + (isVideo ? "?target=video" : ""), active: true });
            if (tab.id === undefined) throw new Error("PAGE_NOT_READY");
            await loaded(tab.id);
            const intentStarted = Date.now();
            const intent = await request(`/attempts/${attempt.id}/prepare-intent`, { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: account.id, assetsChecked: true, editorTabId: tab.id });
            if (intent.authorized !== true || !Number.isFinite(intent.durationMs) || intent.durationMs <= 0 || intent.durationMs > 90_000) throw new Error("PREPARATION_NOT_ALLOWED");
            stage = "preparation";
            const content = current.target.content;
            const timer = setInterval(() => {
              void request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken }).catch(() => chrome.scripting.executeScript({ target: { tabId: tab.id! }, world: "ISOLATED", func: () => {
                const scope = globalThis as typeof globalThis & { haiqiaiPreparation?: { stopped: boolean } }; if (scope.haiqiaiPreparation) scope.haiqiaiPreparation.stopped = true;
                const media = (globalThis as typeof globalThis & { haiqiaiMedia?: { consumed?: boolean } }).haiqiaiMedia; if (media) media.consumed = true;
              } }).catch(() => undefined));
            }, 10_000);
            let result; let writerStarted = false;
            try {
              if (videoMedia && !attempt.videoContinuation) {
                let offset = 0;
                const stage = async (chunk: string, final: boolean) => {
                  const code = (await chrome.scripting.executeScript({ target: { tabId: tab.id! }, world: 'ISOLATED', func: stagePublishingMedia, args: [{ runId: attempt.id, deadline: intentStarted + intent.durationMs, name: videoMedia!.name, type: videoMedia!.type, size: videoMedia!.size, sha256: videoMedia!.sha256, offset, chunk, final }] }))[0]?.result;
                  if (code !== (final ? 'MEDIA_READY' : 'MEDIA_CHUNK_STAGED')) throw new Error(code || 'MEDIA_NOT_READY');
                };
                for (const bytes of videoMedia.chunks) for (let start = 0; start < bytes.length; start += 256 * 1024) {
                  const chunk = bytes.subarray(start, start + 256 * 1024); let binary = '';
                  for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
                  await stage(btoa(binary), false); offset += chunk.length;
                }
                await stage('', true); videoMedia.chunks = [];
                await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken });
              }
              writerStarted = true;
              const input = { accountId: account.platformAccountId, runId: attempt.id, deadline: intentStarted + intent.durationMs, title: content.title, content: content.content || "", tags: content.tags || [], originalAgreementAccepted: attempt.confirmation?.originalAgreementAccepted === true, ...(content.collectionName !== undefined ? { collectionName: content.collectionName } : {}), ...(content.declareOriginal !== undefined ? { declareOriginal: content.declareOriginal } : {}), ...(isVideo ? { video: true, coverCropAccepted: !!current.target.coverSelection?.cropAcceptedAt, covers: current.target.coverSelection ? covers.filter(cover => cover.kind === current.target.coverSelection!.kind).map(cover => ({ ...cover, kind: "default" as const })) : covers, ...(attempt.videoContinuation && videoMedia ? { existingVideo: { previousRunId: attempt.videoContinuation.previousRunId, previousResultCode: attempt.videoContinuation.previousResultCode, previousStoppedAt: attempt.videoContinuation.previousStoppedAt, textAlreadyFilled: attempt.videoContinuation.textAlreadyFilled, topicsInProgress: attempt.videoContinuation.topicsInProgress, topicsAlreadyFilled: attempt.videoContinuation.topicsAlreadyFilled, coverAlreadyUploaded: attempt.videoContinuation.coverAlreadyUploaded, confirmedCoverPreviewSha256: attempt.videoContinuation.confirmedCoverPreviewSha256, size: videoMedia.size, sha256: videoMedia.sha256 } } : {}) } : {}), images };
              result = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", func: isX ? prepareXPost : prepareRednoteEditor, args: [input] }))[0]?.result;
            } catch (error) {
              if (!writerStarted) { if (!attempt.videoContinuation) await chrome.tabs.remove(tab.id).catch(() => {}); throw error; }
              // The script might still be running. Its absolute deadline fences later mutations.
              return;
            } finally { clearInterval(timer); }
            if (!result) return;
            if (result.ok && ["save_draft", "publish"].includes(attempt.confirmation?.finish || "")) {
              progress.event = await complete(await request(`/attempts/${attempt.id}`));
              if (!progress.event) return;
            }
            code = result.code;
            detail = result.ok ? message("hqFillReady") : preparationFailure(result, "hqFillFailed");
            nextAction = message("hqFillReview"); causeKnown = result.ok || !["PREVIEW_MISMATCH", "IMAGE_UPLOAD_UNCONFIRMED", "IMAGE_ORDER_UNCONFIRMED", "PREPARATION_INTERRUPTED", "VIDEO_PREVIEW_FETCH_FAILED", "VIDEO_PREVIEW_BODY_FAILED", "VIDEO_PREVIEW_BYTES_FAILED", "VIDEO_PREVIEW_HASH_FAILED"].includes(code);
          } else {
            stage = "validation"; code = "READONLY_CHECKED";
            detail = message("hqLiveReadonlyChecked"); nextAction = message("hqLiveFillAction");
          }
        } else if (inspection.code === "ACCOUNT_MISMATCH" || inspection.code === "LOGIN_REQUIRED") {
          // A sentinel cannot equal an account ID; never retain a stale matched badge after a mismatch.
          await request(`/executors/${options.executorId}/heartbeat`, {
            extensionVersion: chrome.runtime.getManifest().version,
            accountObservations: [{ accountId: account.id, platformAccountId: inspection.code === "LOGIN_REQUIRED" ? null : `mismatch:${inspection.creatorAccountNumber}` }],
          });
        }
      } catch (error) {
        const known = error instanceof Error && ["MEDIA_NOT_READY", "MEDIA_ORDER_MISMATCH", "MEDIA_TRANSFER_INTERRUPTED", "ASSET_NOT_READY", "ASSET_DOWNLOAD_FAILED", "ASSET_SIZE_MISMATCH", "ASSET_DIGEST_MISMATCH", "ACCOUNT_NOT_FOUND", "ASSET_TRANSPORT_LIMIT", "PAGE_NOT_READY", "ACCOUNT_MISMATCH", "ACCOUNT_UNVERIFIED", "LOGIN_REQUIRED"].includes(error.message);
        code = known ? (error as Error).message : "PREFLIGHT_INTERRUPTED";
        detail = failureMessage(code, stage === "download" ? "hqLiveAssetFailure" : "hqLiveCheckInterrupted");
        nextAction = message("hqLiveRetryAction"); causeKnown = known;
      }
      progress.event ||= { leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: current.seq + 1, stage, state: "needs_attention",
        reason: { code, message: detail, stage, causeKnown, retryable: false, nextAction } };
      await save();
    }
  }
  try {
    const receipt = await request(`/attempts/${attempt.id}/events`, progress.event, progress.event!.eventId as string);
    if (receipt.acceptedForReconciliation) {
      const current = await request(`/attempts/${attempt.id}`);
      if (!current.stoppedAt) {
        const stopped = await preparationState(current.target.editorTabId, current.target.preparationAttemptId || attempt.id);
        if (!stopped.stopped) return;
        await request(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: stopped.pageClosed, preparationStopped: true });
      }
      await request(`/targets/${attempt.target.id}/reconcile`, {});
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "status" in error && error.status === 409)) throw error;
    const current = await request(`/attempts/${attempt.id}`);
    if (!current.stoppedAt && current.target.attemptId === attempt.id && (current.target.cancelRequested || Date.parse(current.expiresAt) <= Date.now())) {
      const stopped = current.target.preparationStartedAt ? await preparationState(current.target.editorTabId, attempt.id, attempt.videoContinuation?.previousRunId) : { stopped: true, pageClosed: true };
      if (!stopped.stopped) return;
      await request(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: stopped.pageClosed, preparationStopped: !!current.target.preparationStartedAt, ...("result" in stopped && stopped.result ? { preparationResult: preparationReason(stopped.result) } : {}) });
    } else if (!current.stoppedAt) throw error;
  }
  await clear();
}
