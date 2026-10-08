// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startServer } from '../../packages/publishing-api/server.mts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'haiqiai-recovery-'))
  let time = Date.now()
  const admin = 'recovery-test-admin-key-at-least-32-characters'
  let server = await startServer({ directory, adminKey: admin, port: 0, now: () => time })
  cleanups.push(async () => { await server.close(); rmSync(directory, { recursive: true, force: true }) })
  async function call(path: string, body?: unknown, token = admin, idem = randomUUID()) {
    const response = await fetch(server.url + '/v1' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  const computer = (await call('/computers', { name: '恢复测试电脑' })).data
  const pair = async (browserName: string) => {
    const { code } = (await call('/pairing-codes', { computerId: computer.id, browserName, profileName: '默认' })).data
    return (await call('/executors/pair', { pairingCode: code, installationId: randomUUID(), extensionVersion: '1' }, '')).data
  }
  const executor = await pair('Chrome'); const other = await pair('Edge')
  const account = (await call('/accounts', { executorId: executor.executorId, platform: 'xiaohongshu', platformAccountId: 'demo', displayName: '模拟账号' })).data
  const submit = async () => (await call('/tasks', { executionMode: 'simulation', confirmation: { confirmedAt: new Date(time).toISOString(), contentRevision: 'r1' }, targets: [{ clientTargetId: 'a', computerId: computer.id, browserId: executor.executor.browserId, profileId: executor.executor.profileId, platform: 'xiaohongshu', accountId: account.id, content: { type: 'dynamic', content: '仅模拟' } }] })).data
  const claim = async () => (await call(`/executors/${executor.executorId}/claims`, {}, executor.key)).data.attempt
  return { call, executor, other, account, submit, claim, advance: (ms: number) => { time += ms }, restart: async () => { await server.close(); server = await startServer({ directory, adminKey: admin, port: 0, now: () => time }) } }
}
it('cancels queued targets and fences a running cancellation against submit intent', async () => {
  const { call, executor, other, submit, claim } = await setup()
  const queued = await submit()
  expect((await call(`/tasks/${queued.taskId}/cancel`, {})).data.counts).toEqual({ cancelled: 1 })
  expect(await claim()).toBeNull()
  const task = await submit(); const attempt = await claim()
  const cancel = await call(`/tasks/${task.taskId}/cancel`, {})
  expect(cancel.data.targets[0]).toMatchObject({ state: 'running', cancelRequested: true })
  const intent = { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: attempt.target.accountId, assetsChecked: true }
  expect((await call(`/attempts/${attempt.id}/submit-intent`, intent, executor.key)).status).toBe(409)
  expect((await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, other.key)).status).toBe(403)
  expect((await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, executor.key)).data.state).toBe('cancelled')
  expect((await call(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken }, executor.key)).status).toBe(409)
})

it('keeps an expired submission unknown across restart and permits only reconciliation on its original executor', async () => {
  const { call, executor, submit, claim, advance, restart } = await setup()
  const task = await submit(); const attempt = await claim()
  const intent = { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: attempt.target.accountId, assetsChecked: true }
  expect((await call(`/attempts/${attempt.id}/submit-intent`, intent, executor.key)).data.authorized).toBe(true)
  advance(120_001); await restart()
  const expired = (await call(`/tasks/${task.taskId}`)).data.targets[0]
  expect(expired).toMatchObject({ state: 'outcome_unknown', reason: { code: 'SUBMISSION_INTERRUPTED', causeKnown: false, retryable: false } })
  expect(await claim()).toBeNull()
  expect((await call(`/targets/${expired.id}/resume`, {})).data.mode).toBe('reconcile')
  expect(await claim()).toBeNull() // expiry alone never releases the old execution
  expect((await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, executor.key)).data.state).toBe('outcome_unknown')
  const reconciliation = await claim()
  expect(reconciliation).toMatchObject({ mode: 'reconcile', target: { executorId: executor.executorId, id: expired.id } })
  expect((await call(`/attempts/${reconciliation.id}/submit-intent`, { ...intent, leaseToken: reconciliation.leaseToken }, executor.key)).status).toBe(409)
  expect((await call(`/tasks/${task.taskId}/cancel`, {})).data.targets[0].state).not.toBe('cancelled')
  expect((await call(`/attempts/${attempt.id}/renew`, { leaseToken: attempt.leaseToken }, executor.key)).status).toBe(409)
})

