'use client'

import { useState, useCallback, useRef } from 'react'
import { Search, X, Filter, ChevronDown } from 'lucide-react'
import type { SearchResult } from '@/lib/store/messages'

interface SearchBarProps {
  projectId: string
  onJumpToMessage: (messageId: string) => void
}

export function SearchBar({ projectId, onJumpToMessage }: SearchBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState<string>('')
  const [timeRange, setTimeRange] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const doSearch = useCallback(async (kw: string, r: string, tr: string) => {
    if (!kw.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        projectId,
        keyword: kw.trim(),
        limit: '50',
      })
      if (r) params.set('role', r)
      if (tr !== 'all') params.set('timeRange', tr)

      const res = await fetch(`/api/chat/messages/search?${params}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const handleKeywordChange = (value: string) => {
    setKeyword(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(value, role, timeRange)
    }, 300)
  }

  const handleFilterChange = (newRole: string, newTimeRange: string) => {
    if (newRole !== undefined) setRole(newRole)
    if (newTimeRange !== undefined) setTimeRange(newTimeRange)
    const effectiveRole = newRole !== undefined ? newRole : role
    const effectiveTime = newTimeRange !== undefined ? newTimeRange : timeRange
    if (keyword.trim()) {
      doSearch(keyword, effectiveRole, effectiveTime)
    }
  }

  const handleClose = () => {
    setExpanded(false)
    setKeyword('')
    setResults([])
    setShowFilters(false)
  }

  const highlightText = (text: string, kw: string) => {
    if (!kw.trim()) return truncate(text, 120)
    const lower = text.toLowerCase()
    const kwLower = kw.toLowerCase()
    const idx = lower.indexOf(kwLower)
    if (idx === -1) return truncate(text, 120)

    // 截取关键词上下文
    const start = Math.max(0, idx - 40)
    const end = Math.min(text.length, idx + kw.length + 60)
    let snippet = ''
    if (start > 0) snippet += '...'
    snippet += text.slice(start, end)
    if (end < text.length) snippet += '...'

    // 高亮关键词
    const parts = snippet.split(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === kwLower
        ? <mark key={i} className="rounded px-0.5" style={{ backgroundColor: '#FDE047', color: 'var(--color-text)' }}>{part}</mark>
        : part
    )
  }

  if (!expanded) {
    return (
      <div className="px-3 py-1.5 flex justify-end">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer"
          style={{
            color: 'var(--color-text-muted)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
          title="搜索消息"
        >
          <Search size={13} />
          搜索
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 space-y-2 animate-fade-in-up" style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* 搜索输入行 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={keyword}
            onChange={e => handleKeywordChange(e.target.value)}
            placeholder="搜索消息内容..."
            autoFocus
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-1.5 rounded-md cursor-pointer transition-colors ${showFilters ? '' : ''}`}
          style={{
            backgroundColor: showFilters ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
            color: showFilters ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
          title="筛选"
        >
          <Filter size={14} />
        </button>
        <button
          onClick={handleClose}
          className="p-1.5 rounded-md cursor-pointer"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 筛选器 */}
      {showFilters && (
        <div className="flex items-center gap-2 animate-fade-in">
          <select
            value={role}
            onChange={e => handleFilterChange(e.target.value, timeRange)}
            className="px-2 py-1 rounded-md border text-xs outline-none cursor-pointer"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          >
            <option value="">全部角色</option>
            <option value="user">用户</option>
            <option value="assistant">助手</option>
            <option value="system">系统</option>
          </select>
          <select
            value={timeRange}
            onChange={e => handleFilterChange(role, e.target.value)}
            className="px-2 py-1 rounded-md border text-xs outline-none cursor-pointer"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          >
            <option value="all">全部时间</option>
            <option value="today">今天</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
          {results.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {results.length} 条结果
            </span>
          )}
        </div>
      )}

      {/* 搜索结果 */}
      {keyword.trim() && (
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {loading ? (
            <div className="text-xs py-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
              搜索中...
            </div>
          ) : results.length === 0 ? (
            <div className="text-xs py-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
              未找到匹配的消息
            </div>
          ) : (
            results.map(r => (
              <button
                key={r.id}
                onClick={() => onJumpToMessage(r.id)}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer hover:bg-[var(--color-bg-secondary)]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="shrink-0 px-1.5 py-0 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: r.role === 'user' ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                      color: r.role === 'user' ? 'var(--color-primary)' : 'var(--color-success)',
                    }}
                  >
                    {r.role === 'user' ? '用户' : r.role === 'assistant' ? '助手' : '系统'}
                  </span>
                  <span className="truncate" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                    {formatTime(r.createdAt)}
                  </span>
                </div>
                <div className="line-clamp-2 leading-relaxed">
                  {highlightText(r.content, keyword)}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
