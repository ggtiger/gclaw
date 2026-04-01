'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader, Eye, EyeOff } from 'lucide-react'
import type { AppSettings } from '@/types/skills'

export function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setDirty(true)
  }

  const saveSettings = useCallback(async () => {
    if (!settings || !dirty) return
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setDirty(false)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [settings, dirty])

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
      {/* API Key */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          API Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={e => updateField('apiKey', e.target.value)}
            placeholder="sk-ant-..."
            className="w-full px-3 py-2 pr-10 rounded-lg border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          留空则使用环境变量 ANTHROPIC_API_KEY
        </div>
      </div>

      {/* API Base URL */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          API 地址
        </label>
        <input
          type="text"
          value={settings.apiBaseUrl}
          onChange={e => updateField('apiBaseUrl', e.target.value)}
          placeholder="https://api.anthropic.com"
          className="w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          留空使用默认地址，可填写代理地址
        </div>
      </div>

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
                backgroundColor: settings.effort === level ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-bg)',
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
              transform: settings.dangerouslySkipPermissions ? 'translateX(22px)' : 'translateX(2px)',
            }}
          />
        </button>
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
