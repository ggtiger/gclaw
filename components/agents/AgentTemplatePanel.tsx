'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Plus, Trash2, Download, RefreshCw, Search,
} from 'lucide-react'
import type { AgentTemplate } from '@/types/skills'

const MODEL_LABELS: Record<string, string> = {
  inherit: '继承',
  sonnet: 'Sonnet',
  opus: 'Opus',
  haiku: 'Haiku',
}

const MODEL_OPTIONS = [
  { value: 'inherit', label: '继承主模型' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
] as const

const EMPTY_DRAFT: Omit<AgentTemplate, 'id' | 'isBuiltIn' | 'createdAt'> = {
  name: '',
  description: '',
  prompt: '',
  model: 'inherit',
  tools: [],
  disallowedTools: [],
  category: '',
}

interface AgentTemplatePanelProps {
  projectId?: string
  onImport?: (template: AgentTemplate) => void
}

export function AgentTemplatePanel({ projectId, onImport }: AgentTemplatePanelProps) {
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agent-templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const handleCreate = useCallback(async () => {
    if (!draft.name.trim() || !draft.prompt.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/agent-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (res.ok) {
        setCreating(false)
        setDraft(EMPTY_DRAFT)
        await fetchTemplates()
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }, [draft, fetchTemplates])

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/agent-templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await fetchTemplates()
  }, [fetchTemplates])

  // 分类列表
  const categories = Array.from(new Set(templates.map(t => t.category).filter(Boolean)))

  // 过滤
  const filtered = templates.filter(t => {
    if (categoryFilter && t.category !== categoryFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)
    }
    return true
  })

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* 搜索 + 过滤 */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative min-w-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索模板..."
            className="w-full pl-8 pr-2 py-1.5 rounded-lg text-xs border outline-none min-w-0 focus:border-purple-500 transition-colors"
            style={inputStyle}
          />
        </div>
        <button
          onClick={fetchTemplates}
          className="p-1.5 rounded-lg border transition-colors cursor-pointer"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          title="刷新"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => { setCreating(!creating); setDraft(EMPTY_DRAFT) }}
          className="p-1.5 rounded-lg border transition-colors cursor-pointer"
          style={{
            borderColor: creating ? 'var(--color-primary)' : 'var(--color-border)',
            color: creating ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          }}
          title="新建模板"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 分类过滤 */}
      {categories.length > 0 && (
        <div className="flex gap-1 mb-3 flex-wrap">
          <button
            onClick={() => setCategoryFilter('')}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors cursor-pointer ${
              !categoryFilter
                ? 'bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-300'
                : 'border-white/50 dark:border-white/[0.06] text-slate-600 dark:text-slate-400'
            }`}
          >
            全部
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat!)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors cursor-pointer ${
                cat === categoryFilter
                  ? 'bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-300'
                  : 'border-white/50 dark:border-white/[0.06] text-slate-600 dark:text-slate-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 创建表单 */}
      {creating && (
        <div className="mb-3 p-3 rounded-lg border space-y-2" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="模板名称"
            className="w-full px-2.5 py-1.5 rounded border text-sm outline-none min-w-0 focus:border-purple-500 transition-colors"
            style={inputStyle}
          />
          <input
            value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            placeholder="描述"
            className="w-full px-2.5 py-1.5 rounded border text-sm outline-none min-w-0 focus:border-purple-500 transition-colors"
            style={inputStyle}
          />
          <textarea
            value={draft.prompt}
            onChange={e => setDraft({ ...draft, prompt: e.target.value })}
            placeholder="系统提示 *"
            rows={3}
            className="w-full px-2.5 py-1.5 rounded border text-sm outline-none resize-y focus:border-purple-500 transition-colors"
            style={inputStyle}
          />
          <div className="flex gap-2">
            <select
              value={draft.model}
              onChange={e => setDraft({ ...draft, model: e.target.value as AgentTemplate['model'] })}
              className="flex-1 px-2.5 py-1.5 rounded border text-sm outline-none cursor-pointer min-w-0 focus:border-purple-500"
              style={inputStyle}
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              value={draft.category}
              onChange={e => setDraft({ ...draft, category: e.target.value })}
              placeholder="分类"
              className="flex-1 px-2.5 py-1.5 rounded border text-sm outline-none min-w-0 focus:border-purple-500 transition-colors"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !draft.name.trim() || !draft.prompt.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            >
              <Plus size={14} />
              {saving ? '创建中...' : '创建'}
            </button>
            <button
              onClick={() => { setCreating(false); setDraft(EMPTY_DRAFT) }}
              className="px-3 py-1.5 rounded text-sm cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 模板列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          暂无模板
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <div
              key={t.id}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              <div className="flex items-center gap-2">
                <Bot size={16} style={{ color: 'var(--color-primary)' }} />
                <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--color-text)' }}>{t.name}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}
                >
                  {MODEL_LABELS[t.model] || t.model}
                </span>
                {t.isBuiltIn && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">内置</span>
                )}
              </div>
              {t.description && (
                <div className="mt-1 text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{t.description}</div>
              )}
              <div className="flex items-center gap-2 mt-2">
                {onImport && projectId && (
                  <button
                    onClick={() => onImport(t)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <Download size={12} />
                    导入到项目
                  </button>
                )}
                <div className="flex-1" />
                {!t.isBuiltIn && (
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                    style={{ color: 'var(--color-error, #ef4444)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
