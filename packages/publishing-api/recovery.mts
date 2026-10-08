import type { Credential, State } from './model.mts'
import type { Target } from './tasks.mts'
import { fail, fields } from './protocol.mts'

export function interrupted(target: Target, now: number, revoked = false) {
  const submitted = !!target.submitIntentAt || !!target.reconcileOnly
  target.state = submitted ? 'outcome_unknown' : 'needs_attention'
  target.reason = { code: submitted ? 'SUBMISSION_INTERRUPTED' : revoked ? 'EXECUTOR_REVOKED' : 'LEASE_EXPIRED',
    message: submitted ? '提交意图已记录，但执行中断，结果尚未确认' : revoked ? '执行凭据已撤销，旧执行须确认停止' : '执行租约已过期，旧执行须确认停止',
    stage: target.stage, causeKnown: !submitted, retryable: !submitted,
    nextAction: submitted ? '仅核对已有结果，不要重新发布' : '由原安装确认旧执行和页面停止后恢复' }
  target.updatedAt = new Date(now).toISOString()
}
export function expireAttempts(state: State, now: number) {
  for (const target of state.tasks.flatMap(task => task.targets)) {
    const attempt = state.attempts.find(item => item.id === target.attemptId)
    const revoked = state.executors.find(item => item.id === target.executorId)?.revoked
    if (target.state === 'running' && attempt && (Date.parse(attempt.expiresAt) <= now || revoked)) interrupted(target, now, revoked)
  }
}

