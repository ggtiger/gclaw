'use client'

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, ChevronUp, Loader, Check, XCircle, Terminal, ListTodo, Circle, Clock, Ban, HelpCircle, MessageSquare, CheckCircle2, Send, Pencil, FileText, FilePen, FileEdit, Search, FolderSearch, Layers } from 'lucide-react'
import type { StreamingToolBlock, AskUserQuestionRequest } from '@/types/chat'
import { FilePathAction } from './FilePathAction'

// 过滤 SDK 占位文本
const NOISE_PATTERN = /^[\s()]*(?:no content[\s()]*)+$/i

// ── 工具图标映射 ──

const TOOL_ICONS: Record<string, React.ReactNode> = {
  Read: <FileText size={12} />,
  Write: <FilePen size={12} />,
  Edit: <FileEdit size={12} />,
  MultiEdit: <FileEdit size={12} />,
  Bash: <Terminal size={12} />,
  Grep: <Search size={12} />,
  Glob: <FolderSearch size={12} />,
  Task: <Layers size={12} />,
}

function getToolIcon(toolName: string): React.ReactNode {
  return TOOL_ICONS[toolName] || <Terminal size={12} />
}

// ── 从 input 提取文件路径（短格式） ──

function extractFilePath(input: Record<string, unknown>): string | null {
  const path = (input.file_path || input.path || '') as string
  if (!path) return null
  const parts = path.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return path
  return '...' + parts.slice(-2).join('/')
}

// ── 判断是否为 Task 子代理工具 ──

function isTask(name: string) {
  return name === 'Task'
}

/** 提取 Task 工具的描述文本 */
function getTaskDescription(input: Record<string, unknown>): string | null {
  return (input.description || input.prompt || input.subtask_type || null) as string | null
}

// ── 内嵌工具行（紧凑型，用于任务内部展开） ──

