// components/panels/focus/TodoList.tsx
'use client'

import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { FocusTodo } from '@/types/focus'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
}
const statusLabels: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
}

interface Props {
  todos: FocusTodo[]
  loading: boolean
  onToggle: (todo: FocusTodo) => void
  onAdd: (title: string) => Promise<FocusTodo | null>
  onRemove: (id: string) => void
}

export default function TodoList({ todos, loading, onToggle, onAdd, onRemove }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title || submitting) return
    setSubmitting(true)
    await onAdd(title)
    setNewTitle('')
    setSubmitting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleAdd()
    }
  }

  return (
    <div className="bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-lg border border-white/40 dark:border-white/[0.06] p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">待办任务</span>
        <span className="text-[10px] text-gray-400">
          {todos.filter(t => t.status !== 'completed').length} 项待处理
        </span>
      </div>

      {/* 内联添加 */}
      <div className="flex items-center gap-2 min-w-0">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="添加新待办..."
          className="flex-1 min-w-0 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-400 placeholder:text-gray-400"
        />
        <button
          onClick={handleAdd}
          disabled={!newTitle.trim() || submitting}
          className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 hover:bg-purple-200 dark:hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-white/10 animate-pulse shrink-0" />
              <div className="flex-1 h-4 rounded bg-gray-200 dark:bg-white/10 animate-pulse" style={{ width: `${60 + i * 10}%` }} />
            </div>
          ))}
        </div>
      ) : todos.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">暂无待办，添加一个吧</p>
      ) : (
        <div className="max-h-[220px] overflow-y-auto thin-scrollbar flex flex-col gap-2">
          {todos.slice(0, 10).map(todo => {
            const done = todo.status === 'completed'
            return (
              <div key={todo.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => onToggle(todo)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                    done ? 'bg-purple-600 border-purple-600' : 'border-gray-300 dark:border-gray-600 hover:border-purple-400'
                  }`}
                >
                  {done && <Check className="w-3 h-3 text-white" />}
                </button>
                <span className={`flex-1 text-sm truncate transition-all ${
                  done ? 'line-through opacity-50 text-gray-400' : 'text-gray-900 dark:text-white font-medium group-hover:text-purple-600'
                }`}>
                  {todo.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusColors[todo.status]}`}>
                  {statusLabels[todo.status]}
                </span>
                <button
                  onClick={() => onRemove(todo.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
