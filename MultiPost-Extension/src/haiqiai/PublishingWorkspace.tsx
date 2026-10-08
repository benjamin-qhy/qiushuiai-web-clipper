import React, { useEffect, useState } from "react";
import { Button, Card, CardBody, HeroUIProvider, Input } from "@heroui/react";
import { Send } from "lucide-react";
import type { ConnectionView } from "./connection";
import messages from "./messages.json";

function message(key: keyof typeof messages): string {
  return globalThis.chrome?.i18n?.getMessage(key) || messages[key].message;
}

export default function PublishingWorkspace() {
  const [view, setView] = useState<ConnectionView>({ connected: false, status: "disconnected" });
  const [apiUrl, setApiUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: "status" | "refresh" | "pair") {
    setBusy(true); setError("");
    try {
      const result = await chrome.runtime.sendMessage({ type: "HAIQIAI_PUBLISHING_CONNECTION", action, ...(action === "pair" ? { apiUrl, code } : {}) });
      if (result.error) throw new Error(result.error);
      setView(result.data);
      if (action === "pair") setCode("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : message("hqConnectionError")); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (typeof globalThis.chrome?.runtime?.sendMessage === "function") void run("status"); }, []);
  const statusLabels = { disconnected: "hqPublishDisconnected", connected: "hqConnected", offline: "hqOffline", revoked: "hqRevoked" } as const;
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
              </div>
            )}
            {(error || view.error) && <p role="alert" className="text-danger">{error || view.error}</p>}
          </CardBody>
        </Card>
      </main>
    </HeroUIProvider>
  );
}
