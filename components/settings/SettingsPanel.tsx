'use client'

import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff, Settings as SettingsIcon, Shield, Users, ShieldAlert, Palette, Zap, Terminal, Info, RefreshCw, FileText, Code2, Plus, Trash2, Check, Server, Pencil } from 'lucide-react'
import type { GlobalSettings, ModelProvider } from '@/types/skills'
import { AuditLogPanel } from './AuditLogPanel'
import { LogsPanel } from './LogsPanel'
import { UsersPanel } from './UsersPanel'
import { SecurityPanel } from './SecurityPanel'
import { PreferencesPanel } from './PreferencesPanel'
import { DefaultSkillsPanel } from './DefaultSkillsPanel'
import { AboutPanel } from './AboutPanel'
import { PromptsPanel } from './PromptsPanel'
import { DevModePanel } from '../dev-mode/DevModePanel'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'

type SettingsTab = 'preferences' | 'settings' | 'defaultSkills' | 'prompts' | 'devMode' | 'audit' | 'logs' | 'users' | 'security' | 'about'

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
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

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
        assistantModel: data.assistantModel || '',
        defaultModel: data.defaultModel || 'claude-sonnet-4-20250514',
        defaultSystemPrompt: data.defaultSystemPrompt ?? '',
        devRepoUrl: data.devRepoUrl || '',
        providers: data.providers || [],
        activeProviderId: data.activeProviderId || '',
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

  const fetchModels = useCallback(async (providerId?: string) => {
    if (!settings) return
    setLoadingModels(true)
    try {
      const body: Record<string, string> = {}
      const pid = providerId || settings.activeProviderId
      if (pid) {
        // 从本地状态查找供应商凭据
        const provider = (settings.providers || []).find(p => p.id === pid)
        if (provider) {
          if (provider.apiKey.startsWith('****')) {
            // 已保存的供应商，apiKey 脱敏，需要服务端从磁盘读取
            body.providerId = pid
          } else {
            // 新增未保存的供应商，apiKey 是明文，直接传凭据
            body.apiBaseUrl = provider.baseUrl
            body.apiKey = provider.apiKey
            body.providerType = provider.type
          }
        } else {
          body.providerId = pid
        }
      } else {
        if (apiKeyRawValue) body.apiKey = apiKeyRawValue
        if (settings.apiBaseUrl) body.apiBaseUrl = settings.apiBaseUrl
      }
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.models) {
        setModels(data.models)
      } else {
        toast(data.error || '获取模型列表失败', 'error')
      }
    } catch {
      toast('获取模型列表失败', 'error')
    } finally {
      setLoadingModels(false)
    }
  }, [settings, apiKeyRawValue, toast])

  const saveSettings = useCallback(async () => {
    if (!settings || !dirty) return
    if (!settings.assistantModel?.trim()) {
      toast('辅助模型不能为空，请选择或填写模型名称', 'error')
      return
    }
    if (!settings.defaultModel?.trim()) {
      toast('默认项目模型不能为空，请选择或填写模型名称', 'error')
      return
    }
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
    { key: 'defaultSkills', icon: <Zap size={14} />, label: '默认技能', adminOnly: true },
    { key: 'settings', icon: <SettingsIcon size={14} />, label: '模型设置', adminOnly: true },
    { key: 'prompts', icon: <FileText size={14} />, label: '提示词', adminOnly: true },
    { key: 'devMode', icon: <Code2 size={14} />, label: '开发模式', adminOnly: true },
    { key: 'audit', icon: <Shield size={14} />, label: '审计日志', adminOnly: true },
    { key: 'logs', icon: <Terminal size={14} />, label: '运行日志', adminOnly: true },
    { key: 'users', icon: <Users size={14} />, label: '用户管理', adminOnly: true },
    { key: 'security', icon: <ShieldAlert size={14} />, label: '安全过滤', adminOnly: true },
    { key: 'about', icon: <Info size={14} />, label: '关于', adminOnly: false },
  ]

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin)

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧 Tab 侧边栏 - 固定不滚动 */}
      <div className="flex flex-col w-36 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-black/20 py-2 px-2">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-3 rounded-lg text-xs font-medium cursor-pointer transition-colors text-left ${
              activeTab === tab.key
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'preferences' ? (
          <PreferencesPanel backgroundImage={backgroundImage} onBackgroundChange={onBackgroundChange} />
        ) : activeTab === 'defaultSkills' ? (
          <DefaultSkillsPanel />
        ) : activeTab === 'prompts' ? (
          <PromptsPanel />
        ) : activeTab === 'audit' ? (
          <AuditLogPanel />
        ) : activeTab === 'logs' ? (
          <LogsPanel />
        ) : activeTab === 'users' ? (
          <UsersPanel />
        ) : activeTab === 'security' ? (
          <SecurityPanel />
        ) : activeTab === 'about' ? (
          <AboutPanel />
        ) : activeTab === 'devMode' ? (
          <DevModePanel />
        ) : activeTab === 'settings' ? (
          <SettingsTabContent
            settings={settings}
            apiKeyRawValue={apiKeyRawValue}
            showApiKey={showApiKey}
            models={models}
            loadingModels={loadingModels}
            dirty={dirty}
            saving={saving}
            setApiKeyRawValue={setApiKeyRawValue}
            setShowApiKey={setShowApiKey}
            updateField={updateField}
            fetchModels={fetchModels}
            saveSettings={saveSettings}
            setActiveTab={setActiveTab}
            toast={toast}
          />
        ) : null}
      </div>
    </div>
  )
}

