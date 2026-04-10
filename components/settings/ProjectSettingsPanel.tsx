'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader } from 'lucide-react'
import type { ProjectSettings } from '@/types/skills'
import { useToast } from '@/components/ui/Toast'

interface ProjectSettingsPanelProps {
  projectId: string
  onClose?: () => void
}

export function ProjectSettingsPanel({ projectId, onClose }: ProjectSettingsPanelProps) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const { toast } = useToast()

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setSettings({
        model: data.model || '',
        effort: data.effort || 'medium',
        sessionId: data.sessionId || '',
        cwd: data.cwd || '',
        dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? true,
        systemPrompt: data.systemPrompt || '',
      })
    } catch (err) {
      console.error('Failed to load project settings:', err)
      toast('加载项目设置失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateField = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setDirty(true)
  }

  const saveSettings = useCallback(async () => {
    if (!settings || !dirty) return
    setSaving(true)
    try {
      await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setDirty(false)
      toast('项目设置已保存', 'success')
      onClose?.()
    } catch (err) {
      console.error('Failed to save project settings:', err)
      toast('保存项目设置失败', 'error')
    } finally {
      setSaving(false)
    }
  }, [settings, dirty, projectId, toast, onClose])

  if (loading || !settings) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-12 rounded-lg animate-pulse bg-gray-200 dark:bg-white/10" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Model */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          模型
        </label>
        <input
          type="text"
          value={settings.model}
          onChange={e => updateField('model', e.target.value)}
          placeholder="默认 (claude-sonnet-4-20250514)"
          className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
        />
        <div className="text-xs mt-1 text-gray-400">
          留空使用默认模型
        </div>
      </div>

      {/* Effort */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          推理强度
        </label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map(level => (
            <button
              key={level}
              onClick={() => updateField('effort', level)}
              className={`flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                settings.effort === level
                  ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'
              }`}
            >
              {{ low: '低', medium: '中', high: '高' }[level]}
            </button>
          ))}
        </div>
      </div>

      {/* CWD */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          工作目录
        </label>
        <input
          type="text"
          value={settings.cwd}
          onChange={e => updateField('cwd', e.target.value)}
          placeholder="默认当前目录"
          className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
        />
        <div className="text-xs mt-1 text-gray-400">
          Claude 工作目录，默认为项目目录
        </div>
      </div>

      {/* System Prompt */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          系统提示词 (Soul)
        </label>
        <textarea
          value={settings.systemPrompt}
          onChange={e => updateField('systemPrompt', e.target.value)}
          placeholder="每次会话自动注入的持久化指令..."
          rows={4}
          className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none resize-y"
          style={{ minHeight: '80px', maxHeight: '150px' }}
        />
        <div className="text-xs mt-1 text-gray-400">
          写入项目 CLAUDE.md，SDK 每次会话自动加载
        </div>
      </div>

      {/* Session ID */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          Session ID
        </label>
        <input
          type="text"
          value={settings.sessionId}
          onChange={e => updateField('sessionId', e.target.value)}
          placeholder="自动生成"
          className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
        />
        <div className="text-xs mt-1 text-gray-400">
          留空则每次新建会话
        </div>
      </div>

      {/* Skip Permissions */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-900 dark:text-white">
            跳过权限确认
          </div>
          <div className="text-xs text-gray-400">
            dangerouslySkipPermissions
          </div>
        </div>
        <button
          onClick={() => updateField('dangerouslySkipPermissions', !settings.dangerouslySkipPermissions)}
          className="relative w-10 h-5 rounded-full transition-colors cursor-pointer"
          style={{
            backgroundColor: settings.dangerouslySkipPermissions ? '#f97316' : 'rgba(148, 163, 184, 0.3)',
          }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{
              transform: settings.dangerouslySkipPermissions ? 'translateX(2px)' : 'translateX(-18px)',
            }}
          />
        </button>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          取消
        </button>
        <button
          onClick={saveSettings}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}