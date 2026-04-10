'use client'

import { memo, useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, ChevronUp, Loader, Check, XCircle, Terminal, ListTodo, Circle, Clock, Ban, HelpCircle, MessageSquare, CheckCircle2, Send, Pencil } from 'lucide-react'
import type { ToolSummary, ToolCallItem, AskUserQuestionRequest } from '@/types/chat'

interface ToolCallSummaryProps {
  summary: ToolSummary
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
}

// ── TodoWrite 专用渲染 ──

interface TodoItem {
  id?: string
  content: string
  status: string  // 兼容大小写: PENDING/pending, IN_PROGRESS/in_progress 等
}

// 规范化 status 为大写格式
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
      return <Check size={14} className="text-[var(--color-success)]" />
    case 'IN_PROGRESS':
      return <Clock size={14} className="text-[var(--color-primary)] animate-pulse" />
    case 'CANCELLED':
      return <Ban size={14} className="text-[var(--color-text-muted)]" />
    default: // PENDING
      return <Circle size={14} className="text-[var(--color-text-muted)]" />
  }
}

function TodoStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    PENDING: { label: '待处理', color: 'var(--color-text-muted)', bg: 'var(--color-surface-hover)' },
    IN_PROGRESS: { label: '进行中', color: 'var(--color-primary)', bg: 'color-mix(in srgb, var(--color-primary) 15%, transparent)' },
    COMPLETE: { label: '已完成', color: 'var(--color-success)', bg: 'color-mix(in srgb, var(--color-success) 15%, transparent)' },
    CANCELLED: { label: '已取消', color: 'var(--color-text-muted)', bg: 'var(--color-surface-hover)' },
  }
  const c = config[status] || config.PENDING
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: c.color, backgroundColor: c.bg }}>
      {c.label}
    </span>
  )
}

