import fs from 'fs'
import path from 'path'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.json')
const MAX_RECORDS = 1000

// ── 类型 ──

export type AuditAction =
  | 'project:create'
  | 'project:delete'
  | 'project:update'
  | 'settings:update'
  | 'skill:install'
  | 'skill:enable'
  | 'skill:disable'
  | 'permission:allow'
  | 'permission:deny'
  | 'permission:timeout'
  | 'agent:create'
  | 'agent:update'
  | 'agent:delete'
  | 'channel:create'
  | 'channel:update'
  | 'channel:delete'
  | 'chat:abort'
  | 'chat:clear'
  | 'user:register'
  | 'user:login'
  | 'user:logout'
  | 'user:role-update'
  | 'user:disable'
  | 'project:member-add'
  | 'project:member-remove'
  | 'project:member-role-update'

export interface AuditRecord {
  id: string
  timestamp: string
  action: AuditAction
  actor: string       // 操作者（用户名或 'system'）
  projectId?: string  // 关联项目
  details: Record<string, unknown>
}

// ── 内部读写 ──

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readAll(): AuditRecord[] {
  ensureDataDir()
  try {
    if (!fs.existsSync(AUDIT_FILE)) return []
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.records) ? data.records : []
  } catch {
    return []
  }
}

function writeAll(records: AuditRecord[]) {
  ensureDataDir()
  // 仅保留最近 MAX_RECORDS 条
  const trimmed = records.slice(-MAX_RECORDS)
  fs.writeFileSync(AUDIT_FILE, JSON.stringify({ records: trimmed }, null, 2), 'utf-8')
}

// ── 公开 API ──

/**
 * 写入一条审计日志
 */
export function addAuditLog(
  action: AuditAction,
  actor: string = 'system',
  details: Record<string, unknown> = {},
  projectId?: string
): AuditRecord {
  const records = readAll()
  const record: AuditRecord = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action,
    actor,
    projectId,
    details,
  }
  records.push(record)
  writeAll(records)
  return record
}

/**
 * 查询审计日志
 * @param limit 返回条数（默认 100，最大 1000）
 * @param offset 偏移量
 * @param actionFilter 按操作类型过滤
 */
export function queryAuditLog(options: {
  limit?: number
  offset?: number
  action?: AuditAction
  projectId?: string
} = {}): { records: AuditRecord[]; total: number } {
  let records = readAll()

  // 过滤
  if (options.action) {
    records = records.filter(r => r.action === options.action)
  }
  if (options.projectId) {
    records = records.filter(r => r.projectId === options.projectId)
  }

  const total = records.length
  const offset = options.offset || 0
  const limit = Math.min(options.limit || 100, MAX_RECORDS)

  // 返回最新的记录（倒序）
  const sliced = records.slice(-(offset + limit)).reverse().slice(0, limit)

  return { records: sliced, total }
}
