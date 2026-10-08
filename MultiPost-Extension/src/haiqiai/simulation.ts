import { message } from "./i18n";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export interface SimulationAttempt {
  id: string; leaseToken: string; expiresAt: string; executionMode: string;
  target: { id: string; platform: string; accountId: string; assetIds: string[]; contentDigest: string };
}
export interface SimulationProgress {
  claimRequestId?: string;
  attempt?: SimulationAttempt;
  event?: Record<string, unknown>;
}
export interface TaskView {
  taskId: string; executionMode: string; createdAt: string; counts: Record<string, number>;
  targets: { id: string; clientTargetId: string; platform: string; accountId: string; state: string; stage: string;
    content: Record<string, unknown>; evidence?: { kind: string; detail: string }; reason?: { message: string; nextAction: string } }[];
}

class SimulationFailure extends Error {
  constructor(readonly code: string, readonly stage: string, readonly detail: string) { super(code); }
}

// Simulation only reads API assets; it never opens a platform page or clicks publish.
export async function runSimulation(progress: SimulationProgress, options: {
  apiUrl: string; key: string; executorId: string;
  request: (path: string, body?: unknown, requestId?: string) => Promise<any>;
  save: () => Promise<void>;
}) {
  const { request, save } = options;
  if (!progress.attempt) {
    progress.claimRequestId ||= crypto.randomUUID(); await save();
    const result = await request(`/executors/${options.executorId}/claims`, {}, progress.claimRequestId);
    progress.attempt = result.attempt || undefined; delete progress.claimRequestId; await save();
    if (!progress.attempt) return;
  }
  const attempt = progress.attempt;
  if (attempt.executionMode !== "simulation") throw new Error("SIMULATION_ONLY");
  if (!progress.event) {
    const renew = async () => {
      if (Date.parse(attempt.expiresAt) - Date.now() < 45_000) {
        const result = await request(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken }).catch(() => { throw new SimulationFailure("LEASE_RENEWAL_FAILED", "validation", message("hqLeaseRenewalFailed")); });
        attempt.expiresAt = result.expiresAt; await save();
      }
    };
    let reason: Record<string, unknown> | undefined;
    try {
      for (const assetId of attempt.target.assetIds) {
        await renew();
        const metadata = await request(`/assets/${encodeURIComponent(assetId)}`);
        if (!metadata.ready) throw new SimulationFailure("ASSET_NOT_READY", "download", message("hqAssetNotReady"));
        const response = await fetch(`${options.apiUrl}/v1/assets/${encodeURIComponent(assetId)}/content`, {
          headers: { Authorization: `Bearer ${options.key}` }, redirect: "error", signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new SimulationFailure("ASSET_HTTP_ERROR", "download", `${message("hqAssetHttpError")} (${response.status})`);
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
    } catch (error) {
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      const failure = error instanceof SimulationFailure ? error : undefined;
      reason = {
        code: failure?.code || (timeout ? "ASSET_DOWNLOAD_TIMEOUT" : "ASSET_READ_UNKNOWN"),
        message: failure?.detail || message(timeout ? "hqAssetTimeout" : "hqAssetUnknown"),
        stage: failure?.stage || "download", causeKnown: !!failure || timeout, retryable: false,
        nextAction: message(failure?.code === "LEASE_RENEWAL_FAILED" ? "hqLeaseRenewalAction" : "hqSimulationAssetAction"),
      };
    }
    progress.event = {
      leaseToken: attempt.leaseToken, eventId: crypto.randomUUID(), seq: 1, stage: reason?.stage || "simulation", state: reason ? "failed" : "draft_saved",
      ...(reason ? { reason } :
        { evidence: { kind: "simulation_receipt", platform: attempt.target.platform, accountId: attempt.target.accountId, observedAt: new Date().toISOString(), detail: message("hqSimulationEvidence") } }),
    };
    await save();
  }
  const eventId = progress.event.eventId as string;
  await request(`/attempts/${attempt.id}/events`, progress.event, eventId);
  delete progress.event; delete progress.attempt; await save();
}
