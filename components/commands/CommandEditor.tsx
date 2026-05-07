'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Save, X, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight,
  AlertCircle, Sparkles, Loader2, GitBranch
} from 'lucide-react'
import type {
  CommandDefinition, CommandParameter, CommandStep,
  PromptStep, ScriptStep, ConditionStep, CommandRefStep, ParallelStep, DynamicExecStep
} from '@/types/commands'
import { generateMermaidCode } from '@/lib/commands/mermaid-generator'
import { MermaidBlock } from '@/components/chat/MermaidBlock'
import WorkflowEditor from './workflow-editor/WorkflowEditor'

interface CommandEditorProps {
  command?: CommandDefinition
  projectId: string
  onSave: (command: CommandDefinition) => void
  onCancel: () => void
}

const STEP_TYPES = [
  { value: 'prompt', label: 'Prompt (AI 对话)' },
  { value: 'script', label: 'Script (脚本执行)' },
  { value: 'condition', label: 'Condition (条件分支)' },
  { value: 'command-ref', label: 'Command Ref (引用命令)' },
  { value: 'parallel', label: 'Parallel (并行执行)' },
  { value: 'dynamic-exec', label: 'Dynamic Exec (AI动态执行)' },
] as const

const PARAM_TYPES = ['string', 'number', 'boolean', 'enum', 'file'] as const
const ERROR_STRATEGIES = ['stop', 'continue', 'retry'] as const
const CATEGORIES = ['development', 'analysis', 'writing', 'automation', 'other']

