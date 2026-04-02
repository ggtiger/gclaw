'use client'

import { memo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader, Check, XCircle, Terminal, ListTodo, Circle, Clock, Ban } from 'lucide-react'
import type { ToolSummary, ToolCallItem } from '@/types/chat'

interface ToolCallSummaryProps {
  summary: ToolSummary
}

// ── TodoWrite 专用渲染 ──

interface TodoItem {
  id?: string
  content: string
  status: string  // 兼容大小写: PENDING/pending, IN_PROGRESS/in_progress 等
}

// 规范化 status 为大写格式
function normalizeStatus(status: string): 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'CANCELLED' {
  const upper = status.toUpperCase()
  if (upper === 'COMPLETE' || upper === 'COMPLETED' || upper === 'DONE') return 'COMPLETE'
  if (upper === 'IN_PROGRESS' || upper === 'IN-PROGRESS') return 'IN_PROGRESS'
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED'
  return 'PENDING'
}

function TodoStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETE':
      return <Check size={14} className="text-[var(--color-success)]" />
    case 'IN_PROGRESS':
      return <Clock size={14} className="text-[var(--color-primary)] animate-pulse" />
    case 'CANCELLED':
      return <Ban size={14} className="text-[var(--color-text-muted)]" />
    default: // PENDING
      return <Circle size={14} className="text-[var(--color-text-muted)]" />
  }
}

function TodoStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    PENDING: { label: '待处理', color: 'var(--color-text-muted)', bg: 'var(--color-surface-hover)' },
    IN_PROGRESS: { label: '进行中', color: 'var(--color-primary)', bg: 'color-mix(in srgb, var(--color-primary) 15%, transparent)' },
    COMPLETE: { label: '已完成', color: 'var(--color-success)', bg: 'color-mix(in srgb, var(--color-success) 15%, transparent)' },
    CANCELLED: { label: '已取消', color: 'var(--color-text-muted)', bg: 'var(--color-surface-hover)' },
  }
  const c = config[status] || config.PENDING
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: c.color, backgroundColor: c.bg }}>
      {c.label}
    </span>
  )
}

