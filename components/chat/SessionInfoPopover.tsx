'use client'

import { useState, useRef, useEffect } from 'react'
import { Trash2, Minimize2, AlertTriangle, RefreshCw } from 'lucide-react'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** 输入框工具栏的上下文圆环 + popover */
export function ContextRing({
  inputTokens, maxContext, contextUsage, maxContextKnown,
  onCompact, onClear, disabled, compacting,
}: {
  inputTokens: number
  maxContext: number
  contextUsage: number
  maxContextKnown?: boolean // 上限是否已知
  onCompact?: () => void
  onClear?: () => void
  disabled?: boolean
  compacting?: boolean
}) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const pct = Math.round(contextUsage * 100)
  // 判断是否超限：上限未知时超过 90% 也视为可能超限
  const isOverLimit = maxContextKnown ? pct >= 100 : inputTokens > 200000

  // 压缩中时使用琥珀色旋转动画
  const compactColor = '#f59e0b'

  // 上限未知时使用灰色，已知时按占比变色
  let color = 'var(--color-text-muted)'
  if (compacting) {
    color = compactColor
  } else if (isOverLimit) {
    color = '#ef4444' // 红色警告
  } else if (maxContextKnown) {
    if (pct >= 80) color = '#ef4444'
    else if (pct >= 60) color = '#f59e0b'
    else color = 'var(--color-primary)'
  }

  // SVG 圆环参数
  const size = 18
  const r = (size - 3) / 2
  const circ = 2 * Math.PI * r
  const stroke = maxContextKnown ? circ * (1 - Math.min(contextUsage, 1)) : circ * 0.3 // 未知时显示不确定状态

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 disabled:opacity-50 hover:bg-purple-50 dark:hover:bg-purple-500/10 ${isOverLimit && !compacting ? 'animate-pulse' : ''}`}
        style={{ color }}
        title={compacting ? '正在压缩上下文...' : `上下文: ${formatTokens(inputTokens)}${maxContextKnown ? ` / ${formatTokens(maxContext)}` : ' (上限未知)'}${isOverLimit ? ' ⚠️ 已超限！' : ''}`}
      >
        {compacting ? (
          <RefreshCw size={size} className="animate-spin flex-shrink-0" style={{ color: compactColor }} />
        ) : (
          <svg width={size} height={size} className="rotate-[-90deg] flex-shrink-0">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2}
              style={{ stroke: 'var(--color-bg-tertiary)' }} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2}
              strokeDasharray={circ} strokeDashoffset={stroke} strokeLinecap="round"
              style={{ stroke: color, transition: 'stroke-dashoffset .5s, stroke .3s' }} />
          </svg>
        )}
        <span className="whitespace-nowrap">
          {compacting ? '压缩中' : (isOverLimit ? '⚠️' : (maxContextKnown ? `${pct}%` : '?'))}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 w-56 rounded-xl border shadow-lg z-50 animate-fade-in"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: isOverLimit ? '#ef4444' : 'var(--color-border)',
          }}
        >
          <div className="px-3 py-2.5 space-y-2">
            {compacting && (
              <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <RefreshCw size={12} className="animate-spin" />
                正在压缩上下文...
              </div>
            )}
            <div className={`text-[11px] ${isOverLimit ? 'text-red-500 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
              {isOverLimit && <AlertTriangle size={12} className="inline mr-1" />}
              上下文 {formatTokens(inputTokens)}{maxContextKnown ? ` / ${formatTokens(maxContext)}` : ' (上限未知)'}
              {isOverLimit && <span className="text-red-500 ml-1">已超限！</span>}
            </div>
            {isOverLimit && (
              <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                上下文已超出模型限制，无法继续对话。请点击"清空会话"开始新会话。
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={() => { onCompact?.(); setOpen(false) }}
                disabled={disabled || isOverLimit || compacting}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 disabled:opacity-50"
              >
                <Minimize2 size={12} />
                压缩
              </button>
              <button
                onClick={() => { onClear?.(); setOpen(false) }}
                disabled={disabled || compacting}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${isOverLimit ? 'bg-red-500 text-white hover:bg-red-600' : 'hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400'} disabled:opacity-50`}
              >
                <Trash2 size={12} />
                清空会话
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
