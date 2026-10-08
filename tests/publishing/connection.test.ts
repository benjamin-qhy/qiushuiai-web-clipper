// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startServer } from '../../packages/publishing-api/server.mts'
import { registerPublishingConnection } from '../../MultiPost-Extension/src/haiqiai/connection'

afterEach(() => vi.unstubAllGlobals())
it('pairs through the extension message boundary, persists its credential privately and stops on revocation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'haiqiai-extension-'))
  const adminKey = 'test-admin-key-with-at-least-32-characters'
  const server = await startServer({ directory, adminKey, port: 0 })
  const local: Record<string, unknown> = {}
  let listener: Function = () => {}; let alarmListener: Function = () => {}
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test-extension/${path}`, getManifest: () => ({ version: '1.0.0' }), onMessage: { addListener: (handler: Function) => { listener = handler } }, onStartup: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
    storage: { local: { setAccessLevel: vi.fn(async () => {}), get: async (key: string) => ({ [key]: local[key] }), set: async (value: object) => Object.assign(local, value) } },
    alarms: { create: vi.fn(async () => {}), onAlarm: { addListener: (handler: Function) => { alarmListener = handler } } },
  })
  async function api(path: string, body: unknown) {
    const response = await fetch(`${server.url}/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) })
    return response.json()
  }
  const send = (payload: object, url = 'chrome-extension://test-extension/publish.html') => new Promise<any>(resolve => listener({ type: 'HAIQIAI_PUBLISHING_CONNECTION', ...payload }, { id: 'test-extension', url }, resolve))
  try {
    const computer = await api('/computers', { name: '测试电脑' })
    const pairing = await api('/pairing-codes', { computerId: computer.id, browserName: 'Chrome', profileName: '工作' })
    registerPublishingConnection()
    const forbidden = await send({ action: 'pair', apiUrl: server.url, code: pairing.code }, 'https://example.com/')
    expect(forbidden.error).toBeTruthy()
    const result = await send({ action: 'pair', apiUrl: server.url, code: pairing.code })
    expect(result.data).toMatchObject({ connected: true, executor: { computerId: computer.id, browserName: 'Chrome', online: true } })
    expect(JSON.stringify(result)).not.toContain('"key"')
    const keys = await fetch(`${server.url}/v1/keys`, { headers: { Authorization: `Bearer ${adminKey}` } }).then(response => response.json())
    await api(`/keys/${keys.keys[0].id}/revoke`, {})
    await alarmListener({ name: 'haiqiai-publishing-heartbeat' })
    const revoked = await send({ action: 'status' })
    expect(revoked.data.status).toBe('revoked')
  } finally { await server.close(); rmSync(directory, { recursive: true, force: true }) }
})
