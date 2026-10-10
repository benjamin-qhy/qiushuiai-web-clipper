import { runLivePreflight, type PreflightProgress } from "./preflight";
import { inspectRednote, type RednoteInspection } from "./rednote";
import { runSimulation, type SimulationProgress, type TaskView } from "./simulation";
import { message as localize } from "./i18n";

// The credential stays in the extension background; messages only return a public view.
const STORAGE_KEY = "haiqiaiPublishingConnection";
const ALARM = "haiqiai-publishing-heartbeat";
export interface ExecutorView {
  id: string; computerId: string; computerName?: string; browserName: string; profileName: string;
  online: boolean; lastHeartbeat: string | null;
}
export interface AccountView { id: string; platform: string; displayName: string; bindingState: string }
export interface ConnectionView {
  xiaohongshu?: RednoteInspection;
  connected: boolean; status: "disconnected" | "connected" | "offline" | "revoked";
  apiUrl?: string; executor?: ExecutorView; accounts?: AccountView[]; tasks?: TaskView[]; nextCursor?: string | null; error?: string;
}
interface SavedState {
  installationId: string;
  pending?: { apiUrl: string; code: string; requestId: string; extensionVersion: string };
  connection?: { apiUrl: string; executorId: string; key: string; instanceId: string };
  simulation?: SimulationProgress;
  preflight?: PreflightProgress;
  view: ConnectionView;
}
class ConnectionError extends Error {
  status: number;
  constructor(status: number, message: string, readonly retryAfter: string | null = null) { super(message); this.status = status; }
}
function endpoint(value: unknown): string {
  if (typeof value !== "string") throw new Error(localize("hqEnterApi"));
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error(localize("hqHttpsRequired"));
  }
  return url.href.replace(/\/$/, "");
}
async function request(apiUrl: string, path: string, key?: string, body?: unknown, requestId: string = crypto.randomUUID()): Promise<any> {
  const response = await fetch(`${apiUrl}/v1${path}`, {
    method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), "Idempotency-Key": requestId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const message = response.status === 401 ? localize("hqInvalidKey") : response.status === 409 ? localize("hqApiConflict") : localize("hqRejected");
    throw new ConnectionError(response.status, message, response.headers.get("Retry-After"));
  }
  return response.json();
}

