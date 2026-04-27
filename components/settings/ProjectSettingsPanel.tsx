'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader, RefreshCw, FolderOpen, Bot, Sparkles, Brain, Wand2, Cpu, MessageSquare, GraduationCap, Stethoscope, Code, Palette, Music, Heart, Upload, X } from 'lucide-react'
import type { ProjectSettings, GlobalSettings, ModelProvider } from '@/types/skills'
import { useToast } from '@/components/ui/Toast'
import { isTauri, selectDirectory, revealInFinder } from '@/lib/tauri'
import { useAssistantIdentity, AVAILABLE_ICONS } from '@/hooks/useAssistantIdentity'
import { useSettingsStore } from '@/lib/store/useSettingsStore'

interface ProjectSettingsPanelProps {
  projectId: string
  onClose?: () => void
}

const ICON_COMPONENTS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bot, Sparkles, Brain, Wand2, Cpu, MessageSquare, GraduationCap, Stethoscope, Code, Palette, Music, Heart,
}

export function ProjectSettingsPanel({ projectId, onClose }: ProjectSettingsPanelProps) {
  const {
    draftProject: settings,
    globalProviders,
    loading,
    saving,
    dirty,
    fetchSettings,
    updateProjectField,
    saveProjectSettings,
    setDirty,
  } = useSettingsStore()

  const updateField = updateProjectField

  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const { toast } = useToast()
  const { Icon: AssistantIcon, avatarUrl } = useAssistantIdentity(settings, projectId)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchSettings(projectId)
  }, [projectId, fetchSettings])

  const fetchModels = useCallback(async (providerId?: string) => {
    setLoadingModels(true)
    try {
      const body: Record<string, string> = {}
      if (providerId) body.providerId = providerId
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
  }, [toast])

  const handleSelectDirectory = useCallback(async () => {
    const selected = await selectDirectory()
    if (selected) {
      updateField('cwd', selected)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await fetch(`/api/settings/avatar?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (data.filename) {
        updateField('assistantAvatar', data.filename)
      } else {
        toast(data.error || '上传失败', 'error')
      }
    } catch {
      toast('上传失败', 'error')
    }
    e.target.value = ''
  }, [projectId, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAvatarRemove = useCallback(() => {
    updateField('assistantAvatar', '')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettingsHandler = useCallback(async () => {
    const result = await saveProjectSettings(projectId)
    if (result.success) {
      toast('项目设置已保存', 'success')
      onClose?.()
    } else if (result.error && result.error !== 'no changes') {
      toast(result.error, 'error')
    }
  }, [projectId, saveProjectSettings, toast, onClose])

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
      {/* 助理设置 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-purple-500/10 dark:bg-purple-500/20 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <AssistantIcon size={14} className="text-purple-600 dark:text-purple-400" />
            )}
          </div>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            助理设置
          </label>
        </div>
        <div className="space-y-2">
          {/* 名称 */}
          <input
            type="text"
            value={settings.assistantName || ''}
            onChange={e => updateField('assistantName', e.target.value || '')}
            placeholder="AI助理"
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
          {/* 头像上传 + 预览 */}
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-white/5 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <AssistantIcon size={20} className="text-purple-600 dark:text-purple-400" />
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors cursor-pointer text-gray-600 dark:text-gray-300"
            >
              <Upload size={12} />
              上传头像
            </button>
            {settings.assistantAvatar && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                title="移除头像"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {/* 图标选择器（仅无自定义头像时生效） */}
          {!settings.assistantAvatar && (
            <div className="grid grid-cols-6 gap-1">
              {AVAILABLE_ICONS.map(name => {
                const Comp = ICON_COMPONENTS[name]
                const selected = (settings.assistantIcon || 'Bot') === name
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => updateField('assistantIcon', name)}
                    className={`flex items-center justify-center p-1.5 rounded-lg cursor-pointer transition-colors ${
                      selected
                        ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                        : 'bg-gray-50 dark:bg-white/5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                    title={name}
                  >
                    <Comp size={16} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Provider */}
      {globalProviders.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            供应商
          </label>
          <select
            value={settings.providerId || ''}
            onChange={e => {
              updateField('providerId', e.target.value)
              // 切换供应商后重新获取模型列表
              if (e.target.value) {
                fetchModels(e.target.value)
              }
            }}
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          >
            <option value="">跟随全局</option>
            {globalProviders.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="text-xs mt-1 text-gray-400">
            留空跟随全局活跃供应商
          </div>
        </div>
      )}

      {/* Model */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            模型
          </label>
          <button
            type="button"
            onClick={() => fetchModels(settings.providerId || undefined)}
            disabled={loadingModels}
            className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
            {models.length > 0 ? '刷新模型' : '获取模型列表'}
          </button>
        </div>
        {models.length > 0 ? (
          <select
            value={settings.model || ''}
            onChange={e => updateField('model', e.target.value)}
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          >
            <option value="">使用全局默认模型</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={settings.model}
            onChange={e => updateField('model', e.target.value)}
            placeholder="使用全局默认模型"
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
        )}
        <div className="text-xs mt-1 text-gray-400">
          留空使用全局默认项目模型
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
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={settings.cwd}
            onChange={e => updateField('cwd', e.target.value)}
            placeholder="默认当前目录"
            className="flex-1 min-w-0 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
          {isTauri() && (
            <>
              <button
                type="button"
                onClick={handleSelectDirectory}
                className="shrink-0 p-1.5 rounded-lg bg-gray-100 dark:bg-white/10 cursor-pointer hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                title="选择本地目录"
              >
                <FolderOpen size={14} className="text-gray-500 dark:text-gray-400" />
              </button>
              {settings.cwd && (
                <button
                  type="button"
                  onClick={() => revealInFinder(settings.cwd).catch(() => {})}
                  className="shrink-0 p-1.5 rounded-lg bg-gray-100 dark:bg-white/10 cursor-pointer hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                  title="打开目录所在位置"
                >
                  <RefreshCw size={14} className="text-gray-500 dark:text-gray-400" style={{ transform: 'rotate(-45deg)' }} />
                </button>
              )}
            </>
          )}
        </div>
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

      {/* Footer - sticky 底部 */}
      <div className="sticky bottom-0 flex justify-end gap-2 py-2 -mx-4 px-4 -mb-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          取消
        </button>
        <button
          onClick={saveSettingsHandler}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
