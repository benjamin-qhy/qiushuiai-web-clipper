import { expireAttempts, recoveryRoute } from './recovery.mts'
import { randomBytes, randomUUID } from 'node:crypto'
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'
import { capabilities } from './capabilities.mts'
import type { Credential, State } from './model.mts'
import { ApiError, canonical, fail, fields, hash, text } from './protocol.mts'
import { resolveTarget } from './targets.mts'

export interface Target {
  id: string; clientTargetId: string; executorId: string; computerId: string; browserId: string; profileId: string;
  accountId: string; platform: string; content: Record<string, unknown>; contentDigest: string; assetIds: string[];
  state: 'queued' | 'running' | 'draft_saved' | 'failed' | 'needs_attention' | 'cancelled' | 'outcome_unknown'; stage: string; updatedAt: string;
  reconcileOnly?: boolean; replacesTargetId?: string; reconcileRequested?: boolean; resumeRequested?: boolean; downloadRetryCount?: number; recoveryCount?: number; retryAt?: string; cancelRequested?: boolean; submitIntentAt?: string; attemptId?: string; evidence?: Record<string, unknown>; reason?: Record<string, unknown>;
}
export interface Task { id: string; executionMode: 'simulation'; confirmation: Record<string, unknown>; createdAt: string; targets: Target[] }
export interface Attempt {
  id: string; targetId: string; executorId: string; leaseToken: string; expiresAt: string; seq: number;
  lateEvidence?: Record<string, unknown>; mode?: 'execute' | 'reconcile'; stoppedAt?: string; submitIntentAt?: string;
  events: { eventId: string; digest: string; result: unknown }[];
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(422, 'INVALID_FIELD', `${name} 必须是对象`)
  return value as Record<string, unknown>
}
function allowed(body: Record<string, unknown>, names: string[]) {
  if (Object.keys(body).some(key => !names.includes(key))) fail(422, 'UNSUPPORTED_FIELD', '存在此阶段不支持的字段')
}
function strings(value: unknown, name: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) fail(422, 'INVALID_FIELD', `${name} 必须是非空文本数组`)
  return value
}
function utc(value: unknown): boolean { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)) }
function validateContent(state: State, platform: string, value: unknown) {
  const content = object(value, 'content')
  const type = text(content, 'type')
  if (!capabilities.some(capability => capability.platform === platform && capability.type === type)) fail(422, 'UNSUPPORTED_TYPE', '平台不支持此发布类型')
  const byType: Record<string, string[]> = {
    dynamic: ['type', 'title', 'content', 'imageAssetIds', 'videoAssetIds', 'tags'],
    article: ['type', 'title', 'htmlContent', 'markdownContent', 'digest', 'coverAssetId', 'imageAssetIds', 'tags'],
    video: ['type', 'title', 'content', 'videoAssetId', 'coverAssetId', 'verticalCoverAssetId', 'horizontalCoverAssetId', 'tags'],
  }
  allowed(content, byType[type])
  for (const name of ['title', 'content', 'htmlContent', 'markdownContent', 'digest']) {
    if (content[name] !== undefined && typeof content[name] !== 'string') fail(422, 'INVALID_FIELD', `${name} 必须是文本`)
  }
  strings(content.tags, 'tags')
  const images = strings(content.imageAssetIds, 'imageAssetIds')
  const videos = strings(content.videoAssetIds, 'videoAssetIds')
  if (type === 'dynamic' && !String(content.content || '').trim() && !images.length && !videos.length) fail(422, 'MISSING_REQUIRED_FIELD', '动态至少需要文字或素材')
  if (type === 'video') videos.push(text(content, 'videoAssetId'))
  const covers = ['coverAssetId', 'verticalCoverAssetId', 'horizontalCoverAssetId'].filter(key => content[key] !== undefined).map(key => text(content, key))
  if (type === 'article') {
    text(content, 'title', 65536); const html = text(content, 'htmlContent', 65536)
    const references: string[] = []
    const walk = (node: DefaultTreeAdapterTypes.Node) => {
      if ('tagName' in node) {
        if (!['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'a', 'img', 'hr'].includes(node.tagName)) fail(422, 'UNSUPPORTED_MARKUP', '模拟正文仅接受基础静态富文本标签')
        for (const attr of node.attrs) {
          if (!((node.tagName === 'img' && ['src', 'alt'].includes(attr.name)) || (node.tagName === 'a' && ['href', 'title'].includes(attr.name)))) fail(422, 'UNSUPPORTED_MARKUP', '正文存在未支持的属性')
          if (attr.name === 'href' && !/^https?:\/\//i.test(attr.value)) fail(422, 'UNSUPPORTED_MARKUP', '超链接必须使用 HTTP 或 HTTPS')
          if (attr.name === 'src') {
            if (!attr.value.startsWith('asset://')) fail(422, 'INVALID_ASSET_REFERENCE', '正文图片必须引用已上传的素材')
            references.push(attr.value.slice(8))
          }
        }
        if (node.tagName === 'img' && !node.attrs.some(attr => attr.name === 'src')) fail(422, 'INVALID_ASSET_REFERENCE', '正文图片缺少素材引用')
      }
      if ('childNodes' in node) node.childNodes.forEach(walk)
    }
    walk(parseFragment(html))
    if (references.some(id => !images.includes(id)) || images.some(id => !references.includes(id))) fail(422, 'INVALID_ASSET_REFERENCE', '正文图片引用和素材列表不一致')
  }
  for (const [ids, prefix] of [[images.concat(covers), 'image/'], [videos, 'video/']] as const) {
    for (const id of ids) {
      const asset = state.assets.find(asset => asset.id === id)
      if (!asset?.ready) fail(422, 'ASSET_NOT_READY', '素材不存在或未完整上传')
      if (!asset.mediaType.startsWith(prefix)) fail(422, 'INVALID_ASSET_TYPE', '素材类型不符合内容字段')
    }
  }
  return { content: structuredClone(content), assetIds: [...new Set([...images, ...covers, ...videos])] }
}
function taskView(task: Task, executorId?: string) {
  const targets = task.targets.filter(target => !executorId || target.executorId === executorId)
  const counts: Record<string, number> = {}
  for (const target of targets) counts[target.state] = (counts[target.state] || 0) + 1
  return { taskId: task.id, executionMode: task.executionMode, confirmation: task.confirmation, createdAt: task.createdAt, targets, counts }
}
export function taskRoute({ method, url, body, state, credential, isAdmin, now }: {
  method?: string; url: URL; body: Record<string, unknown>; state: State; credential?: Credential; isAdmin: boolean; now: number;
}): { status: number; result: unknown } | undefined {
  const path = url.pathname; const manager = isAdmin || credential?.role === 'skill'; const updatedAt = new Date(now).toISOString()
  expireAttempts(state, now)
  const recovery = recoveryRoute({ method, path, body, state, credential, manager, now })
  if (recovery) return recovery
  if (method === 'POST' && path === '/v1/tasks') {
    if (!manager) fail(403, 'FORBIDDEN', '仅 Skill 或管理身份可以提交任务')
    allowed(body, ['executionMode', 'confirmation', 'targets'])
    if (body.executionMode !== 'simulation') fail(422, 'ADAPTER_NOT_READY', '当前只支持显式 simulation 任务，真实发布尚未验收')
    const confirmation = object(body.confirmation, 'confirmation'); allowed(confirmation, ['confirmedAt', 'contentRevision', 'duplicateRiskAccepted'])
    if (!utc(confirmation.confirmedAt) || Date.parse(confirmation.confirmedAt as string) > now + 60_000) fail(422, 'INVALID_CONFIRMATION', '确认时间必须是有效的 UTC 时间且不能在未来')
    text(confirmation, 'contentRevision')
    if (!Array.isArray(body.targets) || !body.targets.length || body.targets.length > 100) fail(422, 'INVALID_TARGETS', '每项任务需要1至100个目标')
    const targets: Target[] = []; const errors: Record<string, unknown>[] = []; const seen = new Set<string>(); const clientIds = new Set<string>()
    for (const [index, value] of body.targets.entries()) {
      try {
        const target = object(value, 'target'); allowed(target, ['clientTargetId', 'computerId', 'browserId', 'profileId', 'accountId', 'platform', 'content', 'replacesTargetId'])
        const clientTargetId = text(target, 'clientTargetId'); const resolved = resolveTarget(state, target)
        let replacesTargetId: string | undefined
        if (target.replacesTargetId !== undefined) {
          replacesTargetId = text(target, 'replacesTargetId')
          const original = state.tasks.flatMap(task => task.targets).find(item => item.id === replacesTargetId)
          if (!original || original.state !== 'outcome_unknown' || confirmation.duplicateRiskAccepted !== true) fail(422, 'DUPLICATE_RISK_CONFIRMATION_REQUIRED', '重新发布结果未知的目标需要明确确认重复风险，并引用原目标')
        }
        const { content, assetIds } = validateContent(state, resolved.platform, target.content)
        const contentDigest = hash(canonical(content)); const fingerprint = canonical([resolved.platform, resolved.accountId, contentDigest])
        if (seen.has(fingerprint) || clientIds.has(clientTargetId)) fail(422, 'DUPLICATE_TARGET', '同一请求中包含重复内容目标或 clientTargetId')
        seen.add(fingerprint); clientIds.add(clientTargetId)
        targets.push({ id: randomUUID(), clientTargetId, ...resolved, ...(replacesTargetId ? { replacesTargetId } : {}), content, contentDigest, assetIds, state: 'queued', stage: 'queued', updatedAt })
      } catch (error) {
        if (!(error instanceof ApiError)) throw error
        errors.push({ clientTargetId: (value as Record<string, unknown>)?.clientTargetId, fieldPath: `targets[${index}]`, code: error.code, message: error.message, nextAction: '修正目标或内容并重新确认' })
      }
    }
    if (errors.length) { const error = new ApiError(422, 'INVALID_TARGETS', '部分目标未通过校验，整批未入队'); error.fieldErrors = errors; throw error }
    const task: Task = { id: randomUUID(), executionMode: 'simulation', confirmation: structuredClone(confirmation), createdAt: updatedAt, targets }
    state.tasks.push(task); return { status: 201, result: taskView(task) }
  }
  if (method === 'GET' && (path === '/v1/tasks' || /^\/v1\/tasks\/[^/]+$/.test(path))) {
    const executorId = credential?.role === 'executor' ? credential.executorId : undefined
    const visible = [...state.tasks].reverse().filter(task => !executorId || task.targets.some(target => target.executorId === executorId))
    if (path !== '/v1/tasks') {
      const task = visible.find(task => task.id === path.split('/')[3]); if (!task) fail(404, 'TASK_NOT_FOUND', '任务不存在或不属于此安装')
      return { status: 200, result: taskView(task, executorId) }
    }
    const limit = Number(url.searchParams.get('limit') || 20)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, 'INVALID_LIMIT', 'limit 必须为1至100')
    const cursor = url.searchParams.get('cursor'); const offset = cursor ? visible.findIndex(task => task.id === cursor) + 1 : 0
    if (cursor && !offset) fail(400, 'INVALID_CURSOR', 'cursor 无效')
    const page = visible.slice(offset, offset + limit)
    return { status: 200, result: { tasks: page.map(task => taskView(task, executorId)), nextCursor: offset + limit < visible.length ? page.at(-1)!.id : null } }
  }
  if (method === 'POST' && /^\/v1\/executors\/[^/]+\/claims$/.test(path)) {
    fields(body, [])
    const executorId = path.split('/')[3]
    if (credential?.role !== 'executor' || credential.executorId !== executorId) fail(403, 'FORBIDDEN', '只能领取当前安装的任务')
    const targets = state.tasks.flatMap(task => task.targets).filter(target => target.executorId === executorId)
    if (targets.some(target => target.state === 'running' || (target.attemptId && !state.attempts.find(item => item.id === target.attemptId)?.stoppedAt && ['needs_attention', 'outcome_unknown'].includes(target.state)))) return { status: 200, result: { attempt: null } }
    const target = targets.find(target => (target.state === 'queued' && (!target.retryAt || Date.parse(target.retryAt) <= now)) || (['outcome_unknown', 'needs_attention', 'failed'].includes(target.state) && target.reconcileRequested && state.attempts.find(item => item.id === target.attemptId)?.stoppedAt))
    if (!target) return { status: 200, result: { attempt: null } }
    const mode = target.reconcileRequested ? 'reconcile' : 'execute'
    const attempt: Attempt = { mode, id: randomUUID(), targetId: target.id, executorId, leaseToken: randomBytes(32).toString('base64url'), expiresAt: new Date(now + 120_000).toISOString(), seq: 0, events: [] }
    state.attempts.push(attempt); target.attemptId = attempt.id; target.state = 'running'; target.stage = mode === 'reconcile' ? 'reconciliation' : 'validation'; target.updatedAt = updatedAt; delete target.reconcileRequested
    return { status: 200, result: { attempt: { id: attempt.id, mode, leaseToken: attempt.leaseToken, expiresAt: attempt.expiresAt, executionMode: 'simulation', target } } }
  }
  if (method === 'POST' && /^\/v1\/attempts\/[^/]+\/renew$/.test(path)) {
    fields(body, ['leaseToken'])
    const attempt = state.attempts.find(attempt => attempt.id === path.split('/')[3]); if (!attempt) fail(404, 'ATTEMPT_NOT_FOUND', '执行尝试不存在')
    if (credential?.role !== 'executor' || credential.executorId !== attempt.executorId) fail(403, 'FORBIDDEN', '执行尝试不属于此安装')
    const target = state.tasks.flatMap(task => task.targets).find(target => target.id === attempt.targetId)!
    if (attempt.stoppedAt || target.attemptId !== attempt.id || target.cancelRequested || attempt.leaseToken !== body.leaseToken || Date.parse(attempt.expiresAt) <= now || target.state !== 'running') fail(409, 'INVALID_LEASE', '租约已失效或执行已结束')
    attempt.expiresAt = new Date(now + 120_000).toISOString()
    return { status: 200, result: { expiresAt: attempt.expiresAt } }
  }
  if (method === 'POST' && /^\/v1\/attempts\/[^/]+\/events$/.test(path)) {
    fields(body, ['leaseToken', 'eventId', 'seq', 'stage', 'state', 'evidence', 'reason'])
    const attempt = state.attempts.find(attempt => attempt.id === path.split('/')[3]); if (!attempt) fail(404, 'ATTEMPT_NOT_FOUND', '执行尝试不存在')
    if (credential?.role !== 'executor' || credential.executorId !== attempt.executorId) fail(403, 'FORBIDDEN', '执行尝试不属于此安装')
    if (attempt.leaseToken !== body.leaseToken) fail(409, 'INVALID_LEASE', '执行凭证不符')
    const eventId = text(body, 'eventId'); const digest = hash(canonical(body)); const saved = attempt.events.find(event => event.eventId === eventId)
    if (saved) { if (saved.digest !== digest) fail(409, 'EVENT_CONFLICT', '重复事件内容不同'); return { status: 200, result: saved.result } }
    const target = state.tasks.flatMap(task => task.targets).find(target => target.id === attempt.targetId)!
    const late = Date.parse(attempt.expiresAt) <= now || !!attempt.stoppedAt || target.attemptId !== attempt.id
    if (body.seq !== attempt.seq + 1) fail(409, 'EVENT_SEQUENCE_CONFLICT', '事件乱序')
    if (!late && (target.cancelRequested || target.state !== 'running')) fail(409, 'EVENT_SEQUENCE_CONFLICT', '执行已结束或已请求取消')
    if (late && !(attempt.submitIntentAt && body.state === 'draft_saved')) fail(409, 'INVALID_LEASE', '旧执行只能补充提交后的核对证据')
    if (!['running', 'draft_saved', 'failed', 'needs_attention', 'outcome_unknown'].includes(String(body.state)) || !['validation', 'download', 'simulation', 'reconciliation'].includes(String(body.stage))) fail(422, 'INVALID_STATE', '当前模拟执行不能回报真实发布结果')
    if (body.state === 'outcome_unknown' && !target.submitIntentAt && attempt.mode !== 'reconcile') fail(422, 'INVALID_STATE', '未提交的执行不能声明可能已发布')
    if (target.submitIntentAt && ['failed', 'needs_attention'].includes(String(body.state))) fail(422, 'RECONCILIATION_REQUIRED', '提交意图后的中断只能标记结果未知并核对')
    if (body.state === 'draft_saved') {
      if (!target.submitIntentAt) fail(422, 'SUBMIT_INTENT_REQUIRED', '缺少提交意图，不接受完成证据')
      const evidence = object(body.evidence, 'evidence'); allowed(evidence, ['kind', 'platform', 'accountId', 'observedAt', 'detail'])
      if (evidence.kind !== 'simulation_receipt' || evidence.platform !== target.platform || evidence.accountId !== target.accountId || !utc(evidence.observedAt)) fail(422, 'INVALID_EVIDENCE', '模拟证据必须关联当前平台和账号')
      text(evidence, 'detail', 1000)
      if (late) {
        attempt.lateEvidence = { ...evidence, contentDigest: target.contentDigest }; attempt.seq++
        const result = { targetId: target.id, state: target.state, seq: attempt.seq, acceptedForReconciliation: true }
        attempt.events.push({ eventId, digest, result }); return { status: 200, result }
      }
      target.evidence = { ...evidence, contentDigest: target.contentDigest }
    }
    if (body.state === 'failed' || body.state === 'needs_attention' || body.state === 'outcome_unknown') {
      const reason = object(body.reason, 'reason'); allowed(reason, ['code', 'message', 'stage', 'causeKnown', 'retryable', 'nextAction'])
      if (reason.stage !== body.stage || typeof reason.causeKnown !== 'boolean' || typeof reason.retryable !== 'boolean') fail(422, 'INVALID_REASON', '原因必须包含阶段、是否已知和重试建议')
      for (const key of ['code', 'message', 'nextAction']) text(reason, key, 1000)
      if (target.submitIntentAt && reason.retryable) fail(422, 'RECONCILIATION_REQUIRED', '提交后不可标记为自动重发')
      target.reason = reason
    }
    if (body.state === 'outcome_unknown') target.reconcileOnly = true
    target.state = body.state as Target['state']; target.stage = body.stage as string; target.updatedAt = updatedAt; attempt.seq++
    if (body.state !== 'running') attempt.stoppedAt = updatedAt
    if (body.state === 'draft_saved') delete target.reason
    const result = { targetId: target.id, state: target.state, seq: attempt.seq }
    attempt.events.push({ eventId, digest, result }); return { status: 200, result }
  }
}