export function registerPublishingConnection() {
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation); queue = next.catch(() => undefined); return next;
  };
  // Chrome storage.local is shared with trusted extension pages, never content scripts.
  const secured = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const load = async (): Promise<SavedState> => {
    await secured;
    return (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || { installationId: crypto.randomUUID(), view: { connected: false, status: "disconnected" } };
  };
  const save = (state: SavedState) => chrome.storage.local.set({ [STORAGE_KEY]: state });
  const refresh = async (state: SavedState): Promise<ConnectionView> => {
    if (!state.connection || state.view.status === "revoked") return state.view;
    const { apiUrl, key, executorId, instanceId } = state.connection;
    try {
      const discovery = await request(apiUrl, "/executors", key);
      if (discovery.instanceId !== instanceId) throw new Error(localize("hqInstanceChanged"));
      await request(apiUrl, `/executors/${executorId}/heartbeat`, key, { extensionVersion: chrome.runtime.getManifest().version, accountObservations: [] });
      const updated = await request(apiUrl, "/executors", key);
      const tasks = await request(apiUrl, "/tasks?limit=100", key);
      const accounts = await request(apiUrl, `/accounts?executorId=${encodeURIComponent(executorId)}`, key);
      state.view = { connected: true, status: "connected", apiUrl, executor: updated.executors.find((executor: ExecutorView) => executor.id === executorId), accounts: accounts.accounts, tasks: tasks.tasks, nextCursor: tasks.nextCursor };
    } catch (error) {
      const revoked = error instanceof ConnectionError && error.status === 401;
      state.view = { ...state.view, connected: true, status: revoked ? "revoked" : "offline", error: revoked ? error.message : localize("hqNetworkError") };
      if (state.view.executor) state.view.executor.online = false;
    }
    await save(state); return state.view;
  };
  const simulate = async (state: SavedState) => {
    if (!state.connection || state.view.status !== "connected") return state.view;
    const { apiUrl, key, executorId } = state.connection;
    state.simulation ||= {};
    await runSimulation(state.simulation, { apiUrl, key, executorId,
      request: (path, body, id) => request(apiUrl, path, key, body, id), save: () => save(state) });
    if (state.simulation.retryAt) await chrome.alarms.create(ALARM + "-retry", { when: state.simulation.retryAt });
    return refresh(state);
  };
  const prepare = async (state: SavedState) => {
    if (!state.connection || state.view.status !== "connected") return state.view;
    const { apiUrl, key, executorId } = state.connection;
    state.preflight ||= {};
    await runLivePreflight(state.preflight, { apiUrl, key, executorId,
      request: (path, body, id) => request(apiUrl, path, key, body, id), save: () => save(state) });
    return refresh(state);
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== "HAIQIAI_PUBLISHING_CONNECTION") return;
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("publish.html")) {
      respond({ error: localize("hqOnlyWorkspace") }); return;
    }
    void serialized(async () => {
      const state = await load();
      if (message.action === "inspectXiaohongshu") {
        state.view.xiaohongshu = await inspectRednote(typeof message.platformAccountId === "string" ? message.platformAccountId : undefined); await save(state); return state.view;
      }
      if (message.action === "pair") {
        if (state.connection && state.view.status !== "revoked") throw new Error(localize("hqRevokeFirst"));
        const apiUrl = endpoint(message.apiUrl);
        if (typeof message.code !== "string" || !message.code.trim()) throw new Error(localize("hqEnterCode"));
        if (!state.pending || state.pending.apiUrl !== apiUrl || state.pending.code !== message.code.trim()) {
          state.pending = { apiUrl, code: message.code.trim(), requestId: crypto.randomUUID(), extensionVersion: chrome.runtime.getManifest().version };
          await save(state);
        }
        const pending = state.pending;
        const result = await request(apiUrl, "/executors/pair", undefined, { pairingCode: pending.code, installationId: state.installationId, extensionVersion: pending.extensionVersion }, pending.requestId);
        state.connection = { apiUrl, executorId: result.executorId, key: result.key, instanceId: result.instanceId };
        delete state.pending; delete state.simulation; delete state.preflight;
        state.view = { connected: true, status: "connected", apiUrl, executor: result.executor, accounts: [] };
        await save(state);
        return refresh(state);
      }
      if (message.action === "nextTasks" && state.connection && state.view.nextCursor) {
        const result = await request(state.connection.apiUrl, `/tasks?limit=100&cursor=${encodeURIComponent(state.view.nextCursor)}`, state.connection.key);
        state.view.tasks = [...(state.view.tasks || []), ...result.tasks]; state.view.nextCursor = result.nextCursor;
        await save(state); return state.view;
      }
      if (message.action === "reconcile" && state.connection) {
        if (typeof message.targetId !== "string" || !state.view.tasks?.some(task => task.targets.some(target => target.id === message.targetId))) throw new Error(localize("hqUnsupportedAction"));
        await request(state.connection.apiUrl, `/targets/${encodeURIComponent(message.targetId)}/reconcile`, state.connection.key, {});
        await simulate(state); return refresh(state);
      }
      if (message.action === "prepare") return prepare(state);
      if (message.action === "simulate") return simulate(state);
      if (message.action === "status" || message.action === "refresh") return refresh(state);
      throw new Error(localize("hqUnsupportedAction"));
    }).then(data => respond({ data }), error => respond({ error: error instanceof ConnectionError ? error.message : error instanceof TypeError ? localize(message.action === "pair" ? "hqInvalidEndpoint" : message.action === "prepare" ? "hqLivePending" : "hqSimulationPending") : error.message }));
    return true;
  });
  const beat = () => serialized(async () => {
    const state = await load(); await refresh(state);
    try { await simulate(state); }
    catch { state.view.error = localize("hqSimulationPending"); await save(state); return; }
    try { return await prepare(state); }
    catch { state.view.error = localize("hqLivePending"); await save(state); }
  }).catch(() => undefined);
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM || alarm.name === ALARM + "-retry") return beat(); });
  const schedule = () => { void chrome.alarms.create(ALARM, { periodInMinutes: 0.5 }); void beat(); };
  chrome.runtime.onStartup.addListener(schedule);
  chrome.runtime.onInstalled.addListener(schedule);
  schedule();
}
