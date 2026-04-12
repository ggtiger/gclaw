'use client'

import { useState, useMemo } from 'react'
import { Clock, Calendar, Repeat } from 'lucide-react'

interface CronBuilderProps {
  value: string
  onChange: (expr: string) => void
}

type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const PRESETS: Array<{ label: string; expr: string; desc: string }> = [
  { label: '每天早 9 点', expr: '0 9 * * *', desc: '每天 09:00' },
  { label: '每天晚 8 点', expr: '0 20 * * *', desc: '每天 20:00' },
  { label: '每小时整点', expr: '0 * * * *', desc: '每小时的 0 分' },
  { label: '每 30 分钟', expr: '*/30 * * * *', desc: '每小时的 0/30 分' },
  { label: '工作日早 9 点', expr: '0 9 * * 1-5', desc: '周一至周五 09:00' },
  { label: '每周一早 9 点', expr: '0 9 * * 1', desc: '每周一 09:00' },
  { label: '每月 1 号', expr: '0 9 1 * *', desc: '每月 1 日 09:00' },
]

function buildCron(freq: Frequency, hour: number, minute: number, weekdays: number[], dayOfMonth: number, customExpr: string): string {
  switch (freq) {
    case 'daily':
      return `${minute} ${hour} * * *`
    case 'weekly':
      if (weekdays.length === 0) return `${minute} ${hour} * * 1`
      return `${minute} ${hour} * * ${weekdays.sort((a, b) => a - b).join(',')}`
    case 'monthly':
      return `${minute} ${hour} ${dayOfMonth} * *`
    case 'custom':
      return customExpr
  }
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return '无效表达式'

  const [min, hour, day, _month, dow] = parts
  const timeStr = hour === '*' ? '每小时' : `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`

  if (day !== '*') {
    if (dow !== '*') return `每月 ${day} 日 ${timeStr}`
    return `每月 ${day} 日 ${timeStr}`
  }

  if (dow !== '*') {
    const dayMap: Record<string, string> = {
      '0': '周日', '1': '周一', '2': '周二', '3': '周三',
      '4': '周四', '5': '周五', '6': '周六',
      '1-5': '工作日', '0,6': '周末',
    }
    const label = dayMap[dow] || `周${dow}`
    return `${label} ${timeStr}`
  }

  if (min.includes('/') && hour === '*') {
    const step = min.split('/')[1]
    return `每 ${step} 分钟`
  }
  if (hour === '*' && min === '*') return '每分钟'

  if (day === '*' && dow === '*') return `每天 ${timeStr}`
  return `${min} ${hour} ${day} ${_month} ${dow}`
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  // 解析当前值推断 frequency
  const [freq, setFreq] = useState<Frequency>(() => {
    const parts = value.trim().split(/\s+/)
    if (parts.length !== 5) return 'daily'
    const [_min, _hour, day, _month, dow] = parts
    if (day !== '*') return 'monthly'
    if (dow !== '*' && dow !== undefined) return 'weekly'
    return 'daily'
  })

  const [hour, setHour] = useState(() => {
    const parts = value.trim().split(/\s+/)
    const h = parseInt(parts[1], 10)
    return isNaN(h) ? 9 : h
  })

  const [minute, setMinute] = useState(() => {
    const parts = value.trim().split(/\s+/)
    const m = parseInt(parts[0], 10)
    return isNaN(m) ? 0 : m
  })

  const [weekdays, setWeekdays] = useState<number[]>(() => {
    const parts = value.trim().split(/\s+/)
    if (parts.length < 5 || parts[4] === '*') return [1]
    if (parts[4].includes('-')) {
      const [start, end] = parts[4].split('-').map(Number)
      const days: number[] = []
      for (let i = start; i <= end; i++) days.push(i)
      return days
    }
    return parts[4].split(',').map(Number).filter(n => !isNaN(n))
  })

  const [dayOfMonth, setDayOfMonth] = useState(() => {
    const parts = value.trim().split(/\s+/)
    const d = parseInt(parts[2], 10)
    return isNaN(d) ? 1 : d
  })

  const [customExpr, setCustomExpr] = useState(value)

  const handleFreqChange = (newFreq: Frequency) => {
    setFreq(newFreq)
    const expr = buildCron(newFreq, hour, minute, weekdays, dayOfMonth, customExpr)
    onChange(expr)
  }

  const handleTimeChange = (newHour: number, newMinute: number) => {
    setHour(newHour)
    setMinute(newMinute)
    if (freq !== 'custom') {
      onChange(buildCron(freq, newHour, newMinute, weekdays, dayOfMonth, customExpr))
    }
  }

  const handleWeekdaysChange = (day: number) => {
    const next = weekdays.includes(day)
      ? weekdays.filter(d => d !== day)
      : [...weekdays, day]
    if (next.length === 0) return
    setWeekdays(next)
    if (freq === 'weekly') {
      onChange(buildCron('weekly', hour, minute, next, dayOfMonth, customExpr))
    }
  }

  const handleDayOfMonthChange = (d: number) => {
    setDayOfMonth(d)
    if (freq === 'monthly') {
      onChange(buildCron('monthly', hour, minute, weekdays, d, customExpr))
    }
  }

  const handleCustomChange = (expr: string) => {
    setCustomExpr(expr)
    if (freq === 'custom') {
      onChange(expr)
    }
  }

  const handlePreset = (expr: string) => {
    onChange(expr)
    // 解析预设并同步状态
    const parts = expr.trim().split(/\s+/)
    if (parts.length === 5) {
      const h = parseInt(parts[1], 10)
      const m = parseInt(parts[0], 10)
      if (!isNaN(h)) setHour(h)
      if (!isNaN(m)) setMinute(m)

      if (parts[4] !== '*' && parts[4] !== undefined) {
        setFreq('weekly')
        if (parts[4].includes('-')) {
          const [start, end] = parts[4].split('-').map(Number)
          const days: number[] = []
          for (let i = start; i <= end; i++) days.push(i)
          setWeekdays(days)
        } else {
          setWeekdays(parts[4].split(',').map(Number).filter(n => !isNaN(n)))
        }
      } else if (parts[2] !== '*') {
        setFreq('monthly')
        setDayOfMonth(parseInt(parts[2], 10) || 1)
      } else {
        setFreq('daily')
      }
    }
  }

  const description = useMemo(() => describeCron(value), [value])

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)

  return (
    <div className="space-y-3">
      {/* 频率选择 */}
      <div>
        <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">重复频率</label>
        <div className="flex gap-1.5">
          {([
            { key: 'daily', label: '每天', icon: <Clock size={12} /> },
            { key: 'weekly', label: '每周', icon: <Calendar size={12} /> },
            { key: 'monthly', label: '每月', icon: <Calendar size={12} /> },
            { key: 'custom', label: '自定义', icon: <Repeat size={12} /> },
          ] as const).map(f => (
            <button
              key={f.key}
              type="button"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                freq === f.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => handleFreqChange(f.key)}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 时间选择 */}
      {freq !== 'custom' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">执行时间</label>
          <div className="flex gap-2">
            <select
              value={hour}
              onChange={e => handleTimeChange(parseInt(e.target.value), minute)}
              className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
            >
              {hours.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')} 时</option>
              ))}
            </select>
            <select
              value={minute}
              onChange={e => handleTimeChange(hour, parseInt(e.target.value))}
              className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
            >
              {minutes.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')} 分</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 每周 - 星期选择 */}
      {freq === 'weekly' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">星期</label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                className={`w-9 h-8 rounded-lg text-xs font-medium transition-colors ${
                  weekdays.includes(i)
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
                onClick={() => handleWeekdaysChange(i)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 快捷选择 */}
          <div className="flex gap-1.5 mt-1.5">
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              onClick={() => { setWeekdays([1, 2, 3, 4, 5]); onChange(buildCron('weekly', hour, minute, [1, 2, 3, 4, 5], dayOfMonth, customExpr)) }}
            >
              工作日
            </button>
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              onClick={() => { setWeekdays([0, 6]); onChange(buildCron('weekly', hour, minute, [0, 6], dayOfMonth, customExpr)) }}
            >
              周末
            </button>
            <button
              type="button"
              className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              onClick={() => { setWeekdays([0, 1, 2, 3, 4, 5, 6]); onChange(buildCron('weekly', hour, minute, [0, 1, 2, 3, 4, 5, 6], dayOfMonth, customExpr)) }}
            >
              每天
            </button>
          </div>
        </div>
      )}

      {/* 每月 - 日期选择 */}
      {freq === 'monthly' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">日期</label>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <button
                key={d}
                type="button"
                className={`h-7 rounded text-xs font-medium transition-colors ${
                  dayOfMonth === d
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
                onClick={() => handleDayOfMonthChange(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 自定义表达式 */}
      {freq === 'custom' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Cron 表达式</label>
          <input
            type="text"
            value={customExpr}
            onChange={e => handleCustomChange(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
          <p className="text-[10px] text-[var(--color-text-secondary)] mt-1">
            格式：分 时 日 月 周（例：*/15 9-17 * * 1-5 = 工作日 9-17 点每 15 分钟）
          </p>
        </div>
      )}

      {/* 快捷预设 */}
      <div>
        <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">快捷预设</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.expr}
              type="button"
              className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${
                value === p.expr
                  ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium'
                  : 'bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => handlePreset(p.expr)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 表达式预览 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 border border-purple-200/50 dark:border-purple-500/20">
        <Clock size={14} className="text-purple-500 flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">{description}</span>
          <span className="text-[10px] text-purple-500/70 ml-2 font-mono">{value}</span>
        </div>
      </div>
    </div>
  )
}
