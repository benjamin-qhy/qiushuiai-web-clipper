import React, { useEffect, useState } from "react";
import { Button, Card, CardBody, HeroUIProvider, Input } from "@heroui/react";
import { Send } from "lucide-react";
import type { ConnectionView } from "./connection";
import { message } from "./i18n";

export default function PublishingWorkspace() {
  const [view, setView] = useState<ConnectionView>({ connected: false, status: "disconnected" });
  const [apiUrl, setApiUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: "status" | "refresh" | "pair" | "simulate" | "nextTasks" | "reconcile" | "inspectXiaohongshu", targetId?: string) {
    setBusy(true); setError("");
    try {
      const result = await chrome.runtime.sendMessage({ type: "HAIQIAI_PUBLISHING_CONNECTION", action, ...(targetId ? { targetId } : {}), ...(action === "pair" ? { apiUrl, code } : {}) });
      if (result.error) throw new Error(result.error);
      setView(result.data);
      if (action === "pair") setCode("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : message("hqConnectionError")); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (typeof globalThis.chrome?.runtime?.sendMessage === "function") void run("status"); }, []);
  const statusLabels = { disconnected: "hqPublishDisconnected", connected: "hqConnected", offline: "hqOffline", revoked: "hqRevoked" } as const;
  const stages: Record<string, "hqStageValidation" | "hqStageDownload" | "hqStageSimulation" | "hqStageReconciliation" | "hqStageSubmit"> = { validation: "hqStageValidation", download: "hqStageDownload", simulation: "hqStageSimulation", reconciliation: "hqStageReconciliation", submit_intent: "hqStageSubmit" };
  return (
    <HeroUIProvider>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Send aria-hidden="true" size={24} />
            <h1 className="text-2xl font-semibold">{message("hqPublishTitle")}</h1>
          </div>
          <a className="text-primary underline" href="/options.html">{message("hqClipperSettings")}</a>
        </header>
        <Card>
          <CardBody className="gap-4 p-6">
            <h2 className="text-lg font-medium">{message(statusLabels[view.status])}</h2>
            <p className="text-default-600">{message("hqConnectionScope")}</p>
            <Button onPress={() => void run("inspectXiaohongshu")} isDisabled={busy}>{message("hqXhsInspect")}</Button>
            {view.xiaohongshu && <div className="flex flex-col gap-2 text-sm">
              {view.xiaohongshu.displayName && <p>{message("hqXhsObservedName")}: {view.xiaohongshu.displayName}</p>}
              {view.xiaohongshu.creatorAccountNumber && <p>{message("hqXhsObservedNumber")}: {view.xiaohongshu.creatorAccountNumber}</p>}
              <p>{view.xiaohongshu.message}</p>
            </div>}
            {(!view.connected || view.status === "revoked") && (
              <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void run("pair"); }}>
                <Input type="url" label={message("hqApiUrl")} value={apiUrl} onValueChange={setApiUrl} isRequired placeholder="http://127.0.0.1:43129" />
                <Input type="password" label={message("hqPairingCode")} value={code} onValueChange={setCode} isRequired autoComplete="off" />
                <p className="text-sm text-default-600">{message("hqPairingHelp")}</p>
                <Button type="submit" color="primary" isDisabled={busy || !apiUrl.trim() || !code.trim()}>{message("hqPair")}</Button>
              </form>
            )}
            {view.connected && (
              <div className="flex flex-col gap-3">
                <p>{message("hqApiUrl")}: {view.apiUrl}</p>
                <p>{message("hqComputer")}: {view.executor?.computerName || view.executor?.computerId}</p>
                <p>{message("hqLocation")}: {view.executor?.browserName} / {view.executor?.profileName}</p>
                <p className="break-all text-sm text-default-600">{message("hqExecutorId")}: {view.executor?.id}</p>
                <p>{message("hqLastHeartbeat")}: {view.executor?.lastHeartbeat ? new Date(view.executor.lastHeartbeat).toLocaleString() : message("hqNeverObserved")}</p>
                <h3 className="font-medium">{message("hqAccounts")}</h3>
                {!view.accounts?.length && <p>{message("hqNoAccounts")}</p>}
                <ul>{view.accounts?.map(account => <li key={account.id}>{account.platform} · {account.displayName} · {message(account.bindingState === "matched" ? "hqAccountMatched" : account.bindingState === "mismatch" ? "hqAccountMismatch" : account.bindingState === "logged_out" ? "hqAccountLoggedOut" : "hqAccountUnobserved")}</li>)}</ul>
                <p className="text-sm text-default-600">{message("hqRevokeHelp")}</p>
                <Button onPress={() => void run("refresh")} isDisabled={busy}>{message("hqRefresh")}</Button>
                <Button color="primary" onPress={() => void run("simulate")} isDisabled={busy || view.status !== "connected"}>{message("hqRunSimulation")}</Button>
                <h3 className="font-medium">{message("hqTasks")}</h3>
                {!view.tasks?.length && <p>{message("hqNoTasks")}</p>}
                {view.tasks?.map(task => <section key={task.taskId} className="flex flex-col gap-3 rounded-lg border border-divider p-4">
                  <h4 className="font-medium">{message("hqSimulationTask")}</h4>
                  <p className="break-all text-sm text-default-600">{task.taskId}</p>
                  {task.targets.map(target => <div key={target.id} className="flex flex-col gap-2">
                    <p>{target.platform} · {target.clientTargetId} · {message(target.state === "queued" ? "hqQueued" : target.state === "running" ? "hqRunning" : target.state === "draft_saved" ? "hqSimulationSaved" : target.state === "failed" ? "hqFailed" : target.state === "outcome_unknown" ? "hqOutcomeUnknown" : target.state === "cancelled" ? "hqCancelled" : "hqNeedsAttention")}</p>
                    <details><summary>{message("hqContentSnapshot")}</summary><pre className="whitespace-pre-wrap break-words text-sm">{[target.content.title, target.content.content, target.content.htmlContent].filter(value => typeof value === "string").join("\n\n")}</pre></details>
                    {target.evidence && <p className="text-sm">{target.evidence.detail}</p>}
                    {target.cancelRequested && <p>{message("hqCancelPending")}</p>}
                    {target.submitIntentAt && <p className="text-sm">{message("hqSubmitIntent")}</p>}
                    {target.state === "outcome_unknown" && <Button isDisabled={busy || view.status !== "connected"} onPress={() => void run("reconcile", target.id)}>{message("hqReconcile")}</Button>}
                    {target.reason && <p role="alert" className="text-danger">{target.reason.message} · {message(stages[target.reason.stage] || "hqStageValidation")} · {target.reason.code} · {target.reason.nextAction}</p>}
                  </div>)}
                </section>)}
                {view.nextCursor && <Button onPress={() => void run("nextTasks")} isDisabled={busy}>{message("hqMoreTasks")}</Button>}
              </div>
            )}
            {(error || view.error) && <p role="alert" className="text-danger">{error || view.error}</p>}
          </CardBody>
        </Card>
      </main>
    </HeroUIProvider>
  );
}
