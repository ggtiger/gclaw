'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronUp, Check, XCircle, Loader, Circle, Clock, Send, SkipForward } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { StreamingToolCard } from './StreamingToolCard'
import { AskQuestionDialog } from './AskQuestionDialog'
import type { StreamingWorkflowBlock, WorkflowBlockStep, WorkflowContentBlock, StreamingToolBlock, StepContentSegment, AskUserQuestionRequest } from '@/types/chat'

// 过滤 SDK 工具调用轮次中的占位文本（如 "(no content)"、"(no content)(no content)"）
const NOISE_PATTERN = /^[\s()]*(?:no content[\s()]*)+$/i
// 用于剥离内容中内嵌的 (no content) 子串
const NOISE_INLINE = /\(?no content\)?/gi

interface WorkflowStepsCardProps {
  block: StreamingWorkflowBlock | WorkflowContentBlock
  projectId?: string
  projectCwd?: string
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
}

// 判断步骤内容是否为短文本（可内联显示）
function isInlineContent(step: WorkflowBlockStep): boolean {
  if (!step.content || step.toolCalls?.length) return false
  const trimmed = step.content.trim()
  if (NOISE_PATTERN.test(trimmed)) return false
  return trimmed.length < 50 && !step.content.includes('\n')
}

export function WorkflowStepsCard({ block, projectId, projectCwd, askQuestion, onRespondAskQuestion }: WorkflowStepsCardProps) {
  // 只展开最后一个已完成步骤 + running/waiting_confirmation 步骤
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    // 找到最后一个已完成的步骤
    const lastCompletedIndex = [...block.steps].reverse().findIndex(s => s.status === 'completed' && (s.content || s.toolCalls?.length) && !isInlineContent(s))
    const lastCompletedStepId = lastCompletedIndex >= 0
      ? block.steps[block.steps.length - 1 - lastCompletedIndex].stepId
      : null
    block.steps.forEach(s => {
      if (s.status === 'running' || s.status === 'waiting_confirmation') {
        initial.add(s.stepId)
      }
      if (s.stepId === lastCompletedStepId) {
        initial.add(s.stepId)
      }
    })
    return initial
  })

  // 新步骤完成或开始运行时自动展开（只保留最后一个已完成步骤展开）
  useEffect(() => {
    setExpandedSteps(() => {
      const next = new Set<string>()
      // 找到最后一个已完成的步骤
      const lastCompletedIndex = [...block.steps].reverse().findIndex(s => s.status === 'completed' && (s.content || s.toolCalls?.length) && !isInlineContent(s))
      const lastCompletedStepId = lastCompletedIndex >= 0
        ? block.steps[block.steps.length - 1 - lastCompletedIndex].stepId
        : null
      for (const step of block.steps) {
        if (step.status === 'running' || step.status === 'waiting_confirmation') {
          next.add(step.stepId)
        }
        if (step.stepId === lastCompletedStepId) {
          next.add(step.stepId)
        }
      }
      return next
    })
  }, [block.steps.map(s => s.status).join(',')])

  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }, [])

  const completedCount = block.steps.filter(s => s.status === 'completed').length
  const totalCount = block.steps.length

  return (
    <div
      className="rounded-lg border overflow-hidden my-1"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
    >
      {/* Header */}
      <div
        className="flex items-center h-9 px-3"
        style={{ backgroundColor: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
          ⚡ {block.commandName || '工作流'}
        </span>
        <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Steps */}
      {block.steps.map((step, index) => (
        <StepRow
          key={step.stepId}
          step={step}
          index={index}
          expanded={expandedSteps.has(step.stepId)}
          onToggle={() => toggleStep(step.stepId)}
          projectId={projectId}
          projectCwd={projectCwd}
          isLast={step === block.steps[block.steps.length - 1]}
          askQuestion={step.status === 'waiting_confirmation' ? askQuestion : null}
          onRespondAskQuestion={onRespondAskQuestion}
        />
      ))}
    </div>
  )
}

// ── Step Row ──

interface StepRowProps {
  step: WorkflowBlockStep
  index: number
  expanded: boolean
  onToggle: () => void
  projectId?: string
  projectCwd?: string
  isLast: boolean
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
}

function isTodoWrite(name: string) {
  return name === 'TodoWrite' || name === 'todo_write'
}