export function recoveryRoute({ method, path, body, state, credential, manager, now }: {
  method?: string; path: string; body: Record<string, unknown>; state: State; credential?: Credential; manager: boolean; now: number;
}): { status: number; result: unknown } | undefined {
  const targets = state.tasks.flatMap(task => task.targets)
  const updatedAt = new Date(now).toISOString()
  if (method === 'POST' && /^\/v1\/tasks\/[^/]+\/cancel$/.test(path)) {
    if (!manager) fail(403, 'FORBIDDEN', '仅 Skill 或管理身份可以取消任务')
    fields(body, [])
    const task = state.tasks.find(task => task.id === path.split('/')[3])
    if (!task) fail(404, 'TASK_NOT_FOUND', '任务不存在')
    for (const target of task.targets) {
      if ((target.submitIntentAt || target.reconcileOnly) && ['running', 'outcome_unknown', 'needs_attention'].includes(target.state)) {
        interrupted(target, now); target.reconcileRequested = true
      } else if (target.state === 'queued') { target.state = 'cancelled'; target.stage = 'cancelled' }
      else if (['running', 'needs_attention', 'failed'].includes(target.state)) {
        if (state.attempts.find(item => item.id === target.attemptId)?.stoppedAt) { target.state = 'cancelled'; target.stage = 'cancelled'; delete target.reason }
        else target.cancelRequested = true
      }
      if (target.state === 'cancelled') { delete target.reconcileRequested; delete target.resumeRequested; delete target.cancelRequested; delete target.reason }
      target.updatedAt = updatedAt
    }
    const counts: Record<string, number> = {}
    for (const target of task.targets) counts[target.state] = (counts[target.state] || 0) + 1
    return { status: 200, result: { taskId: task.id, targets: task.targets, counts } }
  }
  if (method === 'POST' && /^\/v1\/targets\/[^/]+\/(resume|reconcile)$/.test(path)) {
    fields(body, [])
    const target = targets.find(item => item.id === path.split('/')[3])
    if (!target) fail(404, 'TARGET_NOT_FOUND', '目标不存在')
    if (!manager && (path.endsWith('/resume') || credential?.executorId !== target.executorId)) fail(403, 'FORBIDDEN', '不允许恢复或核对此目标')
    if (!['needs_attention', 'failed', 'outcome_unknown'].includes(target.state)) fail(409, 'RECOVERY_NOT_ALLOWED', '目标当前不能恢复或核对')
    if (state.executors.find(item => item.id === target.executorId)?.revoked) fail(409, 'EXECUTOR_REVOKED', '原安装已撤销，不自动改派')
    const reconcile = !!target.submitIntentAt || !!target.reconcileOnly || target.state === 'outcome_unknown' || path.endsWith('/reconcile')
    if (reconcile) target.reconcileRequested = true
    else {
      if (!state.accounts.some(account => account.id === target.accountId && account.executorId === target.executorId) || target.assetIds.some(id => !state.assets.some(asset => asset.id === id && asset.ready))) fail(422, 'PRECHECK_REQUIRED', '原账号或素材不可用，不能恢复')
      target.resumeRequested = true
      const attempt = state.attempts.find(item => item.id === target.attemptId)
      if (attempt?.stoppedAt) { target.state = 'queued'; target.stage = 'queued'; delete target.reason; delete target.resumeRequested }
    }
    target.updatedAt = updatedAt
    return { status: 200, result: { targetId: target.id, mode: reconcile ? 'reconcile' : 'execute', state: target.state } }
  }
  if (method === 'GET' && /^\/v1\/attempts\/[^/]+$/.test(path)) {
    const attempt = state.attempts.find(item => item.id === path.split('/')[3])
    if (!attempt) fail(404, 'ATTEMPT_NOT_FOUND', '执行尝试不存在')
    if (!manager && credential?.executorId !== attempt.executorId) fail(403, 'FORBIDDEN', '执行尝试不属于此安装')
    const { leaseToken: _token, events: _events, ...view } = attempt
    return { status: 200, result: { ...view, reconciliationEvidence: attempt.mode === 'reconcile' ? [...state.attempts].reverse().find(item => item.targetId === attempt.targetId && item.lateEvidence)?.lateEvidence : undefined, target: targets.find(item => item.id === attempt.targetId), executionMode: 'simulation' } }
  }
  if (method === 'POST' && /^\/v1\/attempts\/[^/]+\/(submit-intent|recover)$/.test(path)) {
    const attempt = state.attempts.find(item => item.id === path.split('/')[3])
    if (!attempt) fail(404, 'ATTEMPT_NOT_FOUND', '执行尝试不存在')
    if (credential?.role !== 'executor' || credential.executorId !== attempt.executorId) fail(403, 'FORBIDDEN', '执行尝试不属于此安装')
    const target = targets.find(item => item.id === attempt.targetId)!
    if (body.leaseToken !== attempt.leaseToken || target.attemptId !== attempt.id || attempt.stoppedAt) fail(409, 'INVALID_LEASE', '执行已停止或执行凭证不符')
    if (path.endsWith('/submit-intent')) {
      fields(body, ['leaseToken', 'contentDigest', 'accountId', 'assetsChecked'])
      if (Date.parse(attempt.expiresAt) <= now || target.state !== 'running' || target.cancelRequested || target.reconcileOnly || attempt.mode === 'reconcile' || (target.submitIntentAt && !attempt.submitIntentAt)) fail(409, 'SUBMIT_NOT_ALLOWED', '租约失效、执行结束或已请求取消，禁止提交')
      if (body.contentDigest !== target.contentDigest || body.accountId !== target.accountId || body.assetsChecked !== true) fail(422, 'PRECHECK_REQUIRED', '提交前须核对账号、内容和素材')
      attempt.submitIntentAt ||= updatedAt; target.submitIntentAt ||= updatedAt
      target.stage = 'submit_intent'; target.updatedAt = updatedAt
      return { status: 200, result: { attemptId: attempt.id, authorized: true, executionMode: 'simulation', expiresAt: attempt.expiresAt } }
    }
    fields(body, ['leaseToken', 'executionStopped', 'pageClosed', 'retryNotBefore', 'downloadRetryCount'])
    const retryNotBefore = body.retryNotBefore === undefined ? 0 : Date.parse(String(body.retryNotBefore))
    const downloadRetryCount = body.downloadRetryCount === undefined ? 0 : body.downloadRetryCount
    if (!Number.isFinite(retryNotBefore) || !Number.isInteger(downloadRetryCount) || Number(downloadRetryCount) < 0 || Number(downloadRetryCount) > 2) fail(422, 'INVALID_RETRY', '重试时间或次数无效')
    if (body.executionStopped !== true || body.pageClosed !== true) fail(422, 'STOP_PROOF_REQUIRED', '须由原安装确认旧执行已停止，旧页面不能继续提交')
    if (!target.cancelRequested && Date.parse(attempt.expiresAt) > now && target.state === 'running') fail(409, 'RECOVERY_NOT_ALLOWED', '执行仍有效，不允许重新领取')
    attempt.stoppedAt = updatedAt
    if (target.submitIntentAt || target.reconcileOnly) { interrupted(target, now); }
    else if (target.cancelRequested) { target.state = 'cancelled'; target.stage = 'cancelled'; delete target.cancelRequested; delete target.reason }
    else if (target.resumeRequested || (target.reason?.code === 'LEASE_EXPIRED' && (target.recoveryCount || 0) < 2)) {
      target.recoveryCount = (target.recoveryCount || 0) + 1
      target.retryAt = new Date(Math.max(retryNotBefore, now + (target.recoveryCount === 1 ? 5000 : 15000))).toISOString()
      target.downloadRetryCount = Math.max(target.downloadRetryCount || 0, Number(downloadRetryCount))
      target.state = 'queued'; target.stage = 'queued'; delete target.reason; delete target.resumeRequested
    }
    else if (!target.submitIntentAt && target.reason?.code === 'LEASE_EXPIRED') {
      target.reason = { ...target.reason, code: 'RECOVERY_EXHAUSTED', message: '提交前执行连续中断，已达到两次自动恢复上限', retryable: false, nextAction: '检查执行环境，处理后由 Skill 请求恢复' }
    }
    target.updatedAt = updatedAt
    return { status: 200, result: { targetId: target.id, state: target.state } }
  }
}
