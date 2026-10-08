import { createHash } from 'node:crypto'

export class ApiError extends Error {
  fieldErrors?: Record<string, unknown>[]
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}
export function fail(status: number, code: string, message: string): never { throw new ApiError(status, code, message) }
export function hash(value: string) { return createHash('sha256').update(value).digest('hex') }
export function text(body: Record<string, unknown>, name: string, max = 200): string {
  const value = body[name]
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, 'INVALID_FIELD', `${name} 必须是非空文本（最多 ${max} 字符）`)
  return value
}
export function fields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'UNSUPPORTED_FIELD', '请求包含不支持的字段；请勿发送 Cookie 或平台令牌')
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value)
}
