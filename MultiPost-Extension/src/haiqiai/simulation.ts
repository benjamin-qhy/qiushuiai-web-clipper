import { message } from "./i18n";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export interface SimulationAttempt {
  id: string; leaseToken: string; expiresAt: string; executionMode: string; mode?: "execute" | "reconcile";
  target: { id: string; platform: string; accountId: string; assetIds: string[]; contentDigest: string; downloadRetryCount?: number };
}
export interface SimulationProgress {
  claimRequestId?: string;
  attempt?: SimulationAttempt;
  event?: Record<string, unknown>; intentRequestId?: string; retryCount?: number; retryAt?: number;
}
export interface TaskView {
  taskId: string; executionMode: string; createdAt: string; counts: Record<string, number>;
  targets: { id: string; clientTargetId: string; platform: string; accountId: string; state: string; stage: string; cancelRequested?: boolean; submitIntentAt?: string;
    content: Record<string, unknown>; evidence?: { kind: string; detail: string }; reason?: { message: string; nextAction: string; stage: string; code: string } }[];
}

class SimulationFailure extends Error {
  constructor(readonly code: string, readonly stage: string, readonly detail: string, readonly temporary = false, readonly retryAfterMs = 0) { super(code); }
}

function retryAfter(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(value) || Date.now()) - Date.now());
}

