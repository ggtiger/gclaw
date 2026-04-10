'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { HelpCircle, CheckCircle2, Circle, Send, Pencil } from 'lucide-react'
import type { AskUserQuestionRequest } from '@/types/chat'

interface AskQuestionDialogProps {
  request: AskUserQuestionRequest
  onRespond: (requestId: string, answers: Record<string, string>) => void
}

const TIMEOUT_SECONDS = 300

export const AskQuestionDialog = memo(function AskQuestionDialog({ request, onRespond }: AskQuestionDialogProps) {
  const [selections, setSelections] = useState<Record<number, string | string[]>>({})
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({})
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({})
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS)
  const customInputRef = useRef<HTMLInputElement>(null)

  // 初始化默认选择
  useEffect(() => {
    const defaults: Record<number, string | string[]> = {}
    request.questions.forEach((q, i) => {
      if (q.options.length > 0) {
        defaults[i] = q.multiSelect ? [] : ''
      }
    })
    setSelections(defaults)
  }, [request.requestId, request.questions])

  // 超时倒计时
  useEffect(() => {
    setCountdown(TIMEOUT_SECONDS)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          // 超时提交默认回答
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.requestId])

  const handleSingleSelect = (qIndex: number, label: string) => {
    setSelections(prev => ({ ...prev, [qIndex]: label }))
  }

  const handleMultiSelect = (qIndex: number, label: string) => {
    setSelections(prev => {
      const current = (prev[qIndex] as string[]) || []
      const updated = current.includes(label)
        ? current.filter(l => l !== label)
        : [...current, label]
      return { ...prev, [qIndex]: updated }
    })
  }

  const handleEnableCustomMode = (qIndex: number) => {
    setCustomMode(prev => ({ ...prev, [qIndex]: true }))
    setCustomInputs(prev => ({ ...prev, [qIndex]: '' }))
    // 清空预设选项选择
    setSelections(prev => {
      const defaults: Record<number, string | string[]> = {}
      request.questions.forEach((q, i) => {
        if (i !== qIndex && q.options.length > 0) {
          defaults[i] = prev[i] !== undefined ? prev[i] : (q.multiSelect ? [] : '')
        }
      })
      defaults[qIndex] = ''
      return defaults
    })
    // 延迟聚焦输入框
    setTimeout(() => customInputRef.current?.focus(), 50)
  }

  const handleCustomInputConfirm = (qIndex: number) => {
    const val = customInputs[qIndex]?.trim()
    if (val) {
      setSelections(prev => ({ ...prev, [qIndex]: val }))
    }
  }

  const handleSubmit = (timeout = false) => {
    const answers: Record<string, string> = {}
    request.questions.forEach((q, i) => {
      const sel = selections[i]
      if (timeout) {
        // 超时时选择第一个选项
        answers[q.question] = q.options[0]?.label || ''
      } else if (customMode[i]) {
        // 自定义输入模式
        answers[q.question] = customInputs[i]?.trim() || ''
      } else if (Array.isArray(sel)) {
        answers[q.question] = sel.join(', ')
      } else {
        answers[q.question] = sel || ''
      }
    })
    onRespond(request.requestId, answers)
  }

  const canSubmit = request.questions.every((q, i) => {
    if (customMode[i]) {
      return (customInputs[i]?.trim() || '').length > 0
    }
    const sel = selections[i]
    if (q.multiSelect) return Array.isArray(sel) && sel.length > 0
    return typeof sel === 'string' && sel !== ''
  })

  return (
    <div
      className="mx-4 mb-2 rounded-lg border overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
      style={{
        borderColor: 'var(--color-primary, #7c3aed)',
        backgroundColor: 'var(--color-surface)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxHeight: '260px',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ backgroundColor: 'rgba(124, 58, 237, 0.12)' }}
      >
        <HelpCircle size={13} style={{ color: 'var(--color-primary, #7c3aed)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          Agent 提问
        </span>
        <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>
          {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')} 后自动选择
        </span>
      </div>

      {/* Questions - scrollable */}
      <div className="px-3 py-2 space-y-2.5 overflow-y-auto" style={{ maxHeight: '200px' }}>
        {request.questions.map((q, qIdx) => (
          <div key={qIdx}>
            <div className="flex items-center gap-1.5 mb-1">
              {q.header && (
                <span
                  className="inline-block px-1.5 py-px rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: 'rgba(124, 58, 237, 0.12)',
                    color: 'var(--color-primary, #7c3aed)',
                  }}
                >
                  {q.header}
                </span>
              )}
            </div>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
              {q.question}
            </div>
            {/* Options as compact pills */}
            {customMode[qIdx] ? (
              /* 自定义输入模式 */
              <div className="flex items-center gap-1.5">
                <input
                  ref={qIdx === Object.keys(customMode).findIndex(k => customMode[Number(k)]) ? customInputRef : undefined}
                  type="text"
                  value={customInputs[qIdx] || ''}
                  onChange={e => setCustomInputs(prev => ({ ...prev, [qIdx]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleCustomInputConfirm(qIdx) }}
                  placeholder="输入你的回答..."
                  className="flex-1 text-xs px-2 py-1 rounded-md border outline-none"
                  style={{
                    borderColor: 'var(--color-primary, #7c3aed)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  onClick={() => handleCustomInputConfirm(qIdx)}
                  disabled={!customInputs[qIdx]?.trim()}
                  className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--color-primary, #7c3aed)',
                    color: '#fff',
                  }}
                >
                  确认
                </button>
                <button
                  onClick={() => setCustomMode(prev => ({ ...prev, [qIdx]: false }))}
                  className="px-2 py-1 rounded-md text-[11px] cursor-pointer"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {q.options.map((opt, oIdx) => {
                  const isSelected = q.multiSelect
                    ? ((selections[qIdx] as string[]) || []).includes(opt.label)
                    : selections[qIdx] === opt.label

                  return (
                    <button
                      key={oIdx}
                      onClick={() => q.multiSelect ? handleMultiSelect(qIdx, opt.label) : handleSingleSelect(qIdx, opt.label)}
                      title={opt.description}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all duration-150 cursor-pointer"
                      style={{
                        borderColor: isSelected
                          ? 'var(--color-primary, #7c3aed)'
                          : 'var(--color-border)',
                        backgroundColor: isSelected
                          ? 'rgba(124, 58, 237, 0.12)'
                          : 'transparent',
                        color: isSelected ? 'var(--color-primary, #7c3aed)' : 'var(--color-text)',
                      }}
                    >
                      {isSelected ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                      {opt.label}
                    </button>
                  )
                })}
                {/* 其他... 选项 */}
                <button
                  onClick={() => handleEnableCustomMode(qIdx)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all duration-150 cursor-pointer"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-muted)',
                    backgroundColor: 'transparent',
                  }}
                >
                  <Pencil size={10} />
                  其他...
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit bar */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={() => handleSubmit()}
          disabled={!canSubmit}
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--color-primary, #7c3aed)',
            color: '#fff',
          }}
        >
          <Send size={11} />
          提交
        </button>
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
          <div
            className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{
              width: `${(countdown / TIMEOUT_SECONDS) * 100}%`,
              backgroundColor: countdown > 60 ? 'var(--color-primary, #7c3aed)' : 'var(--color-warning, #f59e0b)',
            }}
          />
        </div>
      </div>
    </div>
  )
})
