'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, Loader, Eye, EyeOff, Image as ImageIcon, X as XIcon, Settings as SettingsIcon, Shield, Users, ShieldAlert, User, Upload } from 'lucide-react'
import type { AppSettings } from '@/types/skills'
import { AuditLogPanel } from './AuditLogPanel'
import { UsersPanel } from './UsersPanel'
import { SecurityPanel } from './SecurityPanel'
import { AccountPanel } from './AccountPanel'
import { useToast } from '@/components/ui/Toast'

type SettingsTab = 'settings' | 'account' | 'audit' | 'users' | 'security'

interface SettingsPanelProps {
  projectId: string
  backgroundImage?: string
  onBackgroundChange?: (url: string) => void
  initialTab?: SettingsTab
}

export function SettingsPanel({ projectId, backgroundImage, onBackgroundChange, initialTab }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  // apiKey 掩码/实际值切换
  // API 从后端返回的 apiKey 是掩码格式 (****xxxx)
  // 用户编辑时记录实际值，未编辑时保持掩码
  const [apiKeyEditing, setApiKeyEditing] = useState(false)
  const [apiKeyRawValue, setApiKeyRawValue] = useState('')
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'settings')
  const [uploadingBg, setUploadingBg] = useState(false)
  const bgFileInputRef = useRef<HTMLInputElement>(null)

  const { toast } = useToast()

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      // API 返回掩码 apiKey，保存用于显示
      // 如果有完整 key（仅首次输入时），存储原始值
      if (data.apiKey && !data.apiKey.startsWith('****')) {
        setApiKeyRawValue(data.apiKey)
      }
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

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
    } catch (err) {
      console.error('Failed to save settings:', err)
      toast('保存设置失败', 'error')
    } finally {
      setSaving(false)
    }
  }, [settings, dirty, apiKeyRawValue])

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast('不支持的文件类型，仅支持 JPG、PNG、WebP', 'error')
      return
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast('文件大小超过限制（最大 10MB）', 'error')
      return
    }

    setUploadingBg(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/background', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.url) {
        onBackgroundChange?.(data.url)
        toast('背景图上传成功', 'success')
      } else {
        toast(data.error || '上传失败', 'error')
      }
    } catch (err) {
      console.error('上传背景图失败:', err)
      toast('上传失败', 'error')
    } finally {
      setUploadingBg(false)
      // 清空 input 以便可以重复选择同一文件
      if (bgFileInputRef.current) {
        bgFileInputRef.current.value = ''
      }
    }
  }

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
    <div className="space-y-0">
      {/* Tab 栏 */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => setActiveTab('settings')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors"
          style={{
            borderBottomColor: activeTab === 'settings' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'settings' ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <SettingsIcon size={14} />
          设置
        </button>
        <button
          onClick={() => setActiveTab('account')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors"
          style={{
            borderBottomColor: activeTab === 'account' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'account' ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <User size={14} />
          账户
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors"
          style={{
            borderBottomColor: activeTab === 'audit' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'audit' ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <Shield size={14} />
          审计日志
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors"
          style={{
            borderBottomColor: activeTab === 'users' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'users' ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <Users size={14} />
          用户管理
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors"
          style={{
            borderBottomColor: activeTab === 'security' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'security' ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <ShieldAlert size={14} />
          安全过滤
        </button>
      </div>

      {/* Tab 内容 */}
      {activeTab === 'account'? (
        <AccountPanel />
      ) : activeTab === 'audit'? (
        <AuditLogPanel />
      ) : activeTab === 'users'? (
        <UsersPanel />
      ) : activeTab === 'security'? (
        <SecurityPanel />
      ) : (
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

      {/* 背景图片 */}
      <div className="p-4 rounded-2xl bg-white/10 dark:bg-slate-800/20 backdrop-blur-md border border-white/20 space-y-3">
        <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          <div className="flex items-center gap-1.5">
            <ImageIcon size={13} />
            自定义背景
          </div>
        </label>

        {/* 预览区域 */}
        {backgroundImage ? (
          <div className="relative rounded-xl overflow-hidden h-24 border border-white/20">
            <img
              src={backgroundImage}
              alt="背景预览"
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => onBackgroundChange?.('')}
              className="absolute top-2 right-2 p-1.5 rounded-full cursor-pointer transition-all duration-200 hover:bg-black/70"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
              title="移除背景"
            >
              <XIcon size={14} />
            </button>
          </div>
        ) : (
          <div className="h-24 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>暂无背景</span>
          </div>
        )}

        {/* 上传按钮 */}
        <button
          onClick={() => !uploadingBg && bgFileInputRef.current?.click()}
          disabled={uploadingBg}
          className="w-full rounded-xl border-2 border-dashed border-white/20 hover:border-purple-400/50 p-4 text-center cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          {uploadingBg ? (
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>上传中...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload size={20} style={{ color: 'var(--color-primary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>点击上传背景图</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>JPG / PNG / WebP，最大 10MB</span>
            </div>
          )}
        </button>

        {/* 隐藏的文件输入 */}
        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleBackgroundUpload}
          disabled={uploadingBg}
        />

        {/* 分隔线 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>或输入 URL</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>

        {/* URL 输入 */}
        <input
          type="text"
          value={backgroundImage || ''}
          onChange={e => onBackgroundChange?.(e.target.value)}
          placeholder="输入图片 URL"
          className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all duration-200 focus:border-purple-400/50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />

        <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          支持 JPG、PNG、WebP 格式图片
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
      )}
    </div>
  )
}