// Simulation only reads API assets; it never opens a platform page or clicks publish.
export async function runSimulation(progress: SimulationProgress, options: {
  apiUrl: string; key: string; executorId: string;
  request: (path: string, body?: unknown, requestId?: string) => Promise<any>;
  save: () => Promise<void>;
}) {
  const { request, save } = options;
  const clear = async () => {
    delete progress.event; delete progress.attempt; delete progress.intentRequestId; delete progress.retryCount; delete progress.retryAt; await save();
  };
  if (!progress.attempt) {
    progress.claimRequestId ||= crypto.randomUUID(); await save();
    const result = await request(`/executors/${options.executorId}/claims`, {}, progress.claimRequestId);
    progress.attempt = result.attempt || undefined; delete progress.claimRequestId; await save();
    if (!progress.attempt) return;
  }
  const attempt = progress.attempt;
  progress.retryCount = Math.max(progress.retryCount || 0, attempt.target.downloadRetryCount || 0);
  if (attempt.executionMode !== "simulation") throw new Error("SIMULATION_ONLY");
  const deliver = async () => {
    const result = await request(`/attempts/${attempt.id}/events`, progress.event, progress.event!.eventId as string);
    delete progress.event; await save();
    return result;
  };
  if (progress.event) {
    try {
      const result = await deliver();
      if (!result.acceptedForReconciliation) { await clear(); return; }
    } catch (error) {
      if (!(error && typeof error === "object" && "status" in error && error.status === 409)) throw error;
    }
  }
  const current = await request(`/attempts/${attempt.id}`);
  if (current.target.attemptId !== attempt.id || current.stoppedAt) { await clear(); return; }
  attempt.expiresAt = current.expiresAt;
  if (current.target.cancelRequested || Date.parse(current.expiresAt) <= Date.now() || ["needs_attention", "outcome_unknown"].includes(current.target.state)) {
    // Simulation has no platform page or external actor. This serialized worker is the entire execution.
    await request(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true, ...(progress.retryAt ? { retryNotBefore: new Date(progress.retryAt).toISOString(), downloadRetryCount: progress.retryCount || 0 } : {}) });
    if (current.target.submitIntentAt) await request(`/targets/${attempt.target.id}/reconcile`, {});
    await clear(); return;
  }
  const unknown = { code: "SIMULATION_RESULT_UNCONFIRMED", message: message("hqResultUnconfirmed"), stage: "reconciliation", causeKnown: false, retryable: false, nextAction: message("hqReconcileAction") };
  if (current.mode === "reconcile" || current.submitIntentAt) {
    const saved = current.reconciliationEvidence;
    progress.event = { leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: current.seq + 1, stage: "reconciliation",
      state: saved ? "draft_saved" : "outcome_unknown", ...(saved ? { evidence: { kind: saved.kind, platform: saved.platform, accountId: saved.accountId, observedAt: saved.observedAt, detail: saved.detail } } : { reason: unknown }) };
    await save(); await deliver(); await clear(); return;
  }
  if (progress.retryAt && Date.now() < progress.retryAt) return;
  if (!progress.event) {
    let renewing: Promise<void> | undefined;
    const renew = (force = false): Promise<void> => {
      if (renewing) return renewing;
      if (force || Date.parse(attempt.expiresAt) - Date.now() < 95_000) {
        renewing = (async () => {
          const result = await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken }).catch(() => { throw new SimulationFailure("LEASE_RENEWAL_FAILED", "validation", message("hqLeaseRenewalFailed")); });
          attempt.expiresAt = result.expiresAt; await save();
        })().finally(() => { renewing = undefined; });
        return renewing;
      }
      return Promise.resolve();
    };
    const abort = new AbortController();
    let renewalError: unknown;
    const heartbeat = setInterval(() => { void renew(true).catch(error => { renewalError = error; abort.abort(); }); }, 30_000);
    let reason: Record<string, unknown> | undefined;
    try {
      for (const assetId of attempt.target.assetIds) {
        await renew();
        const metadata = await request(`/assets/${encodeURIComponent(assetId)}`);
        if (!metadata.ready) throw new SimulationFailure("ASSET_NOT_READY", "download", message("hqAssetNotReady"));
        const response = await fetch(`${options.apiUrl}/v1/assets/${encodeURIComponent(assetId)}/content`, {
          headers: { Authorization: `Bearer ${options.key}` }, redirect: "error", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
        });
        if (!response.ok) throw new SimulationFailure("ASSET_HTTP_ERROR", "download", `${message("hqAssetHttpError")} (${response.status})`, [408, 429, 500, 502, 503, 504].includes(response.status), retryAfter(response.headers.get("Retry-After")));
        if (!response.body) throw new SimulationFailure("ASSET_EMPTY_RESPONSE", "download", message("hqAssetEmptyResponse"));
        const reader = response.body.getReader(); const digest = sha256.create(); let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > metadata.sizeBytes) throw new SimulationFailure("ASSET_SIZE_MISMATCH", "download", message("hqAssetSizeMismatch"));
            digest.update(value); await renew();
          }
          if (size !== metadata.sizeBytes) throw new SimulationFailure("ASSET_SIZE_MISMATCH", "download", message("hqAssetSizeMismatch"));
          if (bytesToHex(digest.digest()) !== metadata.sha256) throw new SimulationFailure("ASSET_DIGEST_MISMATCH", "download", message("hqAssetDigestMismatch"));
        } finally { await reader.cancel(); digest.destroy(); }
      }
    } catch (caught) {
      const error = renewalError || caught;
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
      const retryHeader = error && typeof error === "object" && "retryAfter" in error && typeof error.retryAfter === "string" ? error.retryAfter : null;
      const failure = error instanceof SimulationFailure ? error : status ? new SimulationFailure("ASSET_HTTP_ERROR", "download", `${message("hqAssetHttpError")} (${status})`, [408, 429, 500, 502, 503, 504].includes(status), retryAfter(retryHeader)) : undefined;
      if ((failure?.temporary || timeout || error instanceof TypeError) && (progress.retryCount || 0) < 2) {
        progress.retryCount = (progress.retryCount || 0) + 1;
        progress.retryAt = Date.now() + Math.max(progress.retryCount === 1 ? 5000 : 15000, failure?.retryAfterMs || 0);
        await save(); return;
      }
      reason = {
        code: failure?.code || (timeout ? "ASSET_DOWNLOAD_TIMEOUT" : "ASSET_READ_UNKNOWN"),
        message: failure?.detail || message(timeout ? "hqAssetTimeout" : "hqAssetUnknown"),
        stage: failure?.stage || "download", causeKnown: !!failure || timeout, retryable: false,
        nextAction: message(failure?.code === "LEASE_RENEWAL_FAILED" ? "hqLeaseRenewalAction" : "hqSimulationAssetAction"),
      };
    } finally { clearInterval(heartbeat); await renewing; }
    if (renewalError) throw renewalError;
    if (!reason) {
      progress.intentRequestId ||= crypto.randomUUID(); await save();
      await request(`/attempts/${attempt.id}/submit-intent`, { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: attempt.target.accountId, assetsChecked: true }, progress.intentRequestId);
      const authorized = await request(`/attempts/${attempt.id}`);
      if (authorized.stoppedAt || authorized.target.cancelRequested || authorized.target.state !== "running" || Date.parse(authorized.expiresAt) <= Date.now()) return;
    }
    progress.event = {
      leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: 1, stage: reason?.stage || "simulation", state: reason ? "failed" : "draft_saved",
      ...(reason ? { reason } :
        { evidence: { kind: "simulation_receipt", platform: attempt.target.platform, accountId: attempt.target.accountId, observedAt: new Date().toISOString(), detail: message("hqSimulationEvidence") } }),
    };
    await save();
  }
  await deliver(); await clear();
}
