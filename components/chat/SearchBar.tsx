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
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400"
        title="搜索消息"
      >
        <Search size={13} />
        搜索
      </button>
    )
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-500" />
        <input
          type="text"
          value={keyword}
          onChange={e => handleKeywordChange(e.target.value)}
          placeholder="搜索消息..."
          autoFocus
          className="w-36 pl-7 pr-2 py-1 rounded-md border text-xs outline-none transition-all duration-200 focus:border-purple-500 focus:w-48"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </div>
      <button
        onClick={() => setShowFilters(!showFilters)}
        className={`p-1 rounded-md cursor-pointer transition-all duration-200 ${showFilters ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400' : 'text-slate-400 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400'}`}
        title="筛选"
      >
        <Filter size={13} />
      </button>
      <button
        onClick={handleClose}
        className="p-1 rounded-md cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-200"
      >
        <X size={13} />
      </button>

      {/* 浮动下拉面板：筛选器 + 搜索结果 */}
      {(showFilters || (keyword.trim() && (loading || results.length >= 0))) && (
        <div className="absolute top-full right-0 mt-1 w-72 rounded-lg border shadow-lg z-50 animate-fade-in overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          {/* 筛选器 */}
          {showFilters && (
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <select
                value={role}
                onChange={e => handleFilterChange(e.target.value, timeRange)}
                className="px-2 py-1 rounded-md border text-xs outline-none cursor-pointer focus:border-purple-500 transition-colors"
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
                className="px-2 py-1 rounded-md border text-xs outline-none cursor-pointer focus:border-purple-500 transition-colors"
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
                <span className="text-xs text-slate-400 ml-auto">
                  {results.length} 条
                </span>
              )}
            </div>
          )}

          {/* 搜索结果 */}
          {keyword.trim() && (
            <div className="max-h-52 overflow-y-auto p-1">
              {loading ? (
                <div className="text-xs py-3 text-center text-slate-400">
                  搜索中...
                </div>
              ) : results.length === 0 ? (
                <div className="text-xs py-3 text-center text-slate-400">
                  未找到匹配的消息
                </div>
              ) : (
                results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { onJumpToMessage(r.id); handleClose() }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-all duration-200 cursor-pointer hover:bg-purple-500/5"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`shrink-0 px-1.5 py-0 rounded text-[10px] font-medium ${r.role === 'user' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}
                      >
                        {r.role === 'user' ? '用户' : r.role === 'assistant' ? '助手' : '系统'}
                      </span>
                      <span className="truncate text-slate-400" style={{ fontSize: '10px' }}>
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
