'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader, Eye, EyeOff, Settings as SettingsIcon, Shield, Users, ShieldAlert, Palette } from 'lucide-react'
import type { GlobalSettings } from '@/types/skills'
import { AuditLogPanel } from './AuditLogPanel'
import { UsersPanel } from './UsersPanel'
import { SecurityPanel } from './SecurityPanel'
import { PreferencesPanel } from './PreferencesPanel'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'

type SettingsTab = 'preferences' | 'settings' | 'audit' | 'users' | 'security'

interface SettingsPanelProps {
  projectId: string
  backgroundImage?: string
  onBackgroundChange?: (url: string) => void
  initialTab?: SettingsTab
}

export function SettingsPanel({ projectId, backgroundImage, onBackgroundChange, initialTab }: SettingsPanelProps) {
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  // apiKey 掩码/实际值切换
  const [apiKeyRawValue, setApiKeyRawValue] = useState('')
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'preferences')

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { toast } = useToast()

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      // 只保留全局级字段
      if (data.apiKey && !data.apiKey.startsWith('****')) {
        setApiKeyRawValue(data.apiKey)
      }
      setSettings({
        apiKey: data.apiKey || '',
        apiBaseUrl: data.apiBaseUrl || '',
        theme: data.theme || 'system',
        security: data.security || { sensitiveWords: [], retentionDays: 0 },
      })
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateField = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setDirty(true)
  }

  const saveSettings = useCallback(async () => {
    if (!settings || !dirty) return
    setSaving(true)
    try {
      // 构建提交数据：apiKey 使用原始值（非掩码）
      const toSave = { ...settings }
      if (apiKeyRawValue && !apiKeyRawValue.startsWith('****')) {
        toSave.apiKey = apiKeyRawValue
      }
      await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      })
      setDirty(false)
      // 保存后重新加载（拿到掩码后的值）
      fetchSettings()
      toast('设置已保存', 'success')
    } catch (err) {
      console.error('Failed to save settings:', err)
      toast('保存设置失败', 'error')
    } finally {
      setSaving(false)
    }
  }, [settings, dirty, apiKeyRawValue, projectId, fetchSettings, toast])

  if (loading || !settings) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  // Tab 配置：所有用户可见偏好，仅管理员可见其他
  const tabs: { key: SettingsTab; icon: React.ReactNode; label: string; adminOnly: boolean }[] = [
    { key: 'preferences', icon: <Palette size={14} />, label: '偏好', adminOnly: false },
    { key: 'settings', icon: <SettingsIcon size={14} />, label: '设置', adminOnly: true },
    { key: 'audit', icon: <Shield size={14} />, label: '审计日志', adminOnly: true },
    { key: 'users', icon: <Users size={14} />, label: '用户管理', adminOnly: true },
    { key: 'security', icon: <ShieldAlert size={14} />, label: '安全过滤', adminOnly: true },
  ]

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin)

  return (
    <div className="space-y-0">
      {/* Tab 栏 */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors"
            style={{
              borderBottomColor: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'preferences' ? (
        <PreferencesPanel backgroundImage={backgroundImage} onBackgroundChange={onBackgroundChange} />
      ) : activeTab === 'audit' ? (
        <AuditLogPanel />
      ) : activeTab === 'users' ? (
        <UsersPanel />
      ) : activeTab === 'security' ? (
        <SecurityPanel />
      ) : activeTab === 'settings' ? (
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
                onChange={e => {
                  const val = e.target.value
                  setApiKeyRawValue(val)
                  updateField('apiKey', val)
                }}
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
      ) : null}
    </div>
  )
}
