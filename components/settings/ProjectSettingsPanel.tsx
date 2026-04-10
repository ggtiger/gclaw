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
      // 只保留项目级字段
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
      // 只提交项目级字段
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
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Model */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          模型
        </label>
        <input
          type="text"
          value={settings.model}
          onChange={e => updateField('model', e.target.value)}
          placeholder="默认 (claude-sonnet-4-20250514)"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          留空使用默认模型
        </div>
      </div>

      {/* Effort */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          推理强度
        </label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map(level => (
            <button
              key={level}
              onClick={() => updateField('effort', level)}
              className="flex-1 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
              style={{
                borderColor: settings.effort === level ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: settings.effort === level ? 'var(--color-primary-10)' : 'var(--color-bg)',
                color: settings.effort === level ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {{ low: '低', medium: '中', high: '高' }[level]}
            </button>
          ))}
        </div>
      </div>

      {/* CWD */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          工作目录
        </label>
        <input
          type="text"
          value={settings.cwd}
          onChange={e => updateField('cwd', e.target.value)}
          placeholder="默认当前目录"
          className="w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Claude 工作目录，默认为项目目录
        </div>
      </div>

      {/* System Prompt (Soul) */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          系统提示词 (Soul)
        </label>
        <textarea
          value={settings.systemPrompt}
          onChange={e => updateField('systemPrompt', e.target.value)}
          placeholder="每次会话自动注入的持久化指令，例如角色设定、行为规范、项目上下文等"
          rows={4}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors resize-y focus:border-[var(--color-primary)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
            minHeight: '80px',
            maxHeight: '200px',
          }}
        />
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          写入项目 CLAUDE.md，SDK 每次会话自动加载
        </div>
      </div>

      {/* Session ID */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          Session ID
        </label>
        <input
          type="text"
          value={settings.sessionId}
          onChange={e => updateField('sessionId', e.target.value)}
          placeholder="自动生成"
          className="w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          留空则每次新建会话
        </div>
      </div>

      {/* Skip Permissions */}
      <div className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm" style={{ color: 'var(--color-text)' }}>
            跳过权限确认
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            dangerouslySkipPermissions
          </div>
        </div>
        <button
          onClick={() => updateField('dangerouslySkipPermissions', !settings.dangerouslySkipPermissions)}
          className="relative w-10 h-5 rounded-full transition-colors cursor-pointer"
          style={{
            backgroundColor: settings.dangerouslySkipPermissions ? 'var(--color-warning)' : 'var(--color-bg-tertiary)',
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

      {/* 保存按钮 */}
      <button
        onClick={saveSettings}
        disabled={!dirty || saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: dirty ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
          color: dirty ? 'white' : 'var(--color-text-muted)',
        }}
      >
        {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? '保存中...' : '保存设置'}
      </button>
    </div>
  )
}