it('requires stop confirmation before bounded pre-submit recovery and never lets stale attempts advance state', async () => {
  const { call, executor, submit, claim, advance } = await setup()
  const task = await submit(); let attempt = await claim(); const first = attempt
  for (const delay of [5000, 15000]) {
    advance(120_001)
    expect((await call(`/tasks/${task.taskId}`)).data.targets[0].state).toBe('needs_attention')
    expect(await claim()).toBeNull()
    expect((await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: false }, executor.key)).status).toBe(422)
    expect((await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, executor.key)).data.state).toBe('queued')
    expect(await claim()).toBeNull(); advance(delay); attempt = await claim()
    expect(attempt.target.executorId).toBe(executor.executorId)
  }
  const stale = { leaseToken: first.leaseToken, eventId: randomUUID(), seq: 1, state: 'running', stage: 'download' }
  expect((await call(`/attempts/${first.id}/events`, stale, executor.key)).status).toBe(409)
  advance(120_001)
  await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, executor.key)
  expect(await claim()).toBeNull()
  const target = (await call(`/tasks/${task.taskId}`)).data.targets[0]
  expect(target).toMatchObject({ state: 'needs_attention', reason: { code: 'RECOVERY_EXHAUSTED', retryable: false } })
  await call(`/targets/${target.id}/resume`, {})
  advance(15_000)
  expect((await claim()).target.id).toBe(target.id)
})

it('accepts only associated evidence after intent, preserves late evidence without restoring execution authority', async () => {
  const { call, executor, submit, claim, advance } = await setup()
  const task = await submit(); const attempt = await claim()
  const event = { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, stage: 'simulation', state: 'draft_saved', evidence: { kind: 'simulation_receipt', platform: 'xiaohongshu', accountId: attempt.target.accountId, observedAt: new Date().toISOString(), detail: '模拟完成' } }
  await call(`/attempts/${attempt.id}/submit-intent`, { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: attempt.target.accountId, assetsChecked: true }, executor.key)
  expect((await call(`/attempts/${attempt.id}/events`, { ...event, state: 'failed', evidence: undefined, reason: { code: 'TIMEOUT', message: '超时', stage: 'simulation', causeKnown: true, retryable: true, nextAction: '重试' } }, executor.key)).status).toBe(422)
  advance(120_001)
  const late = await call(`/attempts/${attempt.id}/events`, event, executor.key)
  expect(late.data).toMatchObject({ acceptedForReconciliation: true, state: 'outcome_unknown' })
  expect((await call(`/attempts/${attempt.id}/events`, event, executor.key)).data).toEqual(late.data)
  expect((await call(`/tasks/${task.taskId}`)).data.targets[0].state).toBe('outcome_unknown')
  await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, executor.key)
  await call(`/targets/${attempt.target.id}/reconcile`, {})
  const check = await claim()
  expect((await call(`/attempts/${check.id}`, undefined, executor.key)).data.reconciliationEvidence).toMatchObject(event.evidence)
  expect((await call(`/attempts/${check.id}/events`, { ...event, leaseToken: check.leaseToken, eventId: randomUUID(), stage: 'reconciliation' }, executor.key)).status).toBe(200)
  expect((await call(`/tasks/${task.taskId}`)).data.counts).toEqual({ draft_saved: 1 })
})

it('rejects completion without submit intent and requires explicit duplicate-risk confirmation for replacement tasks', async () => {
  const { call, executor, submit, claim, advance } = await setup()
  const task = await submit(); const attempt = await claim()
  const event = { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, stage: 'simulation', state: 'draft_saved', evidence: { kind: 'simulation_receipt', platform: 'xiaohongshu', accountId: attempt.target.accountId, observedAt: new Date().toISOString(), detail: '模拟' } }
  expect((await call(`/attempts/${attempt.id}/events`, event, executor.key)).status).toBe(422)
  await call(`/attempts/${attempt.id}/submit-intent`, { leaseToken: attempt.leaseToken, contentDigest: attempt.target.contentDigest, accountId: attempt.target.accountId, assetsChecked: true }, executor.key)
  advance(120_001)
  const original = (await call(`/tasks/${task.taskId}`)).data.targets[0]
  const replacement = { executionMode: 'simulation', confirmation: { confirmedAt: new Date().toISOString(), contentRevision: 'replacement' }, targets: [{ clientTargetId: 'replacement', computerId: original.computerId, browserId: original.browserId, profileId: original.profileId, platform: original.platform, accountId: original.accountId, content: original.content, replacesTargetId: original.id }] }
  expect((await call('/tasks', replacement)).status).toBe(422)
  expect((await call('/tasks', { ...replacement, confirmation: { ...replacement.confirmation, duplicateRiskAccepted: true } })).status).toBe(201)
  expect((await call(`/tasks/${task.taskId}`)).data.targets[0].state).toBe('outcome_unknown')
})

