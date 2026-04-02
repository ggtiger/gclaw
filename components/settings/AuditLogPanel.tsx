'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader, Shield, Filter } from 'lucide-react'

interface AuditRecord {
  id: string
  timestamp: string
  action: string
  actor: string
  projectId?: string
  details: Record<string, unknown>
}

const ACTION_LABELS: Record<string, string> = {
  'project:create': '创建项目',
  'project:delete': '删除项目',
  'project:update': '更新项目',
  'settings:update': '更新设置',
  'skill:install': '安装技能',
  'skill:enable': '启用技能',
  'skill:disable': '禁用技能',
  'permission:allow': '允许操作',
  'permission:deny': '拒绝操作',
  'agent:create': '创建智能体',
  'agent:delete': '删除智能体',
  'channel:create': '创建渠道',
  'channel:delete': '删除渠道',
  'chat:abort': '中止对话',
}

export function AuditLogPanel() {
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (filter) params.set('action', filter)
      const res = await fetch(`/api/audit-log?${params}`)
      const data = await res.json()
      setRecords(data.records || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to load audit log:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="p-4 space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} style={{ color: 'var(--color-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            审计日志 ({total} 条)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="pl-7 pr-3 py-1 rounded-md border text-xs outline-none appearance-none cursor-pointer"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            >
              <option value="">全部操作</option>
              <option value="project:create">项目创建</option>
              <option value="project:delete">项目删除</option>
              <option value="settings:update">设置变更</option>
              <option value="permission:allow">权限允许</option>
              <option value="permission:deny">权限拒绝</option>
              <option value="skill:install">技能安装</option>
            </select>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 rounded-md cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
            title="刷新"
          >
            {loading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      {records.length === 0 && !loading ? (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          暂无审计日志
        </div>
      ) : (
        <div className="space-y-1">
          {records.map(record => (
            <div
              key={record.id}
              className="flex items-start gap-3 px-3 py-2 rounded-md text-xs"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              {/* 时间 */}
              <span
                className="shrink-0 font-mono"
                style={{ color: 'var(--color-text-muted)', minWidth: '100px' }}
              >
                {formatTime(record.timestamp)}
              </span>
              {/* 操作标签 */}
              <span
                className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor:
                    record.action.includes('delete') || record.action.includes('deny')
                      ? 'color-mix(in srgb, #ef4444 15%, transparent)'
                      : record.action.includes('create') || record.action.includes('allow')
                        ? 'color-mix(in srgb, #22c55e 15%, transparent)'
                        : 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                  color:
                    record.action.includes('delete') || record.action.includes('deny')
                      ? '#ef4444'
                      : record.action.includes('create') || record.action.includes('allow')
                        ? '#22c55e'
                        : 'var(--color-primary)',
                }}
              >
                {ACTION_LABELS[record.action] || record.action}
              </span>
              {/* 操作者 + 详情 */}
              <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {record.actor !== 'system' && (
                  <span style={{ color: 'var(--color-text-muted)' }}>{record.actor} · </span>
                )}
                {record.details && Object.keys(record.details).length > 0 && (
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {Object.entries(record.details)
                      .filter(([, v]) => v !== undefined && v !== null && v !== '')
                      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                      .join(', ')}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
