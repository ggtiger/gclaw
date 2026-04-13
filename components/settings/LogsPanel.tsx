'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader, Terminal, Search } from 'lucide-react'

interface LogEntry {
  time: string
  level: string
  message: string
}

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  info: { bg: 'var(--color-primary-15)', text: 'var(--color-primary)' },
  warn: { bg: 'rgba(234, 179, 8, 0.15)', text: '#ca8a04' },
  error: { bg: 'var(--color-error-10)', text: 'var(--color-error)' },
}

export function LogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [limit, setLimit] = useState(500)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        date,
        limit: String(limit),
      })
      if (level) params.set('level', level)
      if (search) params.set('search', search)
      const res = await fetch(`/api/logs?${params}`)
      const data = await res.json()
      setEntries(data.entries || [])
      setTotal(data.total || 0)
      setAvailableDates(data.availableDates || [])
    } catch (err) {
      console.error('Failed to load logs:', err)
    } finally {
      setLoading(false)
    }
  }, [date, level, search, limit])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = () => {
    setSearch(searchInput)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="p-4 space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} style={{ color: 'var(--color-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            运行日志 ({total} 条)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 日期选择 */}
          {availableDates.length > 1 ? (
            <select
              value={date}
              onChange={e => setDate(e.target.value)}
              className="px-2 py-1 rounded-md border text-xs outline-none appearance-none cursor-pointer"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            >
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {date}
            </span>
          )}

          {/* 级别过滤 */}
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className="px-2 py-1 rounded-md border text-xs outline-none appearance-none cursor-pointer"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          >
            <option value="">全部级别</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>

          {/* 搜索框 */}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索关键词..."
              className="pl-7 pr-2 py-1 rounded-md border text-xs outline-none w-28"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
          </div>

          {/* 刷新 */}
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
      {entries.length === 0 && !loading ? (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          暂无日志记录
        </div>
      ) : (
        <div className="space-y-0.5 font-mono text-xs">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-3 py-1 rounded"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              {/* 时间 */}
              <span
                className="shrink-0"
                style={{ color: 'var(--color-text-muted)', minWidth: '64px' }}
              >
                {entry.time}
              </span>
              {/* 级别标签 */}
              <span
                className="shrink-0 px-1 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: LEVEL_COLORS[entry.level]?.bg || 'var(--color-bg-secondary)',
                  color: LEVEL_COLORS[entry.level]?.text || 'var(--color-text-muted)',
                }}
              >
                {entry.level.toUpperCase()}
              </span>
              {/* 消息内容 */}
              <span
                className="break-all"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {entries.length < total && (
        <div className="text-center">
          <button
            onClick={() => setLimit(prev => Math.min(prev + 500, 2000))}
            className="text-xs px-3 py-1.5 rounded-lg cursor-pointer"
            style={{
              color: 'var(--color-primary)',
              backgroundColor: 'var(--color-primary-15)',
            }}
          >
            加载更多（已显示 {entries.length}/{total}）
          </button>
        </div>
      )}
    </div>
  )
}