function TodoWriteView({ tools }: { tools: ToolCallItem[] }) {
  // 按调用顺序合并所有 todo_write 的 todos，模拟 merge 逻辑
  const mergedMap = new Map<string, TodoItem>()

  for (const tool of tools) {
    // 跳过 input 还未填充的 tool（content_block_start 阶段 input 为空）
    const todos = (tool.input?.todos as TodoItem[]) || []
    if (todos.length === 0) continue

    const merge = tool.input?.merge as boolean

    if (!merge) {
      // merge=false: 替换全部
      mergedMap.clear()
    }
    let idx = 0
    for (const todo of todos) {
      // 生成稳定 key：优先用 id，其次用 content hash，最后用索引
      const key = todo.id || `_auto_${todo.content?.slice(0, 30) || idx}`
      const normalized = { ...todo, id: key, status: normalizeStatus(todo.status || 'PENDING') }
      const existing = mergedMap.get(key)
      if (existing) {
        mergedMap.set(key, { ...existing, ...normalized })
      } else {
        mergedMap.set(key, normalized)
      }
      idx++
    }
  }

  const todos = Array.from(mergedMap.values())
  if (todos.length === 0) return null

  const completed = todos.filter(t => t.status === 'COMPLETE').length
  const inProgress = todos.filter(t => t.status === 'IN_PROGRESS').length
  const total = todos.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const isUpdating = tools.some(t => t.status === 'pending')

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {isUpdating ? (
          <Loader size={14} className="animate-spin text-[var(--color-primary)]" />
        ) : (
          <ListTodo size={14} className="text-[var(--color-primary)]" />
        )}
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          任务计划
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {completed}/{total} 完成
          {inProgress > 0 && ` · ${inProgress} 进行中`}
        </span>
        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full overflow-hidden ml-1" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: 'var(--color-success)' }}
          />
        </div>
      </div>
      {/* Todo list */}
      <div className="px-3 pb-2 space-y-1">
        {todos.map(todo => (
          <div
            key={todo.id}
            className="flex items-start gap-2 py-1 px-2 rounded text-xs"
            style={{
              backgroundColor: todo.status === 'IN_PROGRESS' ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
              opacity: todo.status === 'CANCELLED' ? 0.5 : 1,
            }}
          >
            <div className="mt-0.5 shrink-0">
              <TodoStatusIcon status={todo.status} />
            </div>
            <span
              className="flex-1"
              style={{
                color: 'var(--color-text)',
                textDecoration: todo.status === 'CANCELLED' ? 'line-through' : 'none',
              }}
            >
              {todo.content}
            </span>
            <TodoStatusBadge status={todo.status} />
          </div>
        ))}
      </div>
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

// 解析 SDK 返回的 output: "User has answered your questions: "Q1"="A1". "Q2"="A2". You can now continue..."
function parseQAOutput(output: string): { question: string; answer: string }[] {
  const qaPairs: { question: string; answer: string }[] = []
  const regex = /"([^"]+)"="([^"]*)"/g
  let match
  while ((match = regex.exec(output)) !== null) {
    qaPairs.push({ question: match[1], answer: match[2] })
  }
  return qaPairs
}

function AskUserQuestionRow({ tool, askQuestion, onRespondAskQuestion }: {
  tool: ToolCallItem
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
}) {
  const [expanded, setExpanded] = useState(true) // 默认展开
  const [selections, setSelections] = useState<Record<number, string | string[]>>({})
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({})
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({})
  const customInputRef = useRef<HTMLInputElement>(null)

  const isInteractive = !!askQuestion && !tool.output
  const questions: AskQuestion[] = (tool.input?.questions as AskQuestion[]) || []
  const qaPairs = tool.output ? parseQAOutput(tool.output) : []

  // 初始化交互默认选择
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

  const statusIcon = () => {
    switch (tool.status) {
      case 'pending':
        return <Loader size={14} className="animate-spin text-[var(--color-primary)]" />
      case 'completed':
        return <Check size={14} className="text-[var(--color-success)]" />
      case 'error':
        return <XCircle size={14} className="text-[var(--color-error)]" />
    }
  }

  // ── 交互逻辑 ──
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

  const handleCancelCustomMode = (qIndex: number) => {
    setCustomMode(prev => ({ ...prev, [qIndex]: false }))
    setCustomInputs(prev => ({ ...prev, [qIndex]: '' }))
    setSelections(prev => ({ ...prev, [qIndex]: '' }))
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

  // 交互模式的问题来源用 askQuestion（SSE 实时数据比 tool.input 更完整）
  const displayQuestions = isInteractive && askQuestion ? askQuestion.questions : questions

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      {/* Header — 与 ToolCallRow 同结构 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/20 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        {statusIcon()}
        <HelpCircle size={14} className="text-[var(--color-text-muted)]" />
        <span className="text-xs flex-1 text-left truncate" style={{ color: 'var(--color-text)' }}>
          AskUserQuestion
        </span>
        {qaPairs.length > 0 && !isInteractive && (
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {qaPairs.length} 个回答
          </span>
        )}
        {isInteractive && (
          <span className="text-[10px]" style={{ color: 'var(--color-primary, #7c3aed)' }}>
            待回答
          </span>
        )}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Input: 问题选项 */}
          {displayQuestions.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Input
              </div>
              <div className="space-y-2">
                {displayQuestions.map((q, qIdx) => (
                  <div key={qIdx} className="rounded-lg p-2" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {q.header && (
                        <span
                          className="inline-block px-1.5 py-px rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent)',
                            color: 'var(--color-primary, #7c3aed)',
                          }}
                        >
                          {q.header}
                        </span>
                      )}
                      {q.multiSelect && (
                        <span className="text-[10px] px-1.5 py-px rounded-full" style={{
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
                    {/* 交互 or 只读 */}
                    {isInteractive ? (
                      customMode[qIdx] ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={customInputRef}
                            type="text"
                            value={customInputs[qIdx] || ''}
                            onChange={e => setCustomInputs(prev => ({ ...prev, [qIdx]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleCustomInputConfirm(qIdx) }}
                            placeholder="输入你的回答..."
                            className="flex-1 text-xs px-2 py-1 rounded-md border outline-none"
                            style={{
                              borderColor: 'var(--color-primary, #7c3aed)',
                              backgroundColor: 'var(--color-surface)',
                              color: 'var(--color-text)',
                            }}
                          />
                          <button
                            onClick={() => handleCustomInputConfirm(qIdx)}
                            disabled={!customInputs[qIdx]?.trim()}
                            className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ backgroundColor: 'var(--color-primary, #7c3aed)', color: '#fff' }}
                          >
                            确认
                          </button>
                          <button
                            onClick={() => handleCancelCustomMode(qIdx)}
                            className="px-2 py-1 rounded-md text-[11px] cursor-pointer"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
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
                                  backgroundColor: isSelected
                                    ? 'color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent)'
                                    : 'transparent',
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
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all duration-150 cursor-pointer"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                          >
                            <Pencil size={10} />
                            其他...
                          </button>
                        </div>
                      )
                    ) : (
                      q.options && q.options.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {q.options.map((opt, j) => (
                            <span
                              key={j}
                              title={opt.description}
                              className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium"
                              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                            >
                              {opt.label}
                            </span>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
              {/* 提交按钮 */}
              {isInteractive && (
                <div className="flex justify-end mt-2">
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
            </div>
          )}

          {/* Output: Q&A 回答 */}
          {qaPairs.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Output
              </div>
              <div className="space-y-1 p-2 rounded" style={{ backgroundColor: 'var(--color-code-bg)' }}>
                {qaPairs.map((qa, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <MessageSquare size={12} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>{qa.question}: </span>
                      <span className="font-medium" style={{ color: '#e2e8f0' }}>{qa.answer}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 通用工具行 ──

function ToolCallRow({ tool }: { tool: ToolCallItem }) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = () => {
    switch (tool.status) {
      case 'pending':
        return <Loader size={14} className="animate-spin text-[var(--color-primary)]" />
      case 'completed':
        return <Check size={14} className="text-[var(--color-success)]" />
      case 'error':
        return <XCircle size={14} className="text-[var(--color-error)]" />
    }
  }

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/20 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        {statusIcon()}
        <Terminal size={14} className="text-[var(--color-text-muted)]" />
        <span className="font-mono text-xs flex-1 text-left truncate" style={{ color: 'var(--color-text)' }}>
          {tool.toolName}
        </span>
        {tool.status === 'pending' && tool.elapsedSeconds != null && tool.elapsedSeconds > 0 && (
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            {tool.elapsedSeconds < 60
              ? `${Math.round(tool.elapsedSeconds)}s`
              : `${Math.floor(tool.elapsedSeconds / 60)}m${Math.round(tool.elapsedSeconds % 60)}s`}
          </span>
        )}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Input
              </div>
              <pre className="text-xs p-2 rounded overflow-x-auto" style={{ backgroundColor: 'var(--color-code-bg)', color: '#e2e8f0' }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Output
              </div>
              <pre className="text-xs p-2 rounded overflow-x-auto max-h-48" style={{
                backgroundColor: 'var(--color-code-bg)',
                color: tool.isError ? 'var(--color-error)' : '#e2e8f0',
              }}>
                {tool.output.length > 500 ? tool.output.substring(0, 500) + '...' : tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 判断工具名 ──

function isAskUserQuestion(name: string) {
  return name === 'AskUserQuestion' || name === 'ask_user_question'
}

function isTodoWrite(name: string) {
  return name === 'TodoWrite' || name === 'todo_write'
}

export const ToolCallSummary = memo(function ToolCallSummary({ summary, askQuestion, onRespondAskQuestion }: ToolCallSummaryProps) {
  const [collapsed, setCollapsed] = useState(false)

  const { todoTools, generalTools, pendingCount, completedCount, errorCount } = useMemo(() => {
    const allTools = [...summary.pendingTools, ...summary.completedTools]
    const todo = allTools.filter(t => isTodoWrite(t.toolName))
    const general = allTools.filter(t => !isTodoWrite(t.toolName))
    return {
      todoTools: todo,
      generalTools: general,
      pendingCount: general.filter(t => t.status === 'pending').length,
      completedCount: general.filter(t => t.status === 'completed').length,
      errorCount: general.filter(t => t.isError).length,
    }
  }, [summary.pendingTools, summary.completedTools])

  if (todoTools.length === 0 && generalTools.length === 0) return null

  return (
    <div className="space-y-2">
      {/* TodoWrite 专用卡片 */}
      {todoTools.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-white/20 dark:border-white/[0.06] bg-white/30 dark:bg-white/5">
          <TodoWriteView tools={todoTools} />
        </div>
      )}

      {/* 工具调用（含 AskUserQuestion） */}
      {generalTools.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-white/20 dark:border-white/[0.06] bg-white/30 dark:bg-white/5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
          >
            <Terminal size={16} className="text-[var(--color-primary)]" />
            <span style={{ color: 'var(--color-text)' }}>
              工具调用
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {pendingCount > 0 && `${pendingCount} 执行中`}
              {pendingCount > 0 && completedCount > 0 && ' / '}
              {completedCount > 0 && `${completedCount} 完成`}
              {errorCount > 0 && ` / ${errorCount} 失败`}
            </span>
            <div className="flex-1" />
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {!collapsed && (
            <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              {generalTools.map(tool =>
                isAskUserQuestion(tool.toolName) ? (
                  <AskUserQuestionRow
                    key={tool.toolUseId}
                    tool={tool}
                    askQuestion={askQuestion}
                    onRespondAskQuestion={onRespondAskQuestion}
                  />
                ) : (
                  <ToolCallRow key={tool.toolUseId} tool={tool} />
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
