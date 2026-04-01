'use client'

import { memo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader, Check, XCircle, Terminal } from 'lucide-react'
import type { ToolSummary, ToolCallItem } from '@/types/chat'

interface ToolCallSummaryProps {
  summary: ToolSummary
}

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

  const pendingCount = summary.pendingTools.length
  const completedCount = summary.completedTools.length
  const errorCount = summary.completedTools.filter(t => t.isError).length

  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
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
          {allTools.map(tool => (
            <ToolCallRow key={tool.toolUseId} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
})
