'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Plus, Trash2, ChevronDown, ChevronRight,
  Save, AlertCircle, RefreshCw
} from 'lucide-react'
import type { AgentInfo } from '@/types/skills'

const MODEL_OPTIONS = [
  { value: 'inherit', label: '继承主模型' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
] as const

const EMPTY_AGENT: Omit<AgentInfo, 'enabled'> = {
  name: '',
  description: '',
  prompt: '',
  model: 'inherit',
  tools: [],
  disallowedTools: [],
}

export function AgentsPanel({ projectId }: { projectId: string }) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Omit<AgentInfo, 'enabled'>>(EMPTY_AGENT)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/agents?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setAgents(data.agents || [])
    } catch {
      setError('加载智能体列表失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const toggleEnabled = useCallback(async (name: string, enabled: boolean) => {
    setAgents(prev => prev.map(a => a.name === name ? { ...a, enabled } : a))
    try {
      await fetch(`/api/agents?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, enabled }),
      })
    } catch {
      setAgents(prev => prev.map(a => a.name === name ? { ...a, enabled: !enabled } : a))
    }
  }, [projectId])

  const createAgent = useCallback(async () => {
    if (!draft.name.trim() || !draft.prompt.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || '创建失败')
        return
      }
      setCreating(false)
      setDraft(EMPTY_AGENT)
      await fetchAgents()
    } catch {
      setError('创建失败')
    } finally {
      setSaving(false)
    }
  }, [draft, fetchAgents, projectId])

  const updateAgent = useCallback(async (agent: AgentInfo) => {
    setSaving(true)
    try {
      await fetch(`/api/agents?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      })
      setAgents(prev => prev.map(a => a.name === agent.name ? agent : a))
    } catch {
      setError('更新失败')
    } finally {
      setSaving(false)
    }
  }, [projectId])

  const deleteAgent = useCallback(async (name: string) => {
    try {
      await fetch(`/api/agents?projectId=${encodeURIComponent(projectId)}&name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      setAgents(prev => prev.filter(a => a.name !== name))
      setConfirmDelete(null)
      if (expandedAgent === name) setExpandedAgent(null)
    } catch {
      setError('删除失败')
    }
  }, [expandedAgent])

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
      {/* 说明 */}
      <div className="text-xs mb-3 flex items-start gap-2" style={{ color: 'var(--color-text-muted)' }}>
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <span>子智能体可通过 Claude 的 Task 工具被自动调用，执行特定领域的任务。</span>
      </div>

      {/* 刷新 + 新建按钮 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={fetchAgents}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface)' }}
        >
          <RefreshCw size={14} />
          刷新
        </button>
        <button
          onClick={() => { setCreating(!creating); setDraft(EMPTY_AGENT) }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
          style={{
            borderColor: creating ? 'var(--color-primary)' : 'var(--color-border)',
            color: creating ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <Plus size={14} />
          新建
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="text-xs text-red-500 mb-3 px-2 py-1.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error, #ef4444) 10%, transparent)' }}>
          {error}
        </div>
      )}

      {/* 创建表单 */}
      {creating && (
        <div className="mb-3 p-3 rounded-lg border space-y-3" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <AgentForm
            agent={draft}
            isNew
            onChange={setDraft}
            onSave={createAgent}
            onCancel={() => { setCreating(false); setDraft(EMPTY_AGENT) }}
            saving={saving}
          />
        </div>
      )}

      {/* Agent 列表 */}
      {agents.length === 0 && !creating && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          暂无子智能体，点击"新建"创建一个
        </div>
      )}

      <div className="space-y-2">
        {agents.map(agent => {
          const isExpanded = expandedAgent === agent.name
          return (
            <div
              key={agent.name}
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              {/* Agent 概要行 */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.name)}
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                  style={{ color: 'var(--color-text)' }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Bot size={16} style={{ color: 'var(--color-primary)' }} />
                  <span className="text-sm font-medium truncate">{agent.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}
                  >
                    {agent.model === 'inherit' ? '继承' : agent.model}
                  </span>
                </button>

                {/* 启用/禁用开关 */}
                <button
                  onClick={() => toggleEnabled(agent.name, !agent.enabled)}
                  className="w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 relative"
                  style={{ backgroundColor: agent.enabled ? 'var(--color-success, #22c55e)' : 'var(--color-bg-tertiary, #374151)' }}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all"
                    style={{ left: agent.enabled ? '18px' : '3px' }}
                  />
                </button>
              </div>

              {/* 描述 */}
              {!isExpanded && agent.description && (
                <div className="px-3 pb-2 -mt-1">
                  <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{agent.description}</div>
                </div>
              )}

              {/* 展开的编辑表单 */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
                  <AgentForm
                    agent={agent}
                    onChange={(updated) => setAgents(prev => prev.map(a => a.name === agent.name ? { ...updated, enabled: a.enabled } : a))}
                    onSave={() => {
                      const current = agents.find(a => a.name === agent.name)
                      if (current) updateAgent(current)
                    }}
                    saving={saving}
                  />
                  {/* 删除按钮 */}
                  <div className="flex justify-end pt-1">
                    {confirmDelete === agent.name ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>确认删除?</span>
                        <button
                          onClick={() => deleteAgent(agent.name)}
                          className="text-xs px-2 py-1 rounded cursor-pointer"
                          style={{ backgroundColor: 'var(--color-error, #ef4444)', color: '#fff' }}
                        >
                          删除
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs px-2 py-1 rounded cursor-pointer"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(agent.name)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                        style={{ color: 'var(--color-error, #ef4444)' }}
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 内联表单组件 ── */
interface AgentFormProps {
  agent: Omit<AgentInfo, 'enabled'>
  isNew?: boolean
  onChange: (agent: Omit<AgentInfo, 'enabled'>) => void
  onSave: () => void
  onCancel?: () => void
  saving: boolean
}

function AgentForm({ agent, isNew, onChange, onSave, onCancel, saving }: AgentFormProps) {
  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <>
      {/* 名称 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          名称 {isNew && <span style={{ color: 'var(--color-text-muted)' }}>(创建后不可修改)</span>}
        </label>
        <input
          value={agent.name}
          onChange={e => isNew && onChange({ ...agent, name: e.target.value.replace(/\s+/g, '-') })}
          readOnly={!isNew}
          placeholder="my-agent"
          className="w-full px-2.5 py-1.5 rounded border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{ ...inputStyle, opacity: isNew ? 1 : 0.7 }}
        />
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          描述
        </label>
        <input
          value={agent.description}
          onChange={e => onChange({ ...agent, description: e.target.value })}
          placeholder="何时使用此智能体的自然语言描述"
          className="w-full px-2.5 py-1.5 rounded border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={inputStyle}
        />
      </div>

      {/* 系统提示 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          系统提示 *
        </label>
        <textarea
          value={agent.prompt}
          onChange={e => onChange({ ...agent, prompt: e.target.value })}
          placeholder="你是一个专门负责...的智能体"
          rows={4}
          className="w-full px-2.5 py-1.5 rounded border text-sm outline-none transition-colors resize-y focus:border-[var(--color-primary)]"
          style={inputStyle}
        />
      </div>

      {/* 模型 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          模型
        </label>
        <select
          value={agent.model}
          onChange={e => onChange({ ...agent, model: e.target.value as AgentInfo['model'] })}
          className="w-full px-2.5 py-1.5 rounded border text-sm outline-none cursor-pointer focus:border-[var(--color-primary)]"
          style={inputStyle}
        >
          {MODEL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 允许工具 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          允许工具 <span style={{ color: 'var(--color-text-muted)' }}>(留空继承全部，逗号分隔)</span>
        </label>
        <input
          value={agent.tools.join(', ')}
          onChange={e => onChange({ ...agent, tools: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="Read, Grep, Glob"
          className="w-full px-2.5 py-1.5 rounded border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
          style={inputStyle}
        />
      </div>

      {/* 禁用工具 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          禁用工具 <span style={{ color: 'var(--color-text-muted)' }}>(逗号分隔)</span>
        </label>
        <input
          value={agent.disallowedTools.join(', ')}
          onChange={e => onChange({ ...agent, disallowedTools: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="Bash, Write"
          className="w-full px-2.5 py-1.5 rounded border text-sm font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
          style={inputStyle}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving || !agent.name.trim() || !agent.prompt.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          <Save size={14} />
          {saving ? '保存中...' : isNew ? '创建' : '保存'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            取消
          </button>
        )}
      </div>
    </>
  )
}