function StepRow({ step, index, expanded, onToggle, projectId, projectCwd, isLast, askQuestion, onRespondAskQuestion }: StepRowProps) {
  // 剥离内容中的 (no content) 子串后再判断是否有有效内容
  const cleanContent = step.content ? step.content.replace(NOISE_INLINE, '').trim() : ''
  const hasContent = cleanContent.length > 0
  const hasToolCalls = !!(step.toolCalls && step.toolCalls.length > 0)
  const inline = isInlineContent(step)

  // 构建任务→子工具映射（与普通对话的 StreamingBlocksRenderer 逻辑一致）
  const { allTodoBlocks, nestedToolIds, taskToolsMap, lastTodoId } = useMemo(() => {
    const allTodoBlocks: StreamingToolBlock[] = []
    const nestedToolIds = new Set<string>()
    const taskToolsMap = new Map<string, StreamingToolBlock[]>()
    let currentTaskId: string | null = null
    let lastTodoId: string | null = null

    if (step.toolCalls) {
      for (const block of step.toolCalls) {
        if (isTodoWrite(block.toolName)) {
          allTodoBlocks.push(block)
          lastTodoId = block.toolUseId
          // 找出当前 IN_PROGRESS 的任务
          const todos = (block.input?.todos as Array<{ id?: string; content?: string; status?: string }>) || []
          const inProgress = todos.find(t => {
            const s = (t.status || '').toUpperCase()
            return s === 'IN_PROGRESS'
          })
          if (inProgress) {
            currentTaskId = inProgress.id || `_auto_${inProgress.content?.slice(0, 30)}`
            if (!taskToolsMap.has(currentTaskId)) {
              taskToolsMap.set(currentTaskId, [])
            }
          } else {
            currentTaskId = null
          }
        } else if (currentTaskId) {
          // 该工具属于当前 IN_PROGRESS 任务
          nestedToolIds.add(block.toolUseId)
          taskToolsMap.get(currentTaskId)!.push(block)
        }
      }
    }
    return { allTodoBlocks, nestedToolIds, taskToolsMap, lastTodoId }
  // 使用内容感知的依赖，避免数组原地置换时 useMemo 缓存过期
  }, [step.toolCalls, step.toolCalls?.length, step.toolCalls?.map(t => t.toolUseId).join(',')])

  // 短内容直接行内显示，不需要展开；无内容的已完成步骤也不显示箭头
  const canExpand = !inline && (hasContent || hasToolCalls || step.status === 'running' || step.status === 'waiting_confirmation')

  return (
    <div>
      {/* Step header row */}
      <div
        className={`flex items-center min-h-[36px] px-3 py-2 ${canExpand ? 'cursor-pointer hover:opacity-80' : ''} transition-opacity select-none`}
        style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--color-border)' }}
        onClick={canExpand ? onToggle : undefined}
      >
        {/* Status icon */}
        <StepStatusIcon status={step.status} />

        {/* Step number */}
        <span
          className="text-xs font-medium ml-2 px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
        >
          {index + 1}
        </span>

        {/* Step name */}
        <span
          className="text-sm font-medium ml-1.5 truncate"
          style={{ color: 'var(--color-text)' }}
        >
          {step.name}
        </span>

        {/* 短内容行内显示 */}
        {inline && (
          <span className="text-sm ml-2 truncate opacity-70" style={{ color: 'var(--color-text-muted)' }}>
            → {step.content!.trim()}
          </span>
        )}

        <span className="flex-1" />

        {/* Duration */}
        {step.duration != null && step.status !== 'running' && (
          <span className="text-xs mr-2 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            {formatDuration(step.duration)}
          </span>
        )}

        {/* Status badges */}
        {step.status === 'running' && (
          <span
            className="text-xs px-1.5 py-0.5 rounded mr-2 font-medium"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--color-primary)' }}
          >
            执行中
          </span>
        )}
        {step.status === 'waiting_confirmation' && (
          <span
            className="text-xs px-1.5 py-0.5 rounded mr-2 font-medium"
            style={{ backgroundColor: 'rgba(124, 58, 237, 0.15)', color: 'var(--color-primary)' }}
          >
            待回答
          </span>
        )}
        {step.status === 'completed' && !inline && (
          <span className="text-xs shrink-0 mr-2 text-[var(--color-success)]">done</span>
        )}
        {step.status === 'failed' && (
          <span className="text-xs shrink-0 mr-2 text-[var(--color-error)]">failed</span>
        )}

        {/* Chevron - 只有可展开的步骤才显示 */}
        {canExpand && (
          expanded
            ? <ChevronUp size={14} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
            : <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        )}
      </div>

      {/* Inline AskQuestion — 步骤等待用户输入时显示 */}
      {expanded && step.status === 'waiting_confirmation' && askQuestion && onRespondAskQuestion && (
        <div
          className="px-3 py-2"
          style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-hover)' }}
        >
          <AskQuestionDialog request={askQuestion} onRespond={onRespondAskQuestion} />
        </div>
      )}

      {/* Expanded content — 按推送顺序渲染（参考普通对话模式） */}
      {expanded && canExpand && (hasContent || hasToolCalls) && (
        <div
          className="px-3 py-2.5 space-y-1.5"
          style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-hover)' }}
        >
          {(() => {
            // 构建 toolUseId → StreamingToolBlock 查找表
            const toolMap = new Map<string, StreamingToolBlock>()
            if (step.toolCalls) {
              for (const t of step.toolCalls) toolMap.set(t.toolUseId, t)
            }

            // 如果有 orderedBlocks，按推送顺序渲染
            if (step.orderedBlocks && step.orderedBlocks.length > 0) {
              return step.orderedBlocks.map((seg, idx) => {
                if (seg.type === 'text') {
                  const text = seg.content.replace(NOISE_INLINE, '').trim()
                  if (!text) return null
                  return (
                    <div key={seg.id} className="text-sm" style={{ color: 'var(--color-text)' }}>
                      <MarkdownRenderer
                        content={text}
                        isStreaming={step.status === 'running' && idx === step.orderedBlocks!.length - 1}
                        projectId={projectId}
                        projectCwd={projectCwd}
                      />
                    </div>
                  )
                } else {
                  // tool_ref
                  const tool = toolMap.get(seg.toolUseId)
                  if (!tool) return null
                  // 隐藏已归入任务的子工具卡片
                  if (nestedToolIds.has(tool.toolUseId)) return null
                  // 多个 TodoWrite 只显示最后一个
                  if (isTodoWrite(tool.toolName) && lastTodoId && tool.toolUseId !== lastTodoId) return null
                  return (
                    <StreamingToolCard
                      key={tool.toolUseId}
                      tool={tool}
                      allTodoBlocks={allTodoBlocks.length > 0 ? allTodoBlocks : undefined}
                      taskToolsMap={taskToolsMap.size > 0 ? taskToolsMap : undefined}
                      projectId={projectId}
                      projectCwd={projectCwd}
                    />
                  )
                }
              })
            }

            // Fallback：旧数据无 orderedBlocks，先显示文字再显示工具
            return (
              <>
                {hasContent && (
                  <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                    <MarkdownRenderer content={cleanContent} isStreaming={step.status === 'running'} projectId={projectId} projectCwd={projectCwd} />
                  </div>
                )}
                {hasToolCalls && step.toolCalls!.map(tool => {
                  if (nestedToolIds.has(tool.toolUseId)) return null
                  if (isTodoWrite(tool.toolName) && lastTodoId && tool.toolUseId !== lastTodoId) return null
                  return (
                    <StreamingToolCard
                      key={tool.toolUseId}
                      tool={tool}
                      allTodoBlocks={allTodoBlocks.length > 0 ? allTodoBlocks : undefined}
                      taskToolsMap={taskToolsMap.size > 0 ? taskToolsMap : undefined}
                      projectId={projectId}
                      projectCwd={projectCwd}
                    />
                  )
                })}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Status Icon — matches StreamingToolCard style ──

function StepStatusIcon({ status }: { status: WorkflowBlockStep['status'] }) {
  switch (status) {
    case 'pending':
      return <Circle size={14} className="shrink-0 text-[var(--color-text-muted)]" />
    case 'running':
      return <Loader size={14} className="shrink-0 animate-spin text-[var(--color-primary)]" />
    case 'completed':
      return <Check size={14} className="shrink-0 text-[var(--color-success)]" />
    case 'failed':
      return <XCircle size={14} className="shrink-0 text-[var(--color-error)]" />
    case 'waiting_confirmation':
      return <Clock size={14} className="shrink-0 text-[var(--color-primary)]" />
  }
}

// ── Utility ──

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m${secs}s`
}
