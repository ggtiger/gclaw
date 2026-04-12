'use client'

import { useState } from 'react'
import { Clock, ChevronRight } from 'lucide-react'

interface SchedulePickerProps {
  onSelect: (schedule: {
    mode: 'once' | 'interval'
    runAt?: string
    intervalMs?: number
    label: string
  }) => void
  onClose: () => void
  onOpenSchedules?: () => void
}

const DELAY_OPTIONS = [
  { label: '5 分钟后', ms: 5 * 60 * 1000 },
  { label: '15 分钟后', ms: 15 * 60 * 1000 },
  { label: '30 分钟后', ms: 30 * 60 * 1000 },
  { label: '1 小时后', ms: 60 * 60 * 1000 },
  { label: '2 小时后', ms: 2 * 60 * 60 * 1000 },
]

const INTERVAL_OPTIONS = [
  { label: '每 30 分钟', ms: 30 * 60 * 1000 },
  { label: '每 1 小时', ms: 60 * 60 * 1000 },
  { label: '每 6 小时', ms: 6 * 60 * 60 * 1000 },
  { label: '每 24 小时', ms: 24 * 60 * 60 * 1000 },
]

export function SchedulePicker({ onSelect, onClose, onOpenSchedules }: SchedulePickerProps) {
  const [tab, setTab] = useState<'delay' | 'interval' | 'custom'>('delay')
  const [customMinutes, setCustomMinutes] = useState(30)

  const handleDelay = (ms: number, label: string) => {
    const runAt = new Date(Date.now() + ms).toISOString()
    onSelect({ mode: 'once', runAt, label })
  }

  const handleInterval = (ms: number, label: string) => {
    onSelect({ mode: 'interval', intervalMs: ms, label })
  }

  const handleCustom = () => {
    const ms = customMinutes * 60 * 1000
    const runAt = new Date(Date.now() + ms).toISOString()
    onSelect({ mode: 'once', runAt, label: `${customMinutes} 分钟后` })
  }

  return (
    <div className="absolute left-3 right-3 bottom-full mb-1 z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-lg border border-gray-200/60 dark:border-white/10 shadow-lg overflow-hidden">
      <div className="flex border-b border-gray-200/60 dark:border-white/10">
        {(['delay', 'interval'] as const).map(t => (
          <button
            key={t}
            type="button"
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-500'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'delay' ? '延迟发送' : '周期发送'}
          </button>
        ))}
      </div>

      <div className="py-1 max-h-48 overflow-y-auto">
        {tab === 'delay' && (
          <>
            {DELAY_OPTIONS.map(opt => (
              <button
                key={opt.ms}
                type="button"
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                onClick={() => handleDelay(opt.ms, opt.label)}
              >
                <span className="flex items-center gap-2">
                  <Clock size={14} className="text-[var(--color-text-secondary)]" />
                  {opt.label}
                </span>
                <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
              </button>
            ))}
            <div className="px-4 py-2 border-t border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={customMinutes}
                  onChange={e => setCustomMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-2 py-1 text-sm rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-700 text-[var(--color-text)] min-w-0"
                />
                <span className="text-xs text-[var(--color-text-secondary)]">分钟后</span>
                <button
                  type="button"
                  className="ml-auto px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                  onClick={handleCustom}
                >
                  确定
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'interval' && (
          <>
            {INTERVAL_OPTIONS.map(opt => (
              <button
                key={opt.ms}
                type="button"
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                onClick={() => handleInterval(opt.ms, opt.label)}
              >
                <span className="flex items-center gap-2">
                  <Clock size={14} className="text-[var(--color-text-secondary)]" />
                  {opt.label}
                </span>
                <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
              </button>
            ))}
          </>
        )}
      </div>

      {onOpenSchedules && (
        <div className="border-t border-gray-100 dark:border-white/5 px-4 py-2">
          <button
            type="button"
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
            onClick={() => { onClose(); onOpenSchedules() }}
          >
            管理定时任务...
          </button>
        </div>
      )}
    </div>
  )
}