// ── 设置 Tab 内容（含供应商管理） ──

interface SettingsTabContentProps {
  settings: GlobalSettings
  apiKeyRawValue: string
  showApiKey: boolean
  models: { id: string; name: string }[]
  loadingModels: boolean
  dirty: boolean
  saving: boolean
  setApiKeyRawValue: (v: string) => void
  setShowApiKey: (v: boolean) => void
  updateField: <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => void
  fetchModels: (providerId?: string) => void
  saveSettings: () => void
  setActiveTab: (tab: SettingsTab) => void
  toast: (msg: string, type: 'success' | 'error') => void
}

function SettingsTabContent({
  settings,
  apiKeyRawValue: _apiKeyRawValue,
  showApiKey,
  models,
  loadingModels,
  dirty,
  saving,
  setApiKeyRawValue,
  setShowApiKey,
  updateField,
  fetchModels,
  saveSettings,
  setActiveTab,
  toast,
}: SettingsTabContentProps) {
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState({
    name: '',
    type: 'anthropic' as 'anthropic' | 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
  })
  const [showProviderApiKey, setShowProviderApiKey] = useState<Record<string, boolean>>({})
  const [providerModels, setProviderModels] = useState<{ id: string; name: string }[]>([])
  const [loadingProviderModels, setLoadingProviderModels] = useState(false)

  const hasActiveProvider = !!settings.activeProviderId

  const providers = settings.providers || []

  const resetProviderForm = () => {
    setProviderForm({ name: '', type: 'anthropic', baseUrl: '', apiKey: '', model: '' })
    setEditingProviderId(null)
    setShowAddProvider(false)
    setProviderModels([])
  }

  const handleStartEdit = (p: ModelProvider) => {
    setEditingProviderId(p.id)
    setShowAddProvider(false)
    setProviderForm({ name: p.name, type: p.type, baseUrl: p.baseUrl, apiKey: '', model: p.model || '' })
  }

  const handleSaveProvider = () => {
    if (!providerForm.name.trim()) {
      toast('请填写供应商名称', 'error')
      return
    }
    if (!providerForm.baseUrl.trim()) {
      toast('请填写 Base URL', 'error')
      return
    }

    if (editingProviderId) {
      // 编辑模式：更新已有供应商
      const updated = providers.map(p =>
        p.id === editingProviderId
          ? {
              ...p,
              name: providerForm.name.trim(),
              type: providerForm.type,
              baseUrl: providerForm.baseUrl.trim(),
              apiKey: providerForm.apiKey.trim() || p.apiKey,
              model: providerForm.model.trim(),
            }
          : p
      )
      updateField('providers', updated)
    } else {
      // 添加模式
      const id = crypto.randomUUID()
      const updated = [
        ...providers,
        { id, name: providerForm.name.trim(), type: providerForm.type, baseUrl: providerForm.baseUrl.trim(), apiKey: providerForm.apiKey.trim(), model: providerForm.model.trim() },
      ]
      updateField('providers', updated)
    }
    resetProviderForm()
  }

  const handleDeleteProvider = (id: string) => {
    const updated = providers.filter(p => p.id !== id)
    updateField('providers', updated)
    if (settings.activeProviderId === id) {
      updateField('activeProviderId', '')
    }
  }

  const handleSetActive = (id: string) => {
    updateField('activeProviderId', settings.activeProviderId === id ? '' : id)
    // 切换活跃供应商后刷新模型列表
    fetchModels(id)
  }

  const fetchProviderModels = async () => {
    if (!providerForm.baseUrl.trim()) {
      toast('请先填写 Base URL', 'error')
      return
    }
    setLoadingProviderModels(true)
    try {
      const body: Record<string, string> = {
        apiBaseUrl: providerForm.baseUrl.trim(),
        providerType: providerForm.type,
      }
      if (providerForm.apiKey.trim()) {
        body.apiKey = providerForm.apiKey.trim()
      }
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.models) {
        setProviderModels(data.models)
      } else {
        toast(data.error || '获取模型列表失败', 'error')
      }
    } catch {
      toast('获取模型列表失败', 'error')
    } finally {
      setLoadingProviderModels(false)
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* ── 模型供应商 ── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Server size={12} />
            模型供应商
          </label>
          {!showAddProvider && !editingProviderId && (
            <button
              type="button"
              onClick={() => { setShowAddProvider(true); setEditingProviderId(null) }}
              className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
            >
              <Plus size={12} />
              添加供应商
            </button>
          )}
        </div>

        {/* 供应商列表 */}
        {providers.length > 0 ? (
          <div className="flex flex-col gap-2 mb-2">
            {providers.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  settings.activeProviderId === p.id
                    ? 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {p.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      p.type === 'openai-compatible'
                        ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                        : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                    }`}>
                      {p.type === 'openai-compatible' ? 'OpenAI' : 'Anthropic'}
                    </span>
                    {settings.activeProviderId === p.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
                        活跃
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate mt-0.5">{p.baseUrl}{p.model ? ` · ${p.model}` : ''}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSetActive(p.id)}
                    className={`p-1 rounded cursor-pointer transition-colors ${
                      settings.activeProviderId === p.id
                        ? 'text-purple-500'
                        : 'text-gray-400 hover:text-purple-500'
                    }`}
                    title={settings.activeProviderId === p.id ? '取消活跃' : '设为活跃'}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(p)}
                    className="p-1 rounded cursor-pointer text-gray-400 hover:text-blue-500 transition-colors"
                    title="编辑"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProvider(p.id)}
                    className="p-1 rounded cursor-pointer text-gray-400 hover:text-red-500 transition-colors"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400 mb-2">
            暂无供应商，添加供应商可快速切换 API 配置
          </div>
        )}

        {/* 添加/编辑供应商表单 */}
        {(showAddProvider || editingProviderId) && (
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 space-y-2">
            <input
              type="text"
              value={providerForm.name}
              onChange={e => setProviderForm({ ...providerForm, name: e.target.value })}
              placeholder="名称，如 Anthropic、本地 LiteLLM"
              className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
            />
            <select
              value={providerForm.type}
              onChange={e => setProviderForm({ ...providerForm, type: e.target.value as 'anthropic' | 'openai-compatible' })}
              className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
            >
              <option value="anthropic">Anthropic 兼容</option>
              <option value="openai-compatible">OpenAI 兼容</option>
            </select>
            <input
              type="text"
              value={providerForm.baseUrl}
              onChange={e => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
              placeholder="Base URL，如 https://api.anthropic.com"
              className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
            />
            <div className="relative">
              <input
                type={showProviderApiKey['form'] ? 'text' : 'password'}
                value={providerForm.apiKey}
                onChange={e => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                placeholder={editingProviderId ? '留空保持原 Key 不变' : 'API Key'}
                className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 pr-8 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowProviderApiKey({ ...showProviderApiKey, form: !showProviderApiKey['form'] })}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-pointer text-gray-400"
              >
                {showProviderApiKey['form'] ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {providerForm.type === 'openai-compatible' && (
              <div>
                <div className="flex items-center justify-end mb-1">
                  <button
                    type="button"
                    onClick={fetchProviderModels}
                    disabled={loadingProviderModels}
                    className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={loadingProviderModels ? 'animate-spin' : ''} />
                    {providerModels.length > 0 ? '刷新' : '获取模型列表'}
                  </button>
                </div>
                {providerModels.length > 0 ? (
                  <select
                    value={providerForm.model}
                    onChange={e => setProviderForm({ ...providerForm, model: e.target.value })}
                    className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
                  >
                    <option value="" disabled>选择模型</option>
                    {providerModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={providerForm.model}
                    onChange={e => setProviderForm({ ...providerForm, model: e.target.value })}
                    placeholder="模型名，如 qwen-plus、deepseek-chat（必填）"
                    className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
                  />
                )}
              </div>
            )}
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={resetProviderForm}
                className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveProvider}
                className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
              >
                {editingProviderId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Key */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          API Key
        </label>
        {hasActiveProvider ? (
          <div className="text-xs text-gray-400 py-1">
            由活跃供应商配置管理
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* API Base URL */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          API 地址
        </label>
        {hasActiveProvider ? (
          <div className="text-xs text-gray-400 py-1">
            由活跃供应商配置管理
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* 默认项目模型 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            默认项目模型 <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => fetchModels()}
            disabled={loadingModels}
            className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
            {models.length > 0 ? '刷新模型' : '获取模型列表'}
          </button>
        </div>
        {models.length > 0 ? (
          <select
            value={settings.defaultModel || ''}
            onChange={e => updateField('defaultModel', e.target.value)}
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          >
            <option value="" disabled>请选择模型</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={settings.defaultModel || ''}
            onChange={e => updateField('defaultModel', e.target.value)}
            placeholder="先填写 API Key 后获取模型列表"
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
        )}
        <div className="text-xs mt-1 text-gray-400">
          新建项目时自动使用此模型，项目模型留空时也会回退到此值
        </div>
      </div>

      {/* 默认系统提示词 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          默认系统提示词
        </label>
        <textarea
          value={settings.defaultSystemPrompt ?? ''}
          onChange={e => updateField('defaultSystemPrompt', e.target.value)}
          placeholder="所有项目共享的安全约束提示词，留空不注入"
          rows={6}
          className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-2 outline-none resize-y min-h-[80px]"
        />
        <div className="text-xs mt-1 text-gray-400">
          注入所有项目的 CLAUDE.md，用于安全约束（如限制操作目录、禁止危险命令）。留空则使用内置默认值
        </div>
      </div>

      {/* 辅助模型 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            辅助模型 <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => fetchModels()}
            disabled={loadingModels}
            className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
            {models.length > 0 ? '刷新模型' : '获取模型列表'}
          </button>
        </div>
        {models.length > 0 ? (
          <select
            value={settings.assistantModel || ''}
            onChange={e => updateField('assistantModel', e.target.value)}
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          >
            <option value="" disabled>请选择模型</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={settings.assistantModel || ''}
            onChange={e => updateField('assistantModel', e.target.value)}
            placeholder="先填写 API Key 后获取模型列表"
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
        )}
        <div className="text-xs mt-1 text-gray-400">
          用于记忆提取、总纲生成、提示词优化等轻量任务
        </div>
      </div>

      {/* 仓库镜像地址 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          仓库镜像地址
        </label>
        <input
          type="text"
          value={settings.devRepoUrl || ''}
          onChange={e => updateField('devRepoUrl', e.target.value)}
          placeholder="https://gitee.com/ggtiger/gclaw.git"
          className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
        />
        <div className="text-xs mt-1 text-gray-400">
          留空自动使用 GitHub + Gitee 镜像切换，自定义后仅使用指定地址
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
  )
}