function TodoWriteView({ tools }: { tools: ToolCallItem[] }) {
  // 按调用顺序合并所有 todo_write 的 todos，模拟 merge 逻辑
  const mergedMap = new Map<string, TodoItem>()

  for (const tool of tools) {
    // 跳过 input 还未填充的 tool（content_block_start 阶段 input 为空）
    const todos = (tool.input?.todos as TodoItem[]) || []
    if (todos.length === 0) continue

    const merge = tool.input?.merge as boolean

    if (!merge) {
      // merge=false: 替换全部
      mergedMap.clear()
    }
    let idx = 0
    for (const todo of todos) {
      // 生成稳定 key：优先用 id，其次用 content hash，最后用索引
      const key = todo.id || `_auto_${todo.content?.slice(0, 30) || idx}`
      const normalized = { ...todo, id: key, status: normalizeStatus(todo.status || 'PENDING') }
      const existing = mergedMap.get(key)
      if (existing) {
        mergedMap.set(key, { ...existing, ...normalized })
      } else {
        mergedMap.set(key, normalized)
      }
      idx++
    }
  }

  const todos = Array.from(mergedMap.values())
  if (todos.length === 0) return null

  const completed = todos.filter(t => t.status === 'COMPLETE').length
  const inProgress = todos.filter(t => t.status === 'IN_PROGRESS').length
  const total = todos.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const isUpdating = tools.some(t => t.status === 'pending')

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {isUpdating ? (
          <Loader size={14} className="animate-spin text-[var(--color-primary)]" />
        ) : (
          <ListTodo size={14} className="text-[var(--color-primary)]" />
        )}
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          任务计划
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {completed}/{total} 完成
          {inProgress > 0 && ` · ${inProgress} 进行中`}
        </span>
        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full overflow-hidden ml-1" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: 'var(--color-success)' }}
          />
        </div>
      </div>
      {/* Todo list */}
      <div className="px-3 pb-2 space-y-1">
        {todos.map(todo => (
          <div
            key={todo.id}
            className="flex items-start gap-2 py-1 px-2 rounded text-xs"
            style={{
              backgroundColor: todo.status === 'IN_PROGRESS' ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
              opacity: todo.status === 'CANCELLED' ? 0.5 : 1,
            }}
          >
            <div className="mt-0.5 shrink-0">
              <TodoStatusIcon status={todo.status} />
            </div>
            <span
              className="flex-1"
              style={{
                color: 'var(--color-text)',
                textDecoration: todo.status === 'CANCELLED' ? 'line-through' : 'none',
              }}
            >
              {todo.content}
            </span>
            <TodoStatusBadge status={todo.status} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 通用工具行 ──

function ToolCallRow({ tool }: { tool: ToolCallItem }) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = () => {
    switch (tool.status) {
      case 'pending':
        return <Loader size={14} className="animate-spin text-[var(--color-primary)]" />
      case 'completed':
        return <Check size={14} className="text-[var(--color-success)]" />
      case 'error':
        return <XCircle size={14} className="text-[var(--color-error)]" />
    }
  }

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
      >
        {statusIcon()}
        <Terminal size={14} className="text-[var(--color-text-muted)]" />
        <span className="font-mono text-xs flex-1 text-left truncate" style={{ color: 'var(--color-text)' }}>
          {tool.toolName}
        </span>
        {tool.status === 'pending' && tool.elapsedSeconds != null && tool.elapsedSeconds > 0 && (
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            {tool.elapsedSeconds < 60
              ? `${Math.round(tool.elapsedSeconds)}s`
              : `${Math.floor(tool.elapsedSeconds / 60)}m${Math.round(tool.elapsedSeconds % 60)}s`}
          </span>
        )}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Input
              </div>
              <pre className="text-xs p-2 rounded overflow-x-auto" style={{ backgroundColor: 'var(--color-code-bg)', color: '#e2e8f0' }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Output
              </div>
              <pre className="text-xs p-2 rounded overflow-x-auto max-h-48" style={{
                backgroundColor: 'var(--color-code-bg)',
                color: tool.isError ? 'var(--color-error)' : '#e2e8f0',
              }}>
                {tool.output.length > 500 ? tool.output.substring(0, 500) + '...' : tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const ToolCallSummary = memo(function ToolCallSummary({ summary }: ToolCallSummaryProps) {
  const [collapsed, setCollapsed] = useState(false)
  const allTools = [...summary.pendingTools, ...summary.completedTools]

  if (allTools.length === 0) return null

  // 分离 todo_write 和其他工具
  const todoTools = allTools.filter(t => t.toolName === 'TodoWrite' || t.toolName === 'todo_write')
  const otherTools = allTools.filter(t => t.toolName !== 'TodoWrite' && t.toolName !== 'todo_write')

  const pendingCount = summary.pendingTools.filter(t => t.toolName !== 'TodoWrite' && t.toolName !== 'todo_write').length
  const completedCount = summary.completedTools.filter(t => t.toolName !== 'TodoWrite' && t.toolName !== 'todo_write').length
  const errorCount = summary.completedTools.filter(t => t.isError && t.toolName !== 'TodoWrite' && t.toolName !== 'todo_write').length

  return (
    <div className="space-y-2">
      {/* TodoWrite 专用卡片 — 只显示最新一次的 todo 列表 */}
      {todoTools.length > 0 && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <TodoWriteView tools={todoTools} />
        </div>
      )}

      {/* 其他工具调用 */}
      {otherTools.length > 0 && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <Terminal size={16} className="text-[var(--color-primary)]" />
            <span style={{ color: 'var(--color-text)' }}>
              工具调用
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {pendingCount > 0 && `${pendingCount} 执行中`}
              {pendingCount > 0 && completedCount > 0 && ' / '}
              {completedCount > 0 && `${completedCount} 完成`}
              {errorCount > 0 && ` / ${errorCount} 失败`}
            </span>
            <div className="flex-1" />
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {!collapsed && (
            <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              {otherTools.map(tool => (
                <ToolCallRow key={tool.toolUseId} tool={tool} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