function generateId() {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const inputStyle = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const labelClass = "block text-xs font-medium mb-1"
const labelStyle = { color: 'var(--color-text-secondary)' }
const inputClass = "w-full px-2.5 py-1.5 rounded border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"

function createEmptyStep(type: CommandStep['type']): CommandStep {
  const base = { id: generateId(), onError: 'stop' as const }
  switch (type) {
    case 'prompt': return { ...base, type: 'prompt', userMessage: '', outputVar: '' }
    case 'script': return { ...base, type: 'script', command: '' }
    case 'condition': return { ...base, type: 'condition', if: '', then: '' }
    case 'command-ref': return { ...base, type: 'command-ref', commandId: '' }
    case 'parallel': return { ...base, type: 'parallel', branches: [[]] }
    case 'dynamic-exec': return { ...base, type: 'dynamic-exec', intent: '' }
  }
}

export function CommandEditor({ command, projectId, onSave, onCancel }: CommandEditorProps) {
  const isNew = !command || !command.createdAt
  const [form, setForm] = useState<CommandDefinition>(() => command || {
    id: '',
    name: '',
    description: '',
    category: '',
    scope: 'project',
    enabled: true,
    parameters: [],
    steps: [],
    output: { format: 'markdown' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form')
  const [showFullscreenChart, setShowFullscreenChart] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => new Set(form.steps.map(s => s.id)))
  const [showOptimizeDialog, setShowOptimizeDialog] = useState(false)
  const [optimizeInstruction, setOptimizeInstruction] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [optimizeProgress, setOptimizeProgress] = useState<string | null>(null)

  const updateForm = useCallback((updates: Partial<CommandDefinition>) => {
    setForm(prev => ({ ...prev, ...updates, updatedAt: new Date().toISOString() }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.id.trim() || !form.name.trim() || form.steps.length === 0) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }, [form, onSave])

  const handleOptimize = useCallback(async () => {
    setOptimizing(true)
    setOptimizeError(null)
    setOptimizeProgress(null)
    try {
      const res = await fetch('/api/commands/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'optimize',
          command: form,
          instruction: optimizeInstruction.trim() || undefined,
          projectId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setOptimizeError(data.error || '优化失败')
        return
      }
      const reader = res.body?.getReader()
      if (!reader) { setOptimizeError('无法读取响应流'); return }
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() || ''
        for (const line of parts) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (currentEvent === 'progress') {
                setOptimizeProgress(data.message)
              } else if (currentEvent === 'result') {
                setForm(data.command)
                setExpandedSteps(new Set((data.command.steps || []).map((s: CommandStep) => s.id)))
                setShowOptimizeDialog(false)
                setOptimizeInstruction('')
                setOptimizeProgress(null)
              } else if (currentEvent === 'error') {
                setOptimizeError(data.message || '优化失败')
              }
            } catch { /* skip malformed data */ }
          }
        }
      }
    } catch {
      setOptimizeError('网络错误，请重试')
    } finally {
      setOptimizing(false)
      setOptimizeProgress(null)
    }
  }, [form, optimizeInstruction, projectId])

  // Parameter helpers
  const addParameter = () => {
    updateForm({ parameters: [...(form.parameters || []), { name: '', type: 'string', required: false, description: '' }] })
  }
  const updateParameter = (idx: number, updates: Partial<CommandParameter>) => {
    const params = [...(form.parameters || [])]
    params[idx] = { ...params[idx], ...updates }
    updateForm({ parameters: params })
  }
  const removeParameter = (idx: number) => {
    updateForm({ parameters: (form.parameters || []).filter((_, i) => i !== idx) })
  }

  // Step helpers
  const addStep = (type: CommandStep['type'] = 'prompt') => {
    const step = createEmptyStep(type)
    const newSteps = [...form.steps, step]
    setExpandedSteps(prev => new Set([...prev, step.id]))
    updateForm({ steps: newSteps })
  }
  const updateStep = (idx: number, updates: Partial<CommandStep>) => {
    const steps = [...form.steps]
    steps[idx] = { ...steps[idx], ...updates } as CommandStep
    updateForm({ steps })
  }
  const removeStep = (idx: number) => {
    updateForm({ steps: form.steps.filter((_, i) => i !== idx) })
  }
  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= form.steps.length) return
    const steps = [...form.steps]
    ;[steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]]
    updateForm({ steps })
  }
  const toggleStepExpanded = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const mermaidCode = useMemo(() => generateMermaidCode(form.steps), [form.steps])

  const handleChartClose = useCallback(() => {
    setShowFullscreenChart(false)
    setViewMode('form')
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
      {/* A. 基本信息 */}
      <Section title="基本信息">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>
              ID {!isNew && <span style={{ color: 'var(--color-text-muted)' }}>(不可修改)</span>}
            </label>
            <input
              value={form.id}
              onChange={e => isNew && updateForm({ id: e.target.value.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() })}
              readOnly={!isNew}
              placeholder="my-command"
              className={`${inputClass} font-mono`}
              style={{ ...inputStyle, opacity: isNew ? 1 : 0.7 }}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>名称 *</label>
            <input value={form.name} onChange={e => updateForm({ name: e.target.value })} placeholder="命令名称" className={inputClass} style={inputStyle} />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelClass} style={labelStyle}>描述</label>
          <textarea value={form.description} onChange={e => updateForm({ description: e.target.value })} placeholder="命令功能描述" rows={2} className={`${inputClass} resize-y`} style={inputStyle} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className={labelClass} style={labelStyle}>分类</label>
            <select value={form.category || ''} onChange={e => updateForm({ category: e.target.value })} className={`${inputClass} cursor-pointer`} style={inputStyle}>
              <option value="">未分类</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>作用域</label>
            <div className="flex gap-2 mt-1">
              {(['global', 'project'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => updateForm({ scope: s })}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors cursor-pointer"
                  style={{
                    borderColor: form.scope === s ? 'var(--color-primary)' : 'var(--color-border)',
                    color: form.scope === s ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    backgroundColor: form.scope === s ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                  }}
                >
                  {s === 'global' ? '全局' : '项目级'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoExecute || false}
              onChange={e => updateForm({ autoExecute: e.target.checked })}
              className="cursor-pointer w-4 h-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm" style={{ color: 'var(--color-text)' }}>自动执行</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>开启后工作流每步完成自动继续，无需确认</span>
          </label>
        </div>
      </Section>

      {/* B. 参数定义 */}
      <Section title={`参数 (${form.parameters?.length || 0})`}>
        {(form.parameters || []).map((param, idx) => (
          <div key={idx} className="p-2.5 rounded-lg border mb-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass} style={labelStyle}>参数名</label>
                <input value={param.name} onChange={e => updateParameter(idx, { name: e.target.value })} placeholder="name" className={`${inputClass} font-mono`} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>类型</label>
                <select value={param.type} onChange={e => updateParameter(idx, { type: e.target.value as CommandParameter['type'] })} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                  {PARAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                  <input type="checkbox" checked={param.required} onChange={e => updateParameter(idx, { required: e.target.checked })} className="cursor-pointer" />
                  必填
                </label>
                <button onClick={() => removeParameter(idx)} className="p-1 rounded cursor-pointer ml-auto" style={{ color: 'var(--color-error, #ef4444)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className={labelClass} style={labelStyle}>描述</label>
                <input value={param.description} onChange={e => updateParameter(idx, { description: e.target.value })} placeholder="参数描述" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>默认值</label>
                <input value={param.default ?? ''} onChange={e => updateParameter(idx, { default: e.target.value || undefined })} placeholder="默认值" className={inputClass} style={inputStyle} />
              </div>
            </div>
            {param.type === 'enum' && (
              <div className="mt-2">
                <label className={labelClass} style={labelStyle}>枚举值 (逗号分隔)</label>
                <input
                  value={(param.values || []).join(', ')}
                  onChange={e => updateParameter(idx, { values: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="value1, value2, value3"
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                />
              </div>
            )}
            {(param.type === 'string' || param.type === 'file') && (
              <div className="mt-2">
                <label className={labelClass} style={labelStyle}>Placeholder</label>
                <input value={param.placeholder || ''} onChange={e => updateParameter(idx, { placeholder: e.target.value || undefined })} placeholder="输入提示" className={inputClass} style={inputStyle} />
              </div>
            )}
          </div>
        ))}
        <button onClick={addParameter} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border cursor-pointer transition-colors" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <Plus size={12} /> 添加参数
        </button>
      </Section>

      {/* C. 步骤 */}
      <Section title={`步骤 (${form.steps.length})`} extra={
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          {([['form', '📝 表单'], ['json', '{ } JSON']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={(e) => { e.stopPropagation(); setViewMode(mode as 'form' | 'json') }}
              className="px-2 py-1 text-xs rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: viewMode === mode ? 'var(--color-bg)' : 'transparent',
                color: viewMode === mode ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: viewMode === mode ? 500 : 400,
                boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      }>
        {viewMode === 'json' && (
          <div className="mb-3">
            <pre className="text-xs p-3 rounded-lg border overflow-auto max-h-[60vh] font-mono" style={{ ...inputStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(form, null, 2)}
            </pre>
          </div>
        )}
        {viewMode === 'form' && <>
        {form.steps.map((step, idx) => {
          const isExpanded = expandedSteps.has(step.id)
          return (
            <div key={step.id} className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
              {/* Step header */}
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => toggleStepExpanded(step.id)} style={{ color: 'var(--color-text)' }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-primary)' }}>{step.type}</span>
                <span className="text-sm flex-1 truncate">{step.name || step.id}</span>
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-1 rounded cursor-pointer disabled:opacity-30" style={{ color: 'var(--color-text-muted)' }}><ChevronUp size={12} /></button>
                  <button onClick={() => moveStep(idx, 1)} disabled={idx === form.steps.length - 1} className="p-1 rounded cursor-pointer disabled:opacity-30" style={{ color: 'var(--color-text-muted)' }}><ChevronDown size={12} /></button>
                  <button onClick={() => removeStep(idx)} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-error, #ef4444)' }}><Trash2 size={12} /></button>
                </div>
              </div>
              {/* Step body */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass} style={labelStyle}>步骤名称</label>
                      <input value={step.name || ''} onChange={e => updateStep(idx, { name: e.target.value })} placeholder="步骤名称" className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>onError</label>
                      <select value={step.onError || 'stop'} onChange={e => updateStep(idx, { onError: e.target.value as 'stop' | 'continue' | 'retry' })} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                        {ERROR_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <StepTypeForm step={step} onChange={(updates) => updateStep(idx, updates)} />
                </div>
              )}
            </div>
          )
        })}
        {/* Add step */}
        <div className="flex gap-1 flex-wrap">
          {STEP_TYPES.map(st => (
            <button key={st.value} onClick={() => addStep(st.value)} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border cursor-pointer transition-colors hover:border-[var(--color-primary)]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <Plus size={10} /> {st.label}
            </button>
          ))}
        </div>
        </>}
      </Section>

      {/* D. 输出配置 */}
      <Section title="输出配置">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>格式</label>
            <select value={form.output?.format || 'markdown'} onChange={e => updateForm({ output: { ...form.output, format: e.target.value as 'markdown' | 'json' | 'text' } })} className={`${inputClass} cursor-pointer`} style={inputStyle}>
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>保存路径 (可选)</label>
            <input value={form.output?.saveTo || ''} onChange={e => updateForm({ output: { ...form.output, saveTo: e.target.value || undefined } })} placeholder="reports/{{date}}.md" className={`${inputClass} font-mono`} style={inputStyle} />
          </div>
        </div>
      </Section>
      </div>{/* end scrollable content */}

      {/* E. 操作按钮 - 固定底部 */}
      <div className="flex items-center gap-2 px-6 py-3 border-t bg-white dark:bg-gray-900 shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => setShowFullscreenChart(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm cursor-pointer border transition-colors"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <GitBranch size={14} /> 流程图
        </button>
        <button
          onClick={() => { setShowOptimizeDialog(true); setOptimizeError(null) }}
          disabled={form.steps.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm cursor-pointer border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          <Sparkles size={14} /> AI 优化
        </button>
        <div className="flex-1" />
        {!form.id.trim() || !form.name.trim() || form.steps.length === 0 ? (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <AlertCircle size={12} />
            {!form.id.trim() ? '需要 ID' : !form.name.trim() ? '需要名称' : '至少添加一个步骤'}
          </div>
        ) : null}
        <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>取消</button>
        <button onClick={handleSave} disabled={saving || !form.id.trim() || !form.name.trim() || form.steps.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
          <Save size={14} /> {saving ? '保存中...' : isNew ? '创建' : '保存'}
        </button>
      </div>

      {/* 全屏流程图 */}
      {showFullscreenChart && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
          <WorkflowEditor
            steps={form.steps}
            onStepsChange={(newSteps) => updateForm({ steps: newSteps })}
            onExitFullscreen={handleChartClose}
          />
        </div>
      )}

      {/* AI 优化弹窗 */}
      {showOptimizeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md mx-4 rounded-xl shadow-2xl border p-5" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: 'var(--color-primary)' }} />
                <span className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>AI 优化工作流</span>
              </div>
              <button onClick={() => { setShowOptimizeDialog(false); setOptimizeError(null) }} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><X size={16} /></button>
            </div>
            <div className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              AI 将从精简步骤、提高并行度、增强错误处理、优化 prompt 质量等方向进行优化。
            </div>
            <input
              value={optimizeInstruction}
              onChange={e => setOptimizeInstruction(e.target.value)}
              placeholder="留空则自动优化，或输入具体要求..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
              disabled={optimizing}
            />
            {optimizeProgress && (
              <div className="flex items-center gap-2 text-xs mt-2 px-2 py-1.5 rounded" style={{ color: 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
                <Loader2 size={12} className="animate-spin" />
                {optimizeProgress}
              </div>
            )}
            {optimizeError && (
              <div className="text-xs text-red-500 mt-2 px-2 py-1.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error, #ef4444) 10%, transparent)' }}>
                {optimizeError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowOptimizeDialog(false); setOptimizeError(null) }}
                disabled={optimizing}
                className="px-4 py-2 rounded-lg text-sm cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >取消</button>
              <button
                onClick={handleOptimize}
                disabled={optimizing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
              >
                {optimizing ? <><Loader2 size={14} className="animate-spin" /> 优化中...</> : <><Sparkles size={14} /> 开始优化</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Section 折叠区块 ── */
function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1" style={{ color: 'var(--color-text)' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title}
        </button>
        {extra}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

/* ── 各步骤类型表单 ── */
function StepTypeForm({ step, onChange }: { step: CommandStep; onChange: (updates: Partial<CommandStep>) => void }) {
  switch (step.type) {
    case 'prompt': return <PromptStepForm step={step} onChange={onChange} />
    case 'script': return <ScriptStepForm step={step} onChange={onChange} />
    case 'condition': return <ConditionStepForm step={step} onChange={onChange} />
    case 'command-ref': return <CommandRefStepForm step={step} onChange={onChange} />
    case 'parallel': return <ParallelStepForm step={step} onChange={onChange} />
    case 'dynamic-exec': return <DynamicExecStepForm step={step} onChange={onChange} />
    default: return null
  }
}

function PromptStepForm({ step, onChange }: { step: PromptStep; onChange: (u: Partial<PromptStep>) => void }) {
  return (
    <>
      <div>
        <label className={labelClass} style={labelStyle}>System Prompt</label>
        <textarea value={step.systemPrompt || ''} onChange={e => onChange({ systemPrompt: e.target.value })} rows={3} placeholder="系统提示词" className={`${inputClass} resize-y`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>User Message *</label>
        <textarea value={step.userMessage} onChange={e => onChange({ userMessage: e.target.value })} rows={3} placeholder="用户消息，支持 {{params.xxx}} 和 {{steps.xxx.output}} 模板变量" className={`${inputClass} resize-y`} style={inputStyle} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelClass} style={labelStyle}>Agent</label>
          <input value={step.agent || ''} onChange={e => onChange({ agent: e.target.value || undefined })} placeholder="可选" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>工具 (逗号分隔)</label>
          <input value={(step.tools || []).join(', ')} onChange={e => onChange({ tools: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Read, Bash" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Max Turns</label>
          <input type="number" value={step.maxTurns ?? ''} onChange={e => onChange({ maxTurns: e.target.value ? Number(e.target.value) : undefined })} placeholder="默认" className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>输出变量名 (outputVar)</label>
        <input value={step.outputVar || ''} onChange={e => onChange({ outputVar: e.target.value || undefined })} placeholder="result" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
    </>
  )
}

function ScriptStepForm({ step, onChange }: { step: ScriptStep; onChange: (u: Partial<ScriptStep>) => void }) {
  return (
    <>
      <div>
        <label className={labelClass} style={labelStyle}>命令 *</label>
        <input value={step.command} onChange={e => onChange({ command: e.target.value })} placeholder="npm run build" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} style={labelStyle}>工作目录 (cwd)</label>
          <input value={step.cwd || ''} onChange={e => onChange({ cwd: e.target.value || undefined })} placeholder="." className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>输出变量名</label>
          <input value={step.outputVar || ''} onChange={e => onChange({ outputVar: e.target.value || undefined })} placeholder="script_result" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} style={labelStyle}>重试次数</label>
          <input type="number" min={0} value={step.retryCount ?? ''} onChange={e => onChange({ retryCount: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="0（不重试）" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>重试间隔 (ms)</label>
          <input type="number" min={0} step={1000} value={step.retryDelay ?? ''} onChange={e => onChange({ retryDelay: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="3000" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
      </div>
    </>
  )
}

function ConditionStepForm({ step, onChange }: { step: ConditionStep; onChange: (u: Partial<ConditionStep>) => void }) {
  return (
    <>
      <div>
        <label className={labelClass} style={labelStyle}>条件表达式 (if) *</label>
        <input value={step.if} onChange={e => onChange({ if: e.target.value })} placeholder="contains(steps.xxx.output, '关键词')" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} style={labelStyle}>Then (跳转步骤 ID)</label>
          <input value={Array.isArray(step.then) ? step.then.join(', ') : step.then} onChange={e => onChange({ then: e.target.value })} placeholder="step_id" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Else (跳转步骤 ID)</label>
          <input value={step.else ? (Array.isArray(step.else) ? step.else.join(', ') : step.else) : ''} onChange={e => onChange({ else: e.target.value || undefined })} placeholder="step_id" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
      </div>
    </>
  )
}

function CommandRefStepForm({ step, onChange }: { step: CommandRefStep; onChange: (u: Partial<CommandRefStep>) => void }) {
  return (
    <>
      <div>
        <label className={labelClass} style={labelStyle}>引用命令 ID *</label>
        <input value={step.commandId} onChange={e => onChange({ commandId: e.target.value })} placeholder="other-command-id" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>参数 (JSON key:value)</label>
        <input
          value={step.params ? Object.entries(step.params).map(([k, v]) => `${k}:${v}`).join(', ') : ''}
          onChange={e => {
            const pairs = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
            const params: Record<string, string> = {}
            pairs.forEach(p => { const [k, ...v] = p.split(':'); if (k) params[k.trim()] = v.join(':').trim() })
            onChange({ params: Object.keys(params).length > 0 ? params : undefined })
          }}
          placeholder="key1:value1, key2:value2"
          className={`${inputClass} font-mono`}
          style={inputStyle}
        />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>输出变量名</label>
        <input value={step.outputVar || ''} onChange={e => onChange({ outputVar: e.target.value || undefined })} placeholder="ref_result" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
    </>
  )
}

function ParallelStepForm({ step, onChange }: { step: ParallelStep; onChange: (u: Partial<ParallelStep>) => void }) {
  const branches = step.branches || [[]]
  return (
    <>
      <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
        并行步骤包含 {branches.length} 个分支，每个分支是独立的步骤序列。
      </div>
      <div className="flex items-center gap-2 mb-2">
        <label className={labelClass} style={labelStyle}>分支数量</label>
        <input
          type="number"
          min={1}
          max={10}
          value={branches.length}
          onChange={e => {
            const count = Math.max(1, Math.min(10, Number(e.target.value) || 1))
            const newBranches = [...branches]
            while (newBranches.length < count) newBranches.push([])
            onChange({ branches: newBranches.slice(0, count) })
          }}
          className="w-20 px-2 py-1 rounded border text-sm outline-none"
          style={inputStyle}
        />
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>输出变量名</label>
        <input value={step.outputVar || ''} onChange={e => onChange({ outputVar: e.target.value || undefined })} placeholder="parallel_result" className={`${inputClass} font-mono`} style={inputStyle} />
      </div>
    </>
  )
}

function DynamicExecStepForm({ step, onChange }: { step: DynamicExecStep; onChange: (u: Partial<DynamicExecStep>) => void }) {
  return (
    <>
      <div>
        <label className={labelClass} style={labelStyle}>意图描述 (intent) *</label>
        <textarea value={step.intent} onChange={e => onChange({ intent: e.target.value })} rows={3} placeholder="描述你希望执行的操作，支持 {{params.xxx}} 模板变量" className={`${inputClass} resize-y`} style={inputStyle} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} style={labelStyle}>工作目录 (cwd)</label>
          <input value={step.cwd || ''} onChange={e => onChange({ cwd: e.target.value || undefined })} placeholder="." className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>输出变量名</label>
          <input value={step.outputVar || ''} onChange={e => onChange({ outputVar: e.target.value || undefined })} placeholder="exec_result" className={`${inputClass} font-mono`} style={inputStyle} />
        </div>
      </div>
      <div>
        <label className={labelClass} style={labelStyle}>约束说明 (constraints)</label>
        <input value={step.constraints || ''} onChange={e => onChange({ constraints: e.target.value || undefined })} placeholder="如: 只生成 git 命令、不要执行删除操作" className={inputClass} style={inputStyle} />
      </div>
    </>
  )
}
