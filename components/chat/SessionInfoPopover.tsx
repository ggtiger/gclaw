'use client'

import { useState, useRef, useEffect } from 'react'
import { Trash2, Minimize2 } from 'lucide-react'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** 输入框工具栏的上下文圆环 + popover */
export function ContextRing({
  inputTokens, maxContext, contextUsage,
  onCompact, onClear, disabled,
}: {
  inputTokens: number
  maxContext: number
  contextUsage: number
  onCompact?: () => void
  onClear?: () => void
  disabled?: boolean
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
  // 主题色为底，占比高时变红
  let color = 'var(--color-primary)'
  if (pct >= 80) color = '#ef4444'
  else if (pct >= 60) color = '#f59e0b'

  // SVG 圆环参数
  const size = 18
  const r = (size - 3) / 2
  const circ = 2 * Math.PI * r
  const stroke = circ * (1 - contextUsage)

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 disabled:opacity-50 hover:bg-purple-50 dark:hover:bg-purple-500/10"
        style={{ color }}
        title={`上下文: ${formatTokens(inputTokens)} / ${formatTokens(maxContext)}`}
      >
        <svg width={size} height={size} className="rotate-[-90deg] flex-shrink-0">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2}
            style={{ stroke: 'var(--color-bg-tertiary)' }} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2}
            strokeDasharray={circ} strokeDashoffset={stroke} strokeLinecap="round"
            style={{ stroke: color, transition: 'stroke-dashoffset .5s, stroke .3s' }} />
        </svg>
        <span className="whitespace-nowrap">{pct}%</span>
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 w-48 rounded-xl border shadow-lg z-50 animate-fade-in"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="px-3 py-2.5 space-y-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              上下文 {formatTokens(inputTokens)} / {formatTokens(maxContext)}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { onCompact?.(); setOpen(false) }}
                disabled={disabled}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 disabled:opacity-50"
              >
                <Minimize2 size={12} />
                压缩
              </button>
              <button
                onClick={() => { onClear?.(); setOpen(false) }}
                disabled={disabled}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 disabled:opacity-50"
              >
                <Trash2 size={12} />
                清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
