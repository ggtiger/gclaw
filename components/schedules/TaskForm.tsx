'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, X } from 'lucide-react'
import type { TaskType, TaskSchedule, ScheduledTask } from '@/types/schedules'
import { CronBuilder } from './CronBuilder'

interface TaskFormProps {
  projectId?: string
  task?: ScheduledTask | null    // 有值 = 编辑模式
  onSaved: () => void
  onCancel?: () => void           // 编辑模式取消回调
}

function toLocalDatetime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TaskForm({ projectId, task, onSaved, onCancel }: TaskFormProps) {
  const isEdit = !!task

  const [name, setName] = useState(task?.name || '')
  const [type, setType] = useState<TaskType>(task?.type || 'chat-message')
  const [scheduleMode, setScheduleMode] = useState<'once' | 'interval' | 'cron'>(task?.schedule.mode || 'once')
  const [runAt, setRunAt] = useState(toLocalDatetime(task?.schedule.runAt))
  const [intervalMin, setIntervalMin] = useState(() => {
    if (task?.schedule.intervalMs) return Math.round(task.schedule.intervalMs / 60_000)
    return 30
  })
  const [cronExpr, setCronExpr] = useState(task?.schedule.cron || '0 9 * * *')
  const [message, setMessage] = useState((task?.config?.message as string) || '')
  const [command, setCommand] = useState((task?.config?.command as string) || '')
  const [webhookUrl, setWebhookUrl] = useState((task?.config?.url as string) || '')
  const [saving, setSaving] = useState(false)

  // 当 task 变化时同步状态（用于编辑不同任务）
  useEffect(() => {
    if (!task) return
    setName(task.name)
    setType(task.type)
    setScheduleMode(task.schedule.mode)
    setRunAt(toLocalDatetime(task.schedule.runAt))
    setIntervalMin(task.schedule.intervalMs ? Math.round(task.schedule.intervalMs / 60_000) : 30)
    setCronExpr(task.schedule.cron || '0 9 * * *')
    setMessage((task.config?.message as string) || '')
    setCommand((task.config?.command as string) || '')
    setWebhookUrl((task.config?.url as string) || '')
  }, [task])

  const buildSchedule = (): TaskSchedule => {
    switch (scheduleMode) {
      case 'once':
        return { mode: 'once', runAt: runAt || new Date(Date.now() + 5 * 60_000).toISOString() }
      case 'interval':
        return { mode: 'interval', intervalMs: intervalMin * 60 * 1000 }
      case 'cron':
        return { mode: 'cron', cron: cronExpr }
    }
  }

  const buildConfig = (): Record<string, unknown> => {
    switch (type) {
      case 'chat-message': return { message }
      case 'script': return { command }
      case 'webhook': return { url: webhookUrl, method: 'POST' }
      default: return {}
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)

    const schedule = buildSchedule()
    const config = buildConfig()

    try {
      if (isEdit && task) {
        await fetch(`/api/schedules?id=${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), type, schedule, config }),
        })
      } else {
        await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), type, schedule, config, projectId }),
        })
      }
      onSaved()
    } catch (err) {
      console.error(`Failed to ${isEdit ? 'update' : 'create'} task:`, err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 p-4 border border-gray-200/60 dark:border-white/10 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
          {isEdit ? <Pencil size={14} /> : <Plus size={14} />}
          {isEdit ? '编辑定时任务' : '新建定时任务'}
        </div>
        {isEdit && onCancel && (
          <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <X size={14} className="text-[var(--color-text-secondary)]" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">任务名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例: 每日总结"
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">类型</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as TaskType)}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          >
            <option value="chat-message">聊天消息</option>
            <option value="script">脚本命令</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--color-text-secondary)] mb-1">调度方式</label>
        <div className="flex gap-2">
          {(['once', 'interval', 'cron'] as const).map(m => (
            <button
              key={m}
              type="button"
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                scheduleMode === m
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setScheduleMode(m)}
            >
              {m === 'once' ? '单次' : m === 'interval' ? '间隔' : 'Cron'}
            </button>
          ))}
        </div>
      </div>

      {scheduleMode === 'once' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">执行时间</label>
          <input
            type="datetime-local"
            value={runAt}
            onChange={e => setRunAt(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
        </div>
      )}

      {scheduleMode === 'interval' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">间隔（分钟）</label>
          <input
            type="number"
            min={1}
            value={intervalMin}
            onChange={e => setIntervalMin(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
        </div>
      )}

      {scheduleMode === 'cron' && (
        <CronBuilder value={cronExpr} onChange={setCronExpr} />
      )}

      {type === 'chat-message' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">消息内容</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="输入要定时发送的消息..."
            rows={2}
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] resize-none min-w-0"
          />
        </div>
      )}

      {type === 'script' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">命令</label>
          <input
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="bash -c 'echo hello'"
            className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
        </div>
      )}

      {type === 'webhook' && (
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">URL</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
          className="flex-1 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (isEdit ? '保存中...' : '创建中...') : (isEdit ? '保存修改' : '创建任务')}
        </button>
        {isEdit && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            取消
          </button>
        )}
      </div>
    </div>
  )
}
