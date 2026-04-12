'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { TaskType, TaskSchedule } from '@/types/schedules'

interface TaskFormProps {
  projectId?: string
  onCreated: () => void
}

export function TaskForm({ projectId, onCreated }: TaskFormProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TaskType>('chat-message')
  const [scheduleMode, setScheduleMode] = useState<'once' | 'interval' | 'cron'>('once')
  const [runAt, setRunAt] = useState('')
  const [intervalMin, setIntervalMin] = useState(30)
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [message, setMessage] = useState('')
  const [command, setCommand] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)

    let schedule: TaskSchedule
    let config: Record<string, unknown> = {}

    switch (scheduleMode) {
      case 'once':
        schedule = { mode: 'once', runAt: runAt || new Date(Date.now() + 5 * 60_000).toISOString() }
        break
      case 'interval':
        schedule = { mode: 'interval', intervalMs: intervalMin * 60 * 1000 }
        break
      case 'cron':
        schedule = { mode: 'cron', cron: cronExpr }
        break
    }

    switch (type) {
      case 'chat-message':
        config = { message }
        break
      case 'script':
        config = { command }
        break
      case 'webhook':
        config = { url: webhookUrl, method: 'POST' }
        break
    }

    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, schedule, config, projectId }),
      })
      if (res.ok) {
        setName('')
        setMessage('')
        setCommand('')
        setWebhookUrl('')
        onCreated()
      }
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 p-4 border border-gray-200/60 dark:border-white/10 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
        <Plus size={14} />
        新建定时任务
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
        <div>
          <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Cron 表达式（分 时 日 月 周）</label>
          <input
            type="text"
            value={cronExpr}
            onChange={e => setCronExpr(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[var(--color-text)] min-w-0"
          />
        </div>
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

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !name.trim()}
        className="w-full py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? '创建中...' : '创建任务'}
      </button>
    </div>
  )
}