it('cancels an expired pre-submit attempt only after the original installation confirms stopping', async () => {
  const { call, executor, submit, claim, advance } = await setup()
  const task = await submit(); const attempt = await claim(); advance(120_001)
  const cancellation = await call(`/tasks/${task.taskId}/cancel`, {})
  expect(cancellation.data.targets[0]).toMatchObject({ state: 'needs_attention', cancelRequested: true })
  await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true }, executor.key)
  const cancelled = (await call(`/tasks/${task.taskId}`)).data.targets[0]
  expect(cancelled.state).toBe('cancelled')
  expect(cancelled.cancelRequested).toBeUndefined()
  expect(cancelled.reason).toBeUndefined()
})

it('preserves a long Retry-After and consumed download retries across expired-lease recovery', async () => {
  const { call, executor, submit, claim, advance } = await setup()
  await submit(); const attempt = await claim()
  const deadline = Date.now() + 600_000
  advance(120_001)
  await call(`/attempts/${attempt.id}/recover`, { leaseToken: attempt.leaseToken, executionStopped: true, pageClosed: true, retryNotBefore: new Date(deadline).toISOString(), downloadRetryCount: 2 }, executor.key)
  advance(15_000); expect(await claim()).toBeNull()
  advance(600_000)
  expect((await claim()).target.downloadRetryCount).toBe(2)
})
it('does not allow an unsubmitted execution to claim an unknown publication outcome', async () => {
  const { call, executor, submit, claim } = await setup()
  await submit(); const attempt = await claim()
  expect((await call(`/attempts/${attempt.id}/events`, { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, stage: 'simulation', state: 'outcome_unknown', reason: { code: 'UNKNOWN', message: '未知', stage: 'simulation', causeKnown: false, retryable: false, nextAction: '核对' } }, executor.key)).status).toBe(422)
})

it('does not claim a pending reconciliation after a pre-submit target is cancelled', async () => {
  const { call, executor, submit, claim } = await setup()
  const task = await submit(); const attempt = await claim()
  await call(`/attempts/${attempt.id}/events`, { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, state: 'failed', stage: 'download', reason: { code: 'MISSING', message: '缺少素材', stage: 'download', causeKnown: true, retryable: false, nextAction: '检查素材' } }, executor.key)
  await call(`/targets/${attempt.target.id}/reconcile`, {})
  expect((await call(`/tasks/${task.taskId}/cancel`, {})).data.counts).toEqual({ cancelled: 1 })
  expect(await claim()).toBeNull()
})

it('never resumes execution after a read-only check became unknown, even if that check later expires', async () => {
  const { call, executor, submit, claim, advance } = await setup()
  const task = await submit(); const attempt = await claim()
  await call(`/attempts/${attempt.id}/events`, { leaseToken: attempt.leaseToken, eventId: randomUUID(), seq: 1, state: 'failed', stage: 'download', reason: { code: 'MISSING', message: '缺少素材', stage: 'download', causeKnown: true, retryable: false, nextAction: '检查' } }, executor.key)
  await call(`/targets/${attempt.target.id}/reconcile`, {})
  const first = await claim()
  await call(`/attempts/${first.id}/events`, { leaseToken: first.leaseToken, eventId: randomUUID(), seq: 1, state: 'outcome_unknown', stage: 'reconciliation', reason: { code: 'UNKNOWN', message: '无法确认', stage: 'reconciliation', causeKnown: false, retryable: false, nextAction: '核对' } }, executor.key)
  await call(`/targets/${attempt.target.id}/resume`, {})
  const second = await claim(); expect(second.mode).toBe('reconcile'); advance(120_001)
  await call(`/attempts/${second.id}/recover`, { leaseToken: second.leaseToken, executionStopped: true, pageClosed: true }, executor.key)
  expect((await call(`/targets/${attempt.target.id}/resume`, {})).data.mode).toBe('reconcile')
  const third = await claim(); expect(third.mode).toBe('reconcile')
  expect((await call(`/tasks/${task.taskId}`)).data.targets[0].submitIntentAt).toBeUndefined()
})
