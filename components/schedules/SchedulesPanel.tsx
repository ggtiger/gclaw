'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, Play, Trash2, MessageSquare, Terminal, Globe, Zap, ToggleLeft, ToggleRight, Pencil } from 'lucide-react'
import type { ScheduledTask } from '@/types/schedules'
import { TaskForm } from './TaskForm'

interface SchedulesPanelProps {
  projectId?: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'chat-message': <MessageSquare size={14} className="text-blue-500" />,
  'script': <Terminal size={14} className="text-green-500" />,
  'webhook': <Globe size={14} className="text-orange-500" />,
  'execute-skill': <Zap size={14} className="text-purple-500" />,
  'custom': <Clock size={14} className="text-gray-500" />,
}

const TYPE_LABELS: Record<string, string> = {
  'chat-message': '聊天消息',
  'script': '脚本',
  'webhook': 'Webhook',
  'execute-skill': '技能',
  'custom': '自定义',
}

function formatSchedule(task: ScheduledTask): string {
  switch (task.schedule.mode) {
    case 'once':
      return task.schedule.runAt
        ? `单次 · ${new Date(task.schedule.runAt).toLocaleString('zh-CN')}`
        : '单次'
    case 'interval': {
      const ms = task.schedule.intervalMs || 0
      const min = Math.round(ms / 60_000)
      if (min >= 60) return `每 ${Math.round(min / 60)} 小时`
      return `每 ${min} 分钟`
    }
    case 'cron':
      return `Cron: ${task.schedule.cron}`
    default:
      return '未知'
  }
}

function formatTime(iso?: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SchedulesPanel({ projectId }: SchedulesPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)

  const loadTasks = useCallback(async () => {
    try {
      const params = projectId ? `?projectId=${projectId}` : ''
      const res = await fetch(`/api/schedules${params}`)
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch (err) {
      console.error('Failed to load schedules:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const toggleEnabled = async (task: ScheduledTask) => {
    try {
      await fetch(`/api/schedules?id=${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !task.enabled }),
      })
      loadTasks()
    } catch (err) {
      console.error('Failed to toggle task:', err)
    }
  }

  const triggerTask = async (task: ScheduledTask) => {
    try {
      await fetch(`/api/schedules/trigger?id=${task.id}`, { method: 'POST' })
      loadTasks()
    } catch (err) {
      console.error('Failed to trigger task:', err)
    }
  }

  const deleteTask = async (id: string) => {
    try {
      await fetch(`/api/schedules?id=${id}`, { method: 'DELETE' })
      loadTasks()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  const handleSaved = () => {
    setEditingTask(null)
    setShowForm(false)
    loadTasks()
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
        加载中...
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 任务列表 */}
      {tasks.length === 0 && !showForm && !editingTask ? (
        <div className="text-center py-8 text-[var(--color-text-secondary)]">
          <Clock size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无定时任务</p>
          <p className="text-xs mt-1">点击下方按钮或在聊天输入框中创建</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const isEditing = editingTask?.id === task.id
            return (
              <div key={task.id}>
                {/* 编辑态：展开内联表单 */}
                {isEditing ? (
                  <TaskForm
                    projectId={projectId}
                    task={editingTask}
                    onSaved={handleSaved}
                    onCancel={() => setEditingTask(null)}
                  />
                ) : (
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                      task.enabled
                        ? 'border-gray-200/60 dark:border-white/10 bg-white/60 dark:bg-slate-800/60'
                        : 'border-gray-200/30 dark:border-white/5 bg-gray-50/50 dark:bg-slate-800/30 opacity-60'
                    }`}
                  >
                    {/* 类型图标 */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                      {TYPE_ICONS[task.type] || TYPE_ICONS['custom']}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text)] truncate">{task.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] flex-shrink-0">
                          {TYPE_LABELS[task.type] || task.type}
                        </span>
                        {task.status === 'running' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex-shrink-0 animate-pulse">
                            运行中
                          </span>
                        )}
                        {task.status === 'error' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex-shrink-0">
                            错误
                          </span>
                        )}
                        {task.createdBy?.startsWith('skill:') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex-shrink-0">
                            {task.createdBy}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                        {formatSchedule(task)} · 已执行 {task.runCount} 次
                      </div>
                      <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
                        上次: {formatTime(task.lastRunAt)} · 下次: {formatTime(task.nextRunAt)}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingTask(task)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        title="编辑"
                      >
                        <Pencil size={14} className="text-[var(--color-text-secondary)]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEnabled(task)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        title={task.enabled ? '禁用' : '启用'}
                      >
                        {task.enabled
                          ? <ToggleRight size={18} className="text-purple-500" />
                          : <ToggleLeft size={18} className="text-[var(--color-text-secondary)]" />
                        }
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerTask(task)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        title="手动触发"
                      >
                        <Play size={14} className="text-[var(--color-text-secondary)]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} className="text-[var(--color-text-secondary)] hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 新建表单 */}
      {showForm ? (
        <TaskForm projectId={projectId} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      ) : !editingTask ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors"
        >
          + 新建任务
        </button>
      ) : null}
    </div>
  )
}
