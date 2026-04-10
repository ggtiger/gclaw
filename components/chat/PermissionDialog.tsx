'use client'

import { memo, useState, useEffect } from 'react'
import { Shield, Terminal, FileEdit, FilePlus, AlertTriangle, Check, X } from 'lucide-react'
import type { PermissionRequest } from '@/types/chat'

interface PermissionDialogProps {
  request: PermissionRequest
  onRespond: (requestId: string, decision: 'allow' | 'deny') => void
}

const TIMEOUT_SECONDS = 60

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'Bash':
      return <Terminal size={18} className="text-amber-400" />
    case 'Write':
      return <FilePlus size={18} className="text-blue-400" />
    case 'Edit':
    case 'MultiEdit':
      return <FileEdit size={18} className="text-blue-400" />
    default:
      return <AlertTriangle size={18} className="text-amber-400" />
  }
}

function getToolLabel(toolName: string): string {
  switch (toolName) {
    case 'Bash': return '执行命令'
    case 'Write': return '写入文件'
    case 'Edit': return '编辑文件'
    case 'MultiEdit': return '批量编辑'
    default: return toolName
  }
}

export const PermissionDialog = memo(function PermissionDialog({ request, onRespond }: PermissionDialogProps) {
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS)

  useEffect(() => {
    setCountdown(TIMEOUT_SECONDS)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          onRespond(request.requestId, 'deny')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [request.requestId, onRespond])

  return (
    <div
      className="mx-4 mb-2 rounded-lg border overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
      style={{
        borderColor: 'var(--color-warning, #f59e0b)',
        backgroundColor: 'var(--color-surface)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
      >
        <Shield size={16} style={{ color: 'var(--color-warning, #f59e0b)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          权限请求
        </span>
        <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
          {countdown}s 后自动拒绝
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          {getToolIcon(request.toolName)}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {getToolLabel(request.toolName)}
            </div>
            <div
              className="text-sm font-mono break-all"
              style={{
                color: 'var(--color-text)',
                backgroundColor: 'var(--color-code-bg, #1e293b)',
                padding: '6px 10px',
                borderRadius: '6px',
                maxHeight: '80px',
                overflow: 'auto',
              }}
            >
              {request.description}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onRespond(request.requestId, 'allow')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--color-success, #22c55e)',
              color: '#fff',
            }}
          >
            <Check size={14} />
            允许
          </button>
          <button
            onClick={() => onRespond(request.requestId, 'deny')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--color-error, #ef4444)',
              color: '#fff',
            }}
          >
            <X size={14} />
            拒绝
          </button>

          {/* Progress bar */}
          <div className="flex-1 h-1 rounded-full overflow-hidden ml-2" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(countdown / TIMEOUT_SECONDS) * 100}%`,
                backgroundColor: countdown > 10 ? 'var(--color-warning, #f59e0b)' : 'var(--color-error, #ef4444)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
})
