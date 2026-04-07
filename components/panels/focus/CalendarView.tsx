// components/panels/focus/CalendarView.tsx
'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { FocusEvent } from '@/types/focus'

interface Props {
  events: FocusEvent[]
  loading: boolean
  onAdd: (event: Omit<FocusEvent, 'id'>) => Promise<FocusEvent | null>
  onRemove: (id: string) => void
}

export default function CalendarView({ events, loading, onAdd, onRemove }: Props) {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  // Build calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

  const cells: { day: number; isCurrentMonth: boolean; isToday: boolean; dateStr: string }[] = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const m = currentMonth === 0 ? 11 : currentMonth - 1
    const y = currentMonth === 0 ? currentYear - 1 : currentYear
    cells.push({ day: d, isCurrentMonth: false, isToday: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear()
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, isCurrentMonth: true, isToday, dateStr })
  }

  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1
    const y = currentMonth === 11 ? currentYear + 1 : currentYear
    cells.push({ day: d, isCurrentMonth: false, isToday: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }

  // Event dates for dot indicators
  const eventDates = useMemo(() => {
    const set = new Set<string>()
    events.forEach(e => {
      const date = e.startTime.slice(0, 10)
      set.add(date)
    })
    return set
  }, [events])

  // Events for selected date
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    return events.filter(e => e.startTime.startsWith(selectedDate))
  }, [events, selectedDate])

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const handleAddEvent = async () => {
    if (!newTitle.trim() || !selectedDate) return
    await onAdd({
      title: newTitle.trim(),
      startTime: `${selectedDate}T${newStartTime}:00`,
      endTime: `${selectedDate}T${newEndTime}:00`,
    })
    setNewTitle('')
    setShowAddForm(false)
  }

  return (
    <div className="bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/40 dark:border-white/[0.06] p-4 shadow-sm flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {currentYear}年 {monthNames[currentMonth]}
        </span>
        <div className="flex gap-1">
          <button onClick={handlePrevMonth} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={handleNextMonth} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week headers */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 dark:text-gray-500 mb-1">
        {weekDays.map(d => <span key={d}>{d}</span>)}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 text-center text-xs font-medium gap-y-1">
        {cells.map((cell, idx) => (
          <button
            key={idx}
            onClick={() => cell.isCurrentMonth && setSelectedDate(cell.dateStr)}
            className={`py-1 relative transition-colors rounded-full ${
              !cell.isCurrentMonth ? 'opacity-30 cursor-default' : 'cursor-pointer'
            } ${cell.isToday ? 'bg-purple-600 text-white' : 'hover:bg-purple-50 dark:hover:bg-purple-500/10'
            } ${selectedDate === cell.dateStr ? 'ring-2 ring-purple-400' : ''
            }`}
          >
            {cell.day}
            {eventDates.has(cell.dateStr) && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-500" />
            )}
          </button>
        ))}
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="mt-2 border-t border-gray-200 dark:border-white/10 pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {selectedDate} 日程
            </span>
            <button
              onClick={() => setShowAddForm(true)}
              className="p-1 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-600 hover:bg-purple-200 dark:hover:bg-purple-500/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {showAddForm && (
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2 mb-2 flex flex-col gap-1.5">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="日程标题"
                className="text-xs bg-white dark:bg-white/10 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-purple-400"
                autoFocus
              />
              <div className="flex gap-2 text-xs">
                <input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} className="flex-1 bg-white dark:bg-white/10 rounded px-2 py-1 outline-none" />
                <span className="text-gray-400">-</span>
                <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} className="flex-1 bg-white dark:bg-white/10 rounded px-2 py-1 outline-none" />
              </div>
              <div className="flex gap-1 self-end">
                <button onClick={() => setShowAddForm(false)} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">取消</button>
                <button onClick={handleAddEvent} disabled={!newTitle.trim()} className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40">添加</button>
              </div>
            </div>
          )}

          {selectedEvents.length === 0 && !showAddForm ? (
            <p className="text-[10px] text-gray-400 text-center py-1">当日无日程</p>
          ) : (
            <div className="flex flex-col gap-1">
              {selectedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 text-xs group">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-gray-400 shrink-0">{ev.startTime.slice(11, 16)}</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{ev.title}</span>
                  <button
                    onClick={() => onRemove(ev.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
