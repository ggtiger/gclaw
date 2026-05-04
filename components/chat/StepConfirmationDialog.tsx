'use client'

import { memo, useState } from 'react'
import { Play, Pencil, Square, CheckCircle, RotateCcw } from 'lucide-react'

interface StepConfirmationDialogProps {
  request: {
    requestId: string
    stepId: string
    stepName: string
    stepIndex: number
    totalSteps: number
    output: string
  }
  onRespond: (requestId: string, action: 'continue' | 'modify' | 'abort', modifiedContent?: string) => void
}

export const StepConfirmationDialog = memo(function StepConfirmationDialog({ request, onRespond }: StepConfirmationDialogProps) {
  const [showModify, setShowModify] = useState(false)
  const [modifiedContent, setModifiedContent] = useState('')

  const truncatedOutput = request.output.length > 500
    ? request.output.slice(0, 500) + '...'
    : request.output

  return (
    <div
      className="mx-4 mb-2 rounded-lg border overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
      style={{
        borderColor: 'var(--color-primary, #7c3aed)',
        backgroundColor: 'var(--color-surface)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ backgroundColor: 'rgba(34, 197, 94, 0.12)' }}
      >
        <CheckCircle size={13} style={{ color: '#16a34a' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          步骤 {request.stepIndex + 1}/{request.totalSteps} &quot;{request.stepName}&quot; 已完成
        </span>
      </div>

      {/* Output preview */}
      <div className="px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
          输出预览
        </div>
        <div
          className="text-xs leading-relaxed whitespace-pre-wrap break-all rounded-md p-2 max-h-40 overflow-y-auto"
          style={{
            backgroundColor: 'var(--color-surface-hover, rgba(0,0,0,0.03))',
            color: 'var(--color-text-secondary, #64748b)',
          }}
        >
          {truncatedOutput}
        </div>
      </div>

      {/* Modify area */}
      {showModify && (
        <div className="px-3 pb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
            请输入修改指令，AI 将根据您的要求重新执行此步骤
          </div>
          <textarea
            value={modifiedContent}
            onChange={e => setModifiedContent(e.target.value)}
            placeholder="例如：重点分析安全问题、输出更简洁一些..."
            rows={3}
            className="w-full text-xs rounded-md border p-2 outline-none resize-y"
            style={{
              borderColor: 'var(--color-primary, #7c3aed)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              minHeight: '60px',
            }}
            autoFocus
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
        {showModify ? (
          <>
            <button
              onClick={() => onRespond(request.requestId, 'modify', modifiedContent)}
              disabled={!modifiedContent.trim()}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-primary, #7c3aed)',
                color: '#fff',
              }}
            >
              <RotateCcw size={11} />
              重新执行
            </button>
            <button
              onClick={() => setShowModify(false)}
              className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onRespond(request.requestId, 'continue')}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors"
              style={{
                backgroundColor: 'var(--color-primary, #7c3aed)',
                color: '#fff',
              }}
            >
              <Play size={11} />
              继续下一步
            </button>
            <button
              onClick={() => setShowModify(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors border"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              <Pencil size={11} />
              修改
            </button>
            <button
              onClick={() => onRespond(request.requestId, 'abort')}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
              }}
            >
              <Square size={11} />
              中止
            </button>
          </>
        )}
      </div>
    </div>
  )
})
