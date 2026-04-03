'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, AlertTriangle, Trash2, RefreshCw, Plus } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface SecurityConfig {
  sensitiveWords: string[]
  retentionDays: number
}

export function SecurityPanel() {
  const { toast } = useToast()
  const [config, setConfig] = useState<SecurityConfig>({ sensitiveWords: [], retentionDays: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [newWord, setNewWord] = useState('')

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/security')
      const data = await res.json()
      setConfig(data.security || { sensitiveWords: [], retentionDays: 0 })
    } catch {
      console.error('加载安全配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      setDirty(false)
    } catch {
      toast('保存安全配置失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addWord = () => {
    if (!newWord.trim()) return
    // 验证是否为有效正则
    try {
      new RegExp(newWord.trim())
    } catch {
      toast('无效的正则表达式', 'error')
      return
    }
    if (config.sensitiveWords.includes(newWord.trim())) return
    setConfig(prev => ({
      ...prev,
      sensitiveWords: [...prev.sensitiveWords, newWord.trim()],
    }))
    setNewWord('')
    setDirty(true)
  }

  const removeWord = (word: string) => {
    setConfig(prev => ({
      ...prev,
      sensitiveWords: prev.sensitiveWords.filter(w => w !== word),
    }))
    setDirty(true)
  }

  const handleCleanup = async () => {
    const projectId = prompt('输入要清理的项目 ID:')
    if (!projectId) return
    try {
      const res = await fetch('/api/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, executeCleanup: true, projectId }),
      })
      const data = await res.json()
      toast(`清理完成: 删除了 ${data.cleaned} 条过期消息，保留了 ${data.kept} 条`, 'success')
    } catch {
      toast('清理失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 敏感词列表 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Shield size={14} style={{ color: 'var(--color-primary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>敏感词过滤</span>
        </div>
        <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          支持正则表达式匹配，发送消息时检测到敏感词将提示用户
        </div>

        {/* 添加敏感词 */}
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newWord}
            onChange={e => setNewWord(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWord() } }}
            placeholder="输入正则表达式， 如: 密码|password|secret"
            className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
          <button
            onClick={addWord}
            disabled={!newWord.trim()}
            className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-40"
            style={{
              backgroundColor: newWord.trim() ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
              color: newWord.trim() ? 'white' : 'var(--color-text-muted)',
            }}
          >
            <Plus size={14} />
            添加
          </button>
        </div>

        {/* 已有敏感词 */}
        <div className="flex flex-wrap gap-1.5">
          {config.sensitiveWords.length === 0 && (
            <div className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>
              暂无敏感词规则
            </div>
          )}
          {config.sensitiveWords.map(word => (
            <span
              key={word}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono group cursor-pointer"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
                color: 'var(--color-error)',
              }}
            >
              <span className="truncate max-w-[200px]">{word}</span>
              <button
                onClick={() => removeWord(word)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 对话保留策略 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>对话保留策略</span>
        </div>
        <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          设置对话消息的保留天数，超过期限的消息将在清理时被删除
        </div>
        <div className="flex gap-2">
          {[
            { label: '永久', value: 0 },
            { label: '7 天', value: 7 },
            { label: '30 天', value: 30 },
            { label: '90 天', value: 90 },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => { setConfig(prev => ({ ...prev, retentionDays: opt.value })); setDirty(true) }}
              className="flex-1 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
              style={{
                borderColor: config.retentionDays === opt.value ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: config.retentionDays === opt.value ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-bg)',
                color: config.retentionDays === opt.value ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 清理按钮 */}
        {config.retentionDays > 0 && (
          <button
            onClick={handleCleanup}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
              color: 'var(--color-warning)',
            }}
          >
            <RefreshCw size={12} />
            立即清理过期消息
          </button>
        )}
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: dirty ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
          color: dirty ? 'white' : 'var(--color-text-muted)',
        }}
      >
        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Shield size={16} />}
        {saving ? '保存中...' : '保存安全配置'}
      </button>
    </div>
  )
}