function NestedToolRow({ tool }: { tool: StreamingToolBlock }) {
  const [expanded, setExpanded] = useState(false)
  const filePath = extractFilePath(tool.input)
  const isTaskTool = isTask(tool.toolName)
  const taskDesc = isTaskTool ? getTaskDescription(tool.input) : null

  const statusDot = () => {
    switch (tool.status) {
      case 'pending':
        return <Loader size={10} className="animate-spin text-[var(--color-primary)]" />
      case 'completed':
        return <Check size={10} className="text-[var(--color-success)]" />
      case 'error':
        return <XCircle size={10} className="text-[var(--color-error)]" />
    }
  }

  const formatContent = () => {
    if (isTaskTool) {
      const lines: string[] = []
      if (tool.input.description) lines.push(tool.input.description as string)
      if (tool.input.prompt) lines.push(tool.input.prompt as string)
      return lines.join('\n') || JSON.stringify(tool.input, null, 2)
    }
    if (tool.toolName === 'Bash' && tool.input?.command) {
      return tool.input.command as string
    }
    if (['Read', 'Write', 'Edit', 'MultiEdit'].includes(tool.toolName)) {
      const lines: string[] = []
      if (filePath) lines.push(filePath)
      if (tool.input.old_string) lines.push(`- ${tool.input.old_string as string}`)
      if (tool.input.new_string) lines.push(`+ ${tool.input.new_string as string}`)
      return lines.join('\n') || JSON.stringify(tool.input, null, 2)
    }
    return JSON.stringify(tool.input, null, 2)
  }

  return (
    <div className="rounded border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] hover:bg-white/20 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        {statusDot()}
        <span style={{ color: 'var(--color-text-muted)' }}>{getToolIcon(tool.toolName)}</span>
        {isTaskTool && taskDesc ? (
          <span className="truncate" style={{ color: 'var(--color-text)' }}>{taskDesc}</span>
        ) : (
          <>
            <span className="font-mono truncate" style={{ color: 'var(--color-text)' }}>
              {tool.toolName}
            </span>
            {filePath && (
              <span className="truncate max-w-[160px] text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                {filePath}
              </span>
            )}
          </>
        )}
        <div className="flex-1" />
        {tool.status === 'completed' && <span className="text-[10px] text-[var(--color-success)] shrink-0">done</span>}
        {tool.status === 'pending' && tool.elapsedSeconds != null && tool.elapsedSeconds > 0 && (
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            {Math.round(tool.elapsedSeconds)}s
          </span>
        )}
        {expanded ? <ChevronUp size={10} className="shrink-0" /> : <ChevronDown size={10} className="shrink-0" />}
      </button>
      {expanded && (
        <div className="px-2 pb-1.5 space-y-1 ml-3">
          {tool.input && Object.keys(tool.input).length > 0 && (
            <pre className="text-[10px] p-1 rounded overflow-x-auto whitespace-pre-wrap break-all" style={{
              backgroundColor: 'var(--color-code-bg)', color: '#e2e8f0', maxHeight: '100px', overflowY: 'auto',
            }}>
              {formatContent()}
            </pre>
          )}
          {tool.output && !NOISE_PATTERN.test(tool.output.trim()) && (
            <pre className="text-[10px] p-1 rounded overflow-x-auto whitespace-pre-wrap break-all" style={{
              backgroundColor: 'var(--color-code-bg)',
              color: tool.isError ? 'var(--color-error)' : '#e2e8f0',
              maxHeight: '100px', overflowY: 'auto',
            }}>
              {tool.output.length > 300 ? tool.output.substring(0, 300) + '...' : tool.output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── TodoWrite 专用渲染 ──

interface TodoItem {
  id?: string
  content: string
  status: string
}

function normalizeStatus(status: string): 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'CANCELLED' {
  const upper = status.toUpperCase()
  if (upper === 'COMPLETE' || upper === 'COMPLETED' || upper === 'DONE') return 'COMPLETE'
  if (upper === 'IN_PROGRESS' || upper === 'IN-PROGRESS') return 'IN_PROGRESS'
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED'
  return 'PENDING'
}

function TodoStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETE':
      return <Check size={12} className="text-[var(--color-success)]" />
    case 'IN_PROGRESS':
      return <Clock size={12} className="text-[var(--color-primary)] animate-pulse" />
    case 'CANCELLED':
      return <Ban size={12} className="text-[var(--color-text-muted)]" />
    default:
      return <Circle size={12} className="text-[var(--color-text-muted)]" />
  }
}

function TodoWriteView({ tool, allBlocks, taskToolsMap }: {
  tool: StreamingToolBlock
  allBlocks?: StreamingToolBlock[]
  taskToolsMap?: Map<string, StreamingToolBlock[]>
}) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())

  const todos = useMemo(() => {
    // 合并所有 TodoWrite 块的 todos（按调用顺序）
    const blocksToMerge = (allBlocks && allBlocks.length > 0) ? allBlocks : [tool]
    const map = new Map<string, TodoItem>()

    for (const block of blocksToMerge) {
      const items = (block.input?.todos as TodoItem[]) || []
      if (items.length === 0) continue

      const merge = block.input?.merge as boolean
      if (!merge) map.clear()

      items.forEach((todo, idx) => {
        const key = todo.id || `_auto_${todo.content?.slice(0, 30) || idx}`
        const normalized = { ...todo, id: key, status: normalizeStatus(todo.status || 'PENDING') }
        const existing = map.get(key)
        if (existing) {
          map.set(key, { ...existing, ...normalized })
        } else {
          map.set(key, normalized)
        }
      })
    }

    return Array.from(map.values())
  }, [tool.input, allBlocks])

  const toggleTask = useCallback((taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  if (todos.length === 0) return null

  const completed = todos.filter(t => t.status === 'COMPLETE').length
  const inProgress = todos.filter(t => t.status === 'IN_PROGRESS').length
  const total = todos.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  // 任意一个块 pending 则认为正在更新
  const isUpdating = allBlocks
    ? allBlocks.some(b => b.status === 'pending')
    : tool.status === 'pending'

  return (
    <div className="ml-1 mt-1 space-y-0.5">
      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        {isUpdating ? (
          <Loader size={10} className="animate-spin text-[var(--color-primary)]" />
        ) : (
          <ListTodo size={10} className="text-[var(--color-primary)]" />
        )}
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {completed}/{total}{inProgress > 0 ? ` · ${inProgress} 进行中` : ''}
        </span>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: 'var(--color-success)' }}
          />
        </div>
      </div>
      {/* Items */}
      {todos.map(todo => {
        const tools = taskToolsMap?.get(todo.id || '') || []
        const hasTools = tools.length > 0
        const isExpanded = expandedTasks.has(todo.id || '')
        return (
          <div key={todo.id}>
            <div
              className={`flex items-center gap-1.5 py-0.5 px-1 rounded text-[11px] ${hasTools ? 'cursor-pointer hover:bg-white/20 dark:hover:bg-white/5' : ''}`}
              style={{
                backgroundColor: todo.status === 'IN_PROGRESS' ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                opacity: todo.status === 'CANCELLED' ? 0.5 : 1,
              }}
              onClick={() => hasTools && toggleTask(todo.id || '')}
            >
              <TodoStatusIcon status={todo.status} />
              <span
                className="flex-1 truncate"
                style={{
                  color: 'var(--color-text)',
                  textDecoration: todo.status === 'CANCELLED' ? 'line-through' : 'none',
                }}
              >
                {todo.content}
              </span>
              {hasTools && (
                <>
                  <span className="text-[10px] px-1 rounded" style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-muted)',
                  }}>
                    {tools.length} 工具
                  </span>
                  {isExpanded ? <ChevronUp size={10} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={10} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
                </>
              )}
            </div>
            {/* 展开显示嵌套工具 */}
            {isExpanded && hasTools && (
              <div className="ml-4 my-0.5 space-y-0.5">
                {tools.map(t => (
                  <NestedToolRow key={t.id} tool={t} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── AskUserQuestion 专用行 ──

interface AskQuestion {
  question: string
  header?: string
  options?: { label: string; description?: string; preview?: string }[]
  multiSelect?: boolean
}

function parseQAOutput(output: string): { question: string; answer: string }[] {
  const qaPairs: { question: string; answer: string }[] = []
  const regex = /"([^"]+)"="([^"]*)"/g
  let match
  while ((match = regex.exec(output)) !== null) {
    qaPairs.push({ question: match[1], answer: match[2] })
  }
  return qaPairs
}

function AskUserQuestionView({ tool, askQuestion, onRespondAskQuestion }: {
  tool: StreamingToolBlock
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
}) {
  const [selections, setSelections] = useState<Record<number, string | string[]>>({})
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({})
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({})
  const customInputRef = useRef<HTMLInputElement>(null)

  const isInteractive = !!askQuestion && !tool.output
  const questions: AskQuestion[] = (tool.input?.questions as AskQuestion[]) || []
  const qaPairs = tool.output ? parseQAOutput(tool.output) : []

  useEffect(() => {
    if (!askQuestion) return
    const defaults: Record<number, string | string[]> = {}
    askQuestion.questions.forEach((q, i) => {
      if (q.options.length > 0) {
        defaults[i] = q.multiSelect ? [] : ''
      }
    })
    setSelections(defaults)
    setCustomMode({})
    setCustomInputs({})
  }, [askQuestion?.requestId])

  const handleSingleSelect = (qIndex: number, label: string) => {
    setSelections(prev => ({ ...prev, [qIndex]: label }))
  }

  const handleMultiSelect = (qIndex: number, label: string) => {
    setSelections(prev => {
      const current = (prev[qIndex] as string[]) || []
      const updated = current.includes(label)
        ? current.filter(l => l !== label)
        : [...current, label]
      return { ...prev, [qIndex]: updated }
    })
  }

  const handleEnableCustomMode = (qIndex: number) => {
    setCustomMode(prev => ({ ...prev, [qIndex]: true }))
    setCustomInputs(prev => ({ ...prev, [qIndex]: '' }))
    setSelections(prev => ({ ...prev, [qIndex]: '' }))
    setTimeout(() => customInputRef.current?.focus(), 50)
  }

  const handleCustomInputConfirm = (qIndex: number) => {
    const val = customInputs[qIndex]?.trim()
    if (val) {
      setSelections(prev => ({ ...prev, [qIndex]: val }))
    }
    setCustomMode(prev => ({ ...prev, [qIndex]: false }))
  }

  const handleSubmit = () => {
    if (!askQuestion || !onRespondAskQuestion) return
    const answers: Record<string, string> = {}
    askQuestion.questions.forEach((q, i) => {
      if (customMode[i]) {
        answers[q.question] = customInputs[i]?.trim() || ''
      } else {
        const sel = selections[i]
        if (Array.isArray(sel)) {
          answers[q.question] = sel.join(', ')
        } else {
          answers[q.question] = sel || ''
        }
      }
    })
    onRespondAskQuestion(askQuestion.requestId, answers)
  }

  const canSubmit = isInteractive && askQuestion
    ? askQuestion.questions.every((q, i) => {
        if (customMode[i]) return (customInputs[i]?.trim() || '').length > 0
        const sel = selections[i]
        if (q.multiSelect) return Array.isArray(sel) && sel.length > 0
        return typeof sel === 'string' && sel !== ''
      })
    : false

  const displayQuestions = isInteractive && askQuestion ? askQuestion.questions : questions

  return (
    <div className="ml-1 mt-1 space-y-1.5">
      {displayQuestions.map((q, qIdx) => (
        <div key={qIdx} className="rounded-lg p-2" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            {q.header && (
              <span className="inline-block px-1 py-px rounded text-[10px] font-medium" style={{
                backgroundColor: 'rgba(124, 58, 237, 0.12)',
                color: 'var(--color-primary, #7c3aed)',
              }}>
                {q.header}
              </span>
            )}
            {q.multiSelect && (
              <span className="text-[10px] px-1 py-px rounded-full" style={{
                backgroundColor: 'var(--color-surface-hover)',
                color: 'var(--color-text-muted)',
              }}>
                多选
              </span>
            )}
          </div>
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            {q.question}
          </div>
          {isInteractive ? (
            <div className="flex flex-wrap gap-1">
              {(q.options || []).map((opt, oIdx) => {
                const isSelected = q.multiSelect
                  ? ((selections[qIdx] as string[]) || []).includes(opt.label)
                  : selections[qIdx] === opt.label
                return (
                  <button
                    key={oIdx}
                    onClick={() => q.multiSelect ? handleMultiSelect(qIdx, opt.label) : handleSingleSelect(qIdx, opt.label)}
                    title={opt.description}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all duration-150 cursor-pointer"
                    style={{
                      borderColor: isSelected ? 'var(--color-primary, #7c3aed)' : 'var(--color-border)',
                      backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.12)' : 'transparent',
                      color: isSelected ? 'var(--color-primary, #7c3aed)' : 'var(--color-text)',
                    }}
                  >
                    {isSelected ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                    {opt.label}
                  </button>
                )
              })}
              <button
                onClick={() => handleEnableCustomMode(qIdx)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium cursor-pointer"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                <Pencil size={10} />
                其他...
              </button>
            </div>
          ) : (
            q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {q.options.map((opt, j) => (
                  <span key={j} title={opt.description} className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    {opt.label}
                  </span>
                ))}
              </div>
            )
          )}
        </div>
      ))}
      {isInteractive && (
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary, #7c3aed)', color: '#fff' }}
          >
            <Send size={11} />
            提交
          </button>
        </div>
      )}
      {qaPairs.length > 0 && (
        <div className="p-2 rounded space-y-1" style={{ backgroundColor: 'var(--color-code-bg)' }}>
          {qaPairs.map((qa, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <MessageSquare size={11} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
              <span style={{ color: 'var(--color-text-muted)' }}>{qa.question}: </span>
              <span className="font-medium" style={{ color: '#e2e8f0' }}>{qa.answer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 工具名判断 ──

function isAskUserQuestion(name: string) {
  return name === 'AskUserQuestion' || name === 'ask_user_question'
}

function isTodoWrite(name: string) {
  return name === 'TodoWrite' || name === 'todo_write'
}

// ── 主组件 ──

interface StreamingToolCardProps {
  tool: StreamingToolBlock
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
  /** 传入所有 TodoWrite 块用于合并渲染 */
  allTodoBlocks?: StreamingToolBlock[]
  /** 任务→工具映射（工具按任务分组） */
  taskToolsMap?: Map<string, StreamingToolBlock[]>
  projectId?: string
  projectCwd?: string
}

export const StreamingToolCard = memo(function StreamingToolCard({ tool, askQuestion, onRespondAskQuestion, allTodoBlocks, taskToolsMap, projectId, projectCwd }: StreamingToolCardProps) {
  const [expanded, setExpanded] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // TodoWrite 和 AskUserQuestion 默认展开
  const isTodo = isTodoWrite(tool.toolName)
  const isAsk = isAskUserQuestion(tool.toolName)
  const autoExpand = isTodo || isAsk

  // AskUserQuestion 出现时自动滚动到可见区域（确保提交按钮不被底部输入框遮挡）
  useEffect(() => {
    if (isAsk && askQuestion && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 100)
    }
  }, [isAsk, askQuestion])

  const statusIcon = () => {
    switch (tool.status) {
      case 'pending':
        return <Loader size={12} className="animate-spin text-[var(--color-primary)]" />
      case 'completed':
        return <Check size={12} className="text-[var(--color-success)]" />
      case 'error':
        return <XCircle size={12} className="text-[var(--color-error)]" />
    }
  }

  const filePath = extractFilePath(tool.input)
  const fullFilePath = (tool.input.file_path || tool.input.path || '') as string
  const isTaskTool = isTask(tool.toolName)
  const taskDesc = isTaskTool ? getTaskDescription(tool.input) : null

  const isExpanded = expanded || autoExpand

  // 格式化显示内容
  const formatInputContent = () => {
    if (isTaskTool) {
      const lines: string[] = []
      if (tool.input.description) lines.push(tool.input.description as string)
      if (tool.input.prompt) lines.push(tool.input.prompt as string)
      return lines.join('\n') || JSON.stringify(tool.input, null, 2)
    }
    if (tool.toolName === 'Bash' && tool.input?.command) {
      return tool.input.command as string
    }
    // 对于 Read/Write/Edit 只显示文件路径+内容摘要
    if (['Read', 'Write', 'Edit', 'MultiEdit'].includes(tool.toolName)) {
      const lines: string[] = []
      // 文件路径通过 FilePathAction 单独显示，这里不重复添加
      if (tool.input.content) {
        const content = tool.input.content as string
        const contentLines = content.split('\n').slice(0, 10).join('\n')
        lines.push(contentLines)
        if (content.split('\n').length > 10) lines.push('...')
      }
      if (tool.input.old_string) lines.push(`- ${tool.input.old_string}`)
      if (tool.input.new_string) lines.push(`+ ${tool.input.new_string}`)
      return lines.join('\n')
    }
    return JSON.stringify(tool.input, null, 2)
  }

  return (
    <div
      ref={cardRef}
      className="rounded-lg border transition-colors my-1"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: tool.status === 'error' ? 'var(--color-error)' : 'var(--color-border)',
        opacity: tool.status === 'error' ? 0.9 : 1,
      }}
    >
      {/* 头部行 — 单行高度 h-7 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 h-7 text-xs hover:bg-white/20 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        {statusIcon()}
        <span style={{ color: 'var(--color-text-muted)' }}>{getToolIcon(tool.toolName)}</span>
        {isTaskTool && taskDesc ? (
          <span className="text-[11px] truncate" style={{ color: 'var(--color-text)' }}>
            {taskDesc}
          </span>
        ) : (
          <span className="font-mono text-[11px] truncate" style={{ color: 'var(--color-text)' }}>
            {tool.toolName}
          </span>
        )}
        {filePath && projectId && fullFilePath ? (
          <FilePathAction filePath={fullFilePath} projectId={projectId} projectCwd={projectCwd} compact />
        ) : (
          filePath && (
            <span className="text-[10px] px-1 py-px rounded truncate max-w-[200px]" style={{
              backgroundColor: 'var(--color-surface-hover)',
              color: 'var(--color-text-muted)',
            }}>
              {filePath}
            </span>
          )
        )}
        <div className="flex-1" />
        {tool.status === 'pending' && tool.elapsedSeconds != null && tool.elapsedSeconds > 0 && (
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            {tool.elapsedSeconds < 60
              ? `${Math.round(tool.elapsedSeconds)}s`
              : `${Math.floor(tool.elapsedSeconds / 60)}m${Math.round(tool.elapsedSeconds % 60)}s`}
          </span>
        )}
        {tool.status === 'completed' && (
          <span className="text-[10px] shrink-0 text-[var(--color-success)]">done</span>
        )}
        {isAsk && !tool.output && askQuestion && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--color-primary, #7c3aed)' }}>
            待回答
          </span>
        )}
        {isExpanded ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1 ml-5">
          {/* TodoWrite */}
          {isTodo && <TodoWriteView tool={tool} allBlocks={allTodoBlocks} taskToolsMap={taskToolsMap} />}

          {/* AskUserQuestion */}
          {isAsk && (
            <AskUserQuestionView
              tool={tool}
              askQuestion={askQuestion}
              onRespondAskQuestion={onRespondAskQuestion}
            />
          )}

          {/* 通用工具：Input */}
          {!isTodo && !isAsk && tool.input && Object.keys(tool.input).length > 0 && (
            <div>
              <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Input
              </div>
              {fullFilePath && projectId && ['Read', 'Write', 'Edit', 'MultiEdit'].includes(tool.toolName) && (
                <FilePathAction filePath={fullFilePath} projectId={projectId} projectCwd={projectCwd} />
              )}
              {formatInputContent() && (
                <pre className="text-[11px] p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-all" style={{
                  backgroundColor: 'var(--color-code-bg)',
                  color: '#e2e8f0',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}>
                  {formatInputContent()}
                </pre>
              )}
            </div>
          )}

          {/* 通用工具：Output */}
          {!isTodo && !isAsk && tool.output && !NOISE_PATTERN.test(tool.output.trim()) && (
            <div>
              <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Output
              </div>
              <pre className="text-[11px] p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-all" style={{
                backgroundColor: 'var(--color-code-bg)',
                color: tool.isError ? 'var(--color-error)' : '#e2e8f0',
                maxHeight: '150px',
                overflowY: 'auto',
              }}>
                {tool.output.length > 500 ? tool.output.substring(0, 500) + '...' : tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
