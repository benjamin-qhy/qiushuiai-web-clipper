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
  state: 'queued' | 'running' | 'submitted' | 'published' | 'draft_saved' | 'failed' | 'needs_attention' | 'cancelled' | 'outcome_unknown'; stage: string; updatedAt: string;
  coverSelection?: { kind: 'horizontal' | 'vertical'; assetId: string; confirmedAt: string; cropAcceptedAt?: string; confirmedCoverPreviewSha256?: string };
  videoContinuationRequested?: boolean; preparationAttemptId?: string; preparationStartedAt?: string; preparationDeadline?: string; editorTabId?: number;
  reconcileOnly?: boolean; replacesTargetId?: string; reconcileRequested?: boolean; resumeRequested?: boolean; downloadRetryCount?: number; recoveryCount?: number; retryAt?: string; cancelRequested?: boolean; submitIntentAt?: string; attemptId?: string; evidence?: Record<string, unknown>; reason?: Record<string, unknown>;
}
export interface Task { id: string; executionMode: 'simulation' | 'live'; confirmation: Record<string, unknown>; createdAt: string; targets: Target[] }
export interface Attempt {
  id: string; targetId: string; executorId: string; leaseToken: string; expiresAt: string; seq: number;
  videoContinuation?: { editorTabId: number; previousRunId: string; previousResultCode?: string; previousStoppedAt: string; textAlreadyFilled?: boolean; topicsInProgress?: boolean; coverAlreadyUploaded?: boolean; confirmedCoverPreviewSha256?: string; topicsAlreadyFilled?: boolean };
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
    dynamic: ['type', 'title', 'content', 'imageAssetIds', 'videoAssetIds', 'tags', 'collectionName', 'declareOriginal'],
    article: ['type', 'title', 'htmlContent', 'markdownContent', 'digest', 'coverAssetId', 'imageAssetIds', 'tags'],
    video: ['type', 'title', 'content', 'videoAssetId', 'coverAssetId', 'verticalCoverAssetId', 'horizontalCoverAssetId', 'tags', 'collectionName', 'declareOriginal'],
  }
  allowed(content, byType[type])
  for (const name of ['title', 'content', 'htmlContent', 'markdownContent', 'digest']) {
    if (content[name] !== undefined && typeof content[name] !== 'string') fail(422, 'INVALID_FIELD', `${name} 必须是文本`)
  }
  if (content.collectionName !== undefined || content.declareOriginal !== undefined) {
    if (platform !== 'xiaohongshu' || !['dynamic', 'video'].includes(type)) fail(422, 'UNSUPPORTED_FIELD', '合集与原创声明当前仅支持小红书图文和视频')
    if (content.collectionName !== undefined) text(content, 'collectionName', 200)
    if (content.declareOriginal !== undefined && typeof content.declareOriginal !== 'boolean') fail(422, 'INVALID_FIELD', 'declareOriginal 必须是布尔值')
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
  const contentEndpoint = /^\/v1\/tasks\/(dynamic|video|article)$/.exec(path)?.[1]
  if (method === 'POST' && (path === '/v1/tasks' || contentEndpoint)) {
    if (!manager) fail(403, 'FORBIDDEN', '仅 Skill 或管理身份可以提交任务')
    allowed(body, ['executionMode', 'confirmation', 'targets'])
    if (!['simulation', 'live'].includes(String(body.executionMode))) fail(422, 'ADAPTER_NOT_READY', '必须显式指定 simulation 或 live')
    const live = body.executionMode === 'live'
    const confirmation = object(body.confirmation, 'confirmation'); allowed(confirmation, ['confirmedAt', 'contentRevision', 'duplicateRiskAccepted', 'action', 'finish', 'originalAgreementAccepted'])
    if (live && !['prepare', 'fill'].includes(String(confirmation.action))) fail(422, 'ADAPTER_NOT_READY', '真实任务 action 必须为 prepare 或 fill，最终动作使用 confirmation.finish 指定')
    if (confirmation.finish !== undefined && (!live || confirmation.action !== 'fill' || !['stay', 'save_draft', 'publish'].includes(String(confirmation.finish)))) fail(422, 'INVALID_FINISH', 'finish 仅支持 fill 的 stay、save_draft、publish')
    if (confirmation.originalAgreementAccepted !== undefined && (!live || typeof confirmation.originalAgreementAccepted !== 'boolean')) fail(422, 'INVALID_CONFIRMATION', '原创须知确认必须为布尔值')
    if (!live && confirmation.action !== undefined) fail(422, 'UNSUPPORTED_FIELD', '模拟任务不接受真实执行动作')
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
        const submittedContent = object(target.content, 'content')
        if (contentEndpoint && submittedContent.type !== undefined && submittedContent.type !== contentEndpoint) fail(422, 'CONTENT_TYPE_MISMATCH', '内容类型必须与调用接口一致')
        const { content, assetIds } = validateContent(state, resolved.platform, contentEndpoint ? { ...submittedContent, type: contentEndpoint } : submittedContent)
        if (live) {
          const xFill = resolved.platform === 'x' && content.type === 'dynamic';
          const readonlyOther = confirmation.action === 'prepare' && ['douyin', 'maimai'].includes(resolved.platform);
          if (!xFill && !readonlyOther && (resolved.platform !== 'xiaohongshu' || !['dynamic', 'video'].includes(String(content.type)))) fail(422, 'ADAPTER_NOT_READY', '当前填写开放小红书与X；抖音和脉脉仅只读预检')
          if (xFill) {
            if ((content.tags as string[] | undefined)?.some(tag => /[\s#]/.test(tag))) fail(422, 'INVALID_CONTENT', 'X话题不能包含空格或井号')
            if (confirmation.finish && confirmation.finish !== 'stay') fail(422, 'ADAPTER_NOT_READY', 'X最终提交尚未验收，当前只允许填写后保持页面')
            if ((content.videoAssetIds as string[] | undefined)?.length || ((content.imageAssetIds as string[] | undefined)?.length || 0) > 4) fail(422, 'UNSUPPORTED_FIELD', 'X当前填写最多4张图片，视频待接入')
            const combined = `${content.title ? content.title + '\n' : ''}${content.content || ''}${(content.tags as string[] | undefined)?.length ? ' ' + (content.tags as string[]).map(tag => '#' + tag).join(' ') : ''}`;
            if ([...combined].reduce((sum, ch) => sum + (ch.codePointAt(0)! > 0x10ff ? 2 : 1), 0) > 280) fail(422, 'CONTENT_TOO_LONG', 'X当前按普通帖保守字数预算校验，请在Skill中明确缩短，不自动截断')
          }
          if (resolved.platform === 'xiaohongshu') {
          if (content.type === 'dynamic' && !(content.imageAssetIds as string[] | undefined)?.length) fail(422, 'MISSING_REQUIRED_FIELD', '小红书图文需要图片')
          if ((content.videoAssetIds as string[] | undefined)?.length) fail(422, 'UNSUPPORTED_FIELD', '图文准备不支持视频素材')
          if (content.type === 'video') {
            if (content.coverAssetId && (content.verticalCoverAssetId || content.horizontalCoverAssetId)) fail(422, 'AMBIGUOUS_COVER', '通用封面与横竖封面不能混传')
            const video = state.assets.find(asset => asset.id === content.videoAssetId)!
            const totalBytes = assetIds.reduce((sum, id) => sum + state.assets.find(asset => asset.id === id)!.sizeBytes, 0)
            if (video.mediaType !== 'video/mp4' || totalBytes > 128 * 1024 * 1024) fail(422, 'INVALID_VIDEO', '当前仅支持MP4，视频与封面合计不能超过128 MiB')
          }
          text(content, 'title', 65536)
          }
        }
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
    const task: Task = { id: randomUUID(), executionMode: live ? 'live' : 'simulation', confirmation: structuredClone(confirmation), createdAt: updatedAt, targets }
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
    fields(body, ['executionMode'])
    const executionMode = body.executionMode ?? 'simulation'
    if (!['simulation', 'live'].includes(String(executionMode))) fail(422, 'INVALID_FIELD', 'executionMode 无效')
    const executorId = path.split('/')[3]
    if (credential?.role !== 'executor' || credential.executorId !== executorId) fail(403, 'FORBIDDEN', '只能领取当前安装的任务')
    const targets = state.tasks.flatMap(task => task.targets).filter(target => target.executorId === executorId)
    if (targets.some(target => target.state === 'running' || (target.attemptId && !state.attempts.find(item => item.id === target.attemptId)?.stoppedAt && ['needs_attention', 'outcome_unknown'].includes(target.state)))) return { status: 200, result: { attempt: null } }
    const eligible = state.tasks.filter(task => task.executionMode === executionMode).flatMap(task => task.targets).filter(target => target.executorId === executorId)
    const target = eligible.find(target => (target.state === 'queued' && (!target.retryAt || Date.parse(target.retryAt) <= now)) || (['outcome_unknown', 'needs_attention', 'failed', 'submitted'].includes(target.state) && target.reconcileRequested && state.attempts.find(item => item.id === target.attemptId)?.stoppedAt))
    if (!target) return { status: 200, result: { attempt: null } }
    const mode = target.reconcileRequested ? 'reconcile' : 'execute'
    const attempt: Attempt = { mode, id: randomUUID(), targetId: target.id, executorId, leaseToken: randomBytes(32).toString('base64url'), expiresAt: new Date(now + 120_000).toISOString(), seq: 0, events: [] }
    if (target.videoContinuationRequested) { attempt.videoContinuation = { topicsInProgress: target.reason?.code === 'TOPIC_NOT_FOUND' || (target.reason?.code === 'CONTINUATION_UNVERIFIED' && state.attempts.find(item => item.id === target.preparationAttemptId)?.videoContinuation?.topicsInProgress === true), previousResultCode: typeof target.reason?.code === "string" ? target.reason.code : undefined, confirmedCoverPreviewSha256: target.coverSelection?.confirmedCoverPreviewSha256, editorTabId: target.editorTabId!, previousRunId: target.preparationAttemptId!, coverAlreadyUploaded: target.reason?.code === 'COVER_IDENTITY_UNCONFIRMED' || state.attempts.find(item => item.id === target.preparationAttemptId)?.videoContinuation?.coverAlreadyUploaded === true, topicsAlreadyFilled: target.reason?.code === 'VIDEO_COVER_CONTROL_UNVERIFIED' || state.attempts.find(item => item.id === target.preparationAttemptId)?.videoContinuation?.topicsAlreadyFilled === true, textAlreadyFilled: target.reason?.code === 'TOPIC_NOT_FOUND' || target.reason?.code === 'VIDEO_COVER_CONTROL_UNVERIFIED' || target.reason?.code === 'CONTENT_MISMATCH' || state.attempts.find(item => item.id === target.preparationAttemptId)?.videoContinuation?.textAlreadyFilled === true, previousStoppedAt: state.attempts.find(item => item.id === target.preparationAttemptId)!.stoppedAt! }; delete target.videoContinuationRequested }
    state.attempts.push(attempt); target.attemptId = attempt.id; target.state = 'running'; target.stage = mode === 'reconcile' ? 'reconciliation' : 'validation'; target.updatedAt = updatedAt; delete target.reconcileRequested
    return { status: 200, result: { attempt: { id: attempt.id, mode, videoContinuation: attempt.videoContinuation, leaseToken: attempt.leaseToken, expiresAt: attempt.expiresAt, executionMode, confirmation: state.tasks.find(task => task.targets.includes(target))!.confirmation, action: state.tasks.find(task => task.targets.includes(target))!.confirmation.action, target } } }
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
    const live = state.tasks.some(task => task.executionMode === 'live' && task.targets.some(item => item.id === target.id))
    const task = state.tasks.find(task => task.targets.includes(target))!
    const finish = task.confirmation.finish || 'stay'
    if (live && (!['running', 'failed', 'needs_attention', 'outcome_unknown', ...(finish === 'save_draft' ? ['draft_saved'] : finish === 'publish' ? ['submitted', 'published'] : [])].includes(String(body.state)) || !['validation', 'download', 'preparation', 'reconciliation'].includes(String(body.stage)))) fail(422, 'INVALID_STATE', '真实准备不能声明草稿、提交或发布成功')
    const late = Date.parse(attempt.expiresAt) <= now || !!attempt.stoppedAt || target.attemptId !== attempt.id
    if (body.seq !== attempt.seq + 1) fail(409, 'EVENT_SEQUENCE_CONFLICT', '事件乱序')
    if (!late && (target.cancelRequested || target.state !== 'running')) fail(409, 'EVENT_SEQUENCE_CONFLICT', '执行已结束或已请求取消')
    if (late && !(attempt.submitIntentAt && ['draft_saved', 'submitted', 'published'].includes(String(body.state)))) fail(409, 'INVALID_LEASE', '旧执行只能补充提交后的核对证据')
    if (!['running', 'draft_saved', 'failed', 'needs_attention', 'outcome_unknown', ...(live ? ['submitted', 'published'] : [])].includes(String(body.state)) || !['validation', 'download', 'simulation', 'reconciliation', ...(live ? ['preparation'] : [])].includes(String(body.stage))) fail(422, 'INVALID_STATE', '当前模拟执行不能回报真实发布结果')
    if (body.state === 'outcome_unknown' && !target.submitIntentAt && attempt.mode !== 'reconcile') fail(422, 'INVALID_STATE', '未提交的执行不能声明可能已发布')
    const rejection = live && finish === 'publish' && body.state === 'failed' && body.stage === 'reconciliation' && (body.evidence as Record<string, unknown> | undefined)?.kind === 'platform_rejection'
    if (target.submitIntentAt && ['failed', 'needs_attention'].includes(String(body.state)) && !rejection) fail(422, 'RECONCILIATION_REQUIRED', '提交意图后的中断只能标记结果未知并核对')
    if (rejection || ['draft_saved', 'submitted', 'published'].includes(String(body.state))) {
      if (!target.submitIntentAt) fail(422, 'SUBMIT_INTENT_REQUIRED', '缺少提交意图，不接受完成证据')
      const evidence = object(body.evidence, 'evidence'); allowed(evidence, live ? ['kind', 'platform', 'accountId', 'observedAt', 'detail', 'finish', 'editorTabId', 'title', 'signal', 'storage', 'url'] : ['kind', 'platform', 'accountId', 'observedAt', 'detail'])
      if (evidence.kind !== (rejection ? 'platform_rejection' : live ? 'platform_receipt' : 'simulation_receipt') || evidence.platform !== target.platform || evidence.accountId !== target.accountId || !utc(evidence.observedAt)) fail(422, 'INVALID_EVIDENCE', '证据必须关联当前平台和账号')
      if (live && (body.stage !== 'reconciliation' || evidence.finish !== finish || evidence.editorTabId !== target.editorTabId || evidence.title !== target.content.title || evidence.signal !== body.state || (body.state === 'draft_saved' && evidence.storage !== 'browser_local') || ((body.state === 'published' || rejection) && (typeof evidence.url !== 'string' || !/^https:\/\/www\.xiaohongshu\.com\/explore\/[a-f0-9]{24}$/.test(evidence.url))))) fail(422, 'INVALID_EVIDENCE', '真实证据须匹配动作、编辑页、标题及结果')
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
    if (['draft_saved', 'submitted', 'published'].includes(String(body.state))) delete target.reason
    const result = { targetId: target.id, state: target.state, seq: attempt.seq }
    attempt.events.push({ eventId, digest, result }); return { status: 200, result }
  }
}
