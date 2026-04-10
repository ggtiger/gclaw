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
          <div key={i} className="h-12 rounded-lg animate-pulse bg-gray-200 dark:bg-white/10" />
        ))}
      </div>
    )
  }

  const tabs: { key: SettingsTab; icon: React.ReactNode; label: string; adminOnly: boolean }[] = [
    { key: 'preferences', icon: <Palette size={14} />, label: '偏好', adminOnly: false },
    { key: 'settings', icon: <SettingsIcon size={14} />, label: '设置', adminOnly: true },
    { key: 'audit', icon: <Shield size={14} />, label: '审计日志', adminOnly: true },
    { key: 'users', icon: <Users size={14} />, label: '用户管理', adminOnly: true },
    { key: 'security', icon: <ShieldAlert size={14} />, label: '安全过滤', adminOnly: true },
  ]

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin)

  return (
    <div>
      {/* Tab 栏 */}
      <div className="flex px-4 pt-3 gap-1">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              activeTab === tab.key
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
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
        <div className="p-4 flex flex-col gap-3">
          {/* API Key */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
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
                className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 pr-10 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer text-gray-400"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="text-xs mt-1 text-gray-400">
              留空则使用环境变量 ANTHROPIC_API_KEY
            </div>
          </div>

          {/* API Base URL */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              API 地址
            </label>
            <input
              type="text"
              value={settings.apiBaseUrl}
              onChange={e => updateField('apiBaseUrl', e.target.value)}
              placeholder="https://api.anthropic.com"
              className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
            />
            <div className="text-xs mt-1 text-gray-400">
              留空使用默认地址，可填写代理地址
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setActiveTab('preferences')}
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
      ) : null}
    </div>
  )
}