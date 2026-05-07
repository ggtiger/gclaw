'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Terminal, Plus, Trash2, Search, RefreshCw, AlertCircle,
  Pencil, Copy, Globe, FolderOpen, Sparkles, Loader2, X
} from 'lucide-react'
import type { CommandDefinition } from '@/types/commands'
import { CommandEditor } from './CommandEditor'
import { generateMermaidCode } from '@/lib/commands/mermaid-generator'
import { MermaidBlock } from '@/components/chat/MermaidBlock'

const BUILT_IN_TEMPLATES: { id: string; name: string; description: string; category: string }[] = [
  { id: 'code-review', name: '代码审查', description: '对代码进行多维度审查', category: 'development' },
  { id: 'project-summary', name: '项目概要', description: '全面分析项目结构和技术栈', category: 'analysis' },
  { id: 'full-project-audit', name: '项目全面审计', description: '多步工作流审计项目', category: 'analysis' },
  { id: 'doc-generator', name: '文档生成', description: '生成 API 文档/README/变更日志', category: 'writing' },
  { id: 'bug-analyzer', name: 'Bug 分析', description: '分析 Bug 根因并建议修复方案', category: 'development' },
]

interface CommandsPanelProps {
  projectId: string
  onClose?: () => void
}

export function CommandsPanel({ projectId }: CommandsPanelProps) {
  const [commands, setCommands] = useState<CommandDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingCommand, setEditingCommand] = useState<CommandDefinition | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAIDialog, setShowAIDialog] = useState(false)
  const [aiDescription, setAiDescription] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiProgress, setAiProgress] = useState<string | null>(null)

  const fetchCommands = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/commands?projectId=${encodeURIComponent(projectId)}&includeDisabled=true`)
      const data = await res.json()
      setCommands(data.commands || [])
    } catch {
      setError('加载命令列表失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchCommands() }, [fetchCommands])

  const toggleEnabled = useCallback(async (cmd: CommandDefinition) => {
    const newEnabled = !cmd.enabled
    setCommands(prev => prev.map(c => c.id === cmd.id ? { ...c, enabled: newEnabled } : c))
    try {
      await fetch(`/api/commands/${encodeURIComponent(cmd.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { enabled: newEnabled }, scope: cmd.scope, projectId: cmd.scope === 'project' ? projectId : undefined }),
      })
    } catch {
      setCommands(prev => prev.map(c => c.id === cmd.id ? { ...c, enabled: !newEnabled } : c))
    }
  }, [projectId])

  const deleteCommand = useCallback(async (cmd: CommandDefinition) => {
    try {
      await fetch(`/api/commands/${encodeURIComponent(cmd.id)}?scope=${cmd.scope}&projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      setCommands(prev => prev.filter(c => c.id !== cmd.id))
      setConfirmDelete(null)
    } catch {
      setError('删除失败')
    }
  }, [projectId])

  const handleSave = useCallback(async (command: CommandDefinition) => {
    try {
      const existing = commands.find(c => c.id === command.id)
      // 也检查 createdAt：如果有 createdAt 说明是已有命令
      const shouldUpdate = existing || !!command.createdAt
      if (shouldUpdate) {
        const res = await fetch(`/api/commands/${encodeURIComponent(command.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: command, scope: command.scope, projectId: command.scope === 'project' ? projectId : undefined }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          const errorMsg = d.error || '保存失败'
          setError(errorMsg)
          console.error('[CommandsPanel] Update failed:', errorMsg)
          return
        }
      } else {
        const res = await fetch('/api/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, scope: command.scope, projectId: command.scope === 'project' ? projectId : undefined }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          const errorMsg = d.error || '创建失败'
          setError(errorMsg)
          console.error('[CommandsPanel] Save failed:', errorMsg)
          return
        }
      }
      setEditingCommand(null)
      setCreatingNew(false)
      await fetchCommands()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      setError(msg)
      console.error('[CommandsPanel] Save error:', err)
    }
  }, [commands, projectId, fetchCommands])

  const handleAIGenerate = useCallback(async () => {
    if (!aiDescription.trim()) return
    setAiGenerating(true)
    setAiError(null)
    setAiProgress(null)
    try {
      const res = await fetch('/api/commands/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', description: aiDescription.trim(), projectId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAiError(data.error || '生成失败')
        return
      }
      const reader = res.body?.getReader()
      if (!reader) { setAiError('无法读取响应流'); return }
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
                setAiProgress(data.message)
              } else if (currentEvent === 'result') {
                setShowAIDialog(false)
                setAiDescription('')
                setAiProgress(null)
                setEditingCommand(data.command)
                setCreatingNew(true)
              } else if (currentEvent === 'error') {
                setAiError(data.message || '生成失败')
              }
            } catch { /* skip malformed data */ }
          }
        }
      }
    } catch {
      setAiError('网络错误，请重试')
    } finally {
      setAiGenerating(false)
      setAiProgress(null)
    }
  }, [aiDescription, projectId])

  const handleCreateFromTemplate = useCallback(async (templateId: string) => {
    console.log('[CommandsPanel] handleCreateFromTemplate called, templateId:', templateId)
    try {
      // 优先从已加载的 commands 状态中查找模板（避免冗余 API 调用）
      let template = commands.find(c => c.id === templateId)

      // 如果本地状态没有，再尝试从 API 获取（可能是首次加载或数据未同步）
      if (!template) {
        console.log('[CommandsPanel] Template not in local state, fetching from API...')
        const res = await fetch(`/api/commands?projectId=${encodeURIComponent(projectId)}&includeDisabled=true`)
        if (res.ok) {
          const data = await res.json()
          const allCmds = data.commands || []
          template = allCmds.find((c: CommandDefinition) => c.id === templateId)
        } else {
          console.warn('[CommandsPanel] API returned error:', res.status)
        }
      }

      if (template) {
        console.log('[CommandsPanel] Template found, creating copy:', template.name)
        const newCmd: CommandDefinition = {
          ...template,
          id: `${template.id}-copy-${Date.now().toString(36)}`,
          name: `${template.name} (副本)`,
          scope: 'project',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: undefined,
        }
        setEditingCommand(newCmd)
        setCreatingNew(true)
        setShowTemplates(false)
      } else {
        // 模板未在命令库中找到 → 用内置模板信息创建骨架命令
        console.warn('[CommandsPanel] Template not found in commands, creating skeleton from built-in info')
        const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === templateId)
        if (builtIn) {
          const skeletonCmd: CommandDefinition = {
            id: `${builtIn.id}-copy-${Date.now().toString(36)}`,
            name: `${builtIn.name} (副本)`,
            description: builtIn.description,
            category: builtIn.category,
            scope: 'project',
            enabled: true,
            parameters: [],
            steps: [
              {
                id: 'step-1',
                type: 'prompt',
                name: '步骤 1',
                systemPrompt: `你是${builtIn.name}专家。`,
                userMessage: '请执行任务。',
                tools: ['Read', 'Bash', 'Grep'],
                outputVar: 'result',
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          setEditingCommand(skeletonCmd)
          setCreatingNew(true)
          setShowTemplates(false)
        } else {
          setError(`未找到模板: ${templateId}`)
        }
      }
    } catch (err) {
      console.error('[CommandsPanel] handleCreateFromTemplate error:', err)
      setError('加载模板失败')
    }
  }, [projectId, commands])

  // Editor mode
  if (editingCommand || creatingNew) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <CommandEditor
          command={editingCommand || undefined}
          projectId={projectId}
          onSave={handleSave}
          onCancel={() => { setEditingCommand(null); setCreatingNew(false) }}
        />
      </div>
    )
  }

  const filtered = commands.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)
  })

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
    <div className="p-4 h-full overflow-y-auto">
      {/* 说明 */}
      <div className="text-xs mb-3 flex items-start gap-2" style={{ color: 'var(--color-text-muted)' }}>
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <span>命令是可复用的多步骤工作流，可通过 <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>/command</code> 触发执行。</span>
      </div>

      {/* 搜索 */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索命令..."
          className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={fetchCommands}
          className="flex items-center justify-center p-2 rounded-lg text-sm border transition-colors cursor-pointer"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface)' }}
          title="刷新"
        >
          <RefreshCw size={14} />
        </button>
        <div className="flex-1 flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={() => { setCreatingNew(true); setEditingCommand(null) }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
          >
            <Plus size={13} />
            空白创建
          </button>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors cursor-pointer"
            style={{
              color: showTemplates ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              backgroundColor: showTemplates ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            <Copy size={13} />
            从模板
          </button>
          <button
            onClick={() => { setShowAIDialog(true); setAiError(null) }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            <Sparkles size={13} />
            AI 生成
          </button>
        </div>
      </div>

      {/* AI 生成弹窗 */}
      {showAIDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md mx-4 rounded-xl shadow-2xl border p-5" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: 'var(--color-primary)' }} />
                <span className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>AI 生成命令</span>
              </div>
              <button onClick={() => { setShowAIDialog(false); setAiError(null) }} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><X size={16} /></button>
            </div>
            <textarea
              value={aiDescription}
              onChange={e => setAiDescription(e.target.value)}
              placeholder="描述你想要的工作流，例如：创建一个代码审查工作流，先分析代码结构，然后检查安全问题..."
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none resize-y transition-colors focus:border-[var(--color-primary)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
              disabled={aiGenerating}
            />
            {aiProgress && (
              <div className="flex items-center gap-2 text-xs mt-2 px-2 py-1.5 rounded" style={{ color: 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
                <Loader2 size={12} className="animate-spin" />
                {aiProgress}
              </div>
            )}
            {aiError && (
              <div className="text-xs text-red-500 mt-2 px-2 py-1.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error, #ef4444) 10%, transparent)' }}>
                {aiError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowAIDialog(false); setAiError(null) }}
                disabled={aiGenerating}
                className="px-4 py-2 rounded-lg text-sm cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >取消</button>
              <button
                onClick={handleAIGenerate}
                disabled={aiGenerating || !aiDescription.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
              >
                {aiGenerating ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Sparkles size={14} /> 生成</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="text-xs text-red-500 mb-3 px-2 py-1.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error, #ef4444) 10%, transparent)' }}>
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">关闭</button>
        </div>
      )}

      {/* 模板列表 */}
      {showTemplates && (
        <div className="mb-3 p-3 rounded-lg border space-y-2" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>选择内置模板创建命令</div>
          {BUILT_IN_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => handleCreateFromTemplate(t.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer hover:border-[var(--color-primary)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              <Terminal size={14} style={{ color: 'var(--color-primary)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 命令列表 */}
      {filtered.length === 0 && !showTemplates && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {search ? '没有匹配的命令' : '暂无命令，点击"新建"创建一个'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(cmd => (
          <CommandCard
            key={cmd.id}
            cmd={cmd}
            onEdit={() => setEditingCommand(cmd)}
            onDelete={() => deleteCommand(cmd)}
            onToggle={() => toggleEnabled(cmd)}
            confirmDelete={confirmDelete === cmd.id}
            onConfirmDelete={() => setConfirmDelete(cmd.id)}
            onCancelDelete={() => setConfirmDelete(null)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── 命令卡片（带懒加载 Mermaid 缩略图） ── */
interface CommandCardProps {
  cmd: CommandDefinition
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  confirmDelete: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function CommandCard({ cmd, onEdit, onDelete, onToggle, confirmDelete, onConfirmDelete, onCancelDelete }: CommandCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const hasThumbnail = cmd.steps.length >= 2

  useEffect(() => {
    if (!hasThumbnail || !cardRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '100px' }
    )
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [hasThumbnail])

  const mermaidCode = hasThumbnail && visible ? generateMermaidCode(cmd.steps) : null

  return (
    <div
      ref={cardRef}
      className="rounded-lg border overflow-hidden transition-colors"
      style={{
        borderColor: cmd.enabled ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: cmd.enabled ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'var(--color-surface)',
      }}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Terminal size={14} style={{ color: cmd.enabled ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{cmd.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
              {cmd.scope === 'global' ? <Globe size={9} /> : <FolderOpen size={9} />}
              {cmd.scope === 'global' ? '全局' : '项目'}
            </span>
            {cmd.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
                {cmd.category}
              </span>
            )}
          </div>
          {cmd.description && (
            <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
              {cmd.description}
            </div>
          )}
          <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {cmd.steps.length} 个步骤 · {cmd.parameters?.length || 0} 个参数
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          <button onClick={onEdit} className="p-1.5 rounded transition-colors cursor-pointer" style={{ color: 'var(--color-text-muted)' }} title="编辑">
            <Pencil size={13} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={onDelete} className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer" style={{ backgroundColor: 'var(--color-error, #ef4444)', color: '#fff' }}>删除</button>
              <button onClick={onCancelDelete} className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>取消</button>
            </div>
          ) : (
            <button onClick={onConfirmDelete} className="p-1.5 rounded transition-colors cursor-pointer" style={{ color: 'var(--color-error, #ef4444)' }} title="删除">
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={onToggle}
            className="relative w-10 h-5 rounded-full transition-colors cursor-pointer"
            style={{ backgroundColor: cmd.enabled ? 'var(--color-primary)' : 'var(--color-bg-tertiary)' }}
          >
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: cmd.enabled ? 'translateX(2px)' : 'translateX(-18px)' }} />
          </button>
        </div>
      </div>

      {/* Mermaid 缩略图 */}
      {mermaidCode && (
        <div className="px-3 pb-2 pt-0">
          <div className="rounded border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', maxHeight: 120 }}>
            <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center', pointerEvents: 'none' }}>
              <MermaidBlock chart={mermaidCode} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
