'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { Check, X, Zap, SkipForward, Circle, Loader, ChevronDown, ChevronUp, Wrench, Pause } from 'lucide-react'
import type { WorkflowState, WorkflowStepState } from '@/hooks/useChat'

interface WorkflowProgressProps {
  workflowState: WorkflowState
}

// 动态计时 hook：每 100ms 更新一次
function useElapsed(startTime: number, active: boolean): number {
  const [elapsed, setElapsed] = useState(() => (Date.now() - startTime) / 1000)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      setElapsed((Date.now() - startTime) / 1000)
      return
    }
    let running = true
    const tick = () => {
      if (!running) return
      setElapsed((Date.now() - startTime) / 1000)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [startTime, active])

  return elapsed
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m${s}s`
}

// 步骤状态图标
function StepStatusIcon({ status }: { status: WorkflowStepState['status'] }) {
  switch (status) {
    case 'completed':
      return <Check size={14} className="text-emerald-500" />
    case 'running':
      return <Loader size={14} className="animate-spin text-[var(--color-primary)]" />
    case 'waiting_confirmation':
      return <Pause size={14} className="text-amber-500" />
    case 'failed':
      return <X size={14} className="text-red-500" />
    case 'skipped':
      return <SkipForward size={14} className="text-slate-400 dark:text-slate-500" />
    case 'pending':
    default:
      return <Circle size={14} className="text-slate-400 dark:text-slate-500" />
  }
}

// 单个步骤行
const StepRow = memo(function StepRow({
  step,
  index,
  workflowStartTime,
}: {
  step: WorkflowStepState
  index: number
  workflowStartTime: number
}) {
  const isRunning = step.status === 'running'
  const isCompleted = step.status === 'completed'
  const isFailed = step.status === 'failed'
  const isPending = step.status === 'pending'
  const isSkipped = step.status === 'skipped'
  const isWaitingConfirmation = step.status === 'waiting_confirmation'

  // 进行中步骤的动态计时 — 用 workflow startTime 做粗略估算
  // 实际上 step 没有自己的 startTime，用 duration（完成后才有）
  const showDuration = isCompleted || isFailed

  // 截取流式内容最后部分作为预览
  const contentPreview = step.streamingContent
    ? step.streamingContent.slice(-120).replace(/\n/g, ' ').trim()
    : ''

  return (
    <div
      className={`px-3 py-1.5 transition-colors ${
        isRunning
          ? 'bg-[var(--color-primary)]/[0.06]'
          : isWaitingConfirmation
            ? 'bg-amber-500/[0.06]'
            : ''
      }`}
      style={{
        opacity: (isCompleted && !isWaitingConfirmation) || isSkipped ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-2.5">
        <StepStatusIcon status={step.status} />
        <span
          className={`flex-1 text-xs truncate ${
            isRunning ? 'font-medium' : ''
          }`}
          style={{ color: isPending ? 'var(--color-text-muted)' : 'var(--color-text)' }}
        >
          {index + 1}. {step.stepName || step.stepId}
        </span>

        {/* 耗时 */}
        <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {showDuration && step.duration != null
            ? formatDuration(step.duration / 1000)
            : isRunning
              ? <RunningTimer />
              : isWaitingConfirmation
                ? '等待确认'
                : isPending
                  ? '待执行'
                  : null
          }
        </span>
      </div>

      {/* 运行中步骤：显示工具状态和流式内容预览 */}
      {isRunning && (
        <div className="mt-1 ml-[22px] space-y-1">
          {/* 工具执行状态 */}
          {step.activeToolName && (
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              <Wrench size={11} className="text-[var(--color-primary)] flex-shrink-0" />
              <span className="truncate">{step.activeToolName}</span>
              {step.activeToolElapsed != null && step.activeToolElapsed > 0 && (
                <span className="tabular-nums flex-shrink-0">{formatDuration(step.activeToolElapsed)}</span>
              )}
            </div>
          )}
          {/* 流式内容预览 */}
          {contentPreview && !step.activeToolName && (
            <div
              className="text-[11px] leading-relaxed truncate"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {contentPreview}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// 进行中步骤的动态计时器
function RunningTimer() {
  const [dots, setDots] = useState(1)

  useEffect(() => {
    const iv = setInterval(() => setDots(d => (d % 3) + 1), 500)
    return () => clearInterval(iv)
  }, [])

  return <span className="text-[var(--color-primary)]">{'.'.repeat(dots)}</span>
}

export const WorkflowProgress = memo(function WorkflowProgress({ workflowState }: WorkflowProgressProps) {
  const [collapsed, setCollapsed] = useState(false)

  const completedCount = workflowState.steps.filter(s => s.status === 'completed').length
  const failedCount = workflowState.steps.filter(s => s.status === 'failed').length
  const hasRunning = workflowState.steps.some(s => s.status === 'running')
  const hasWaiting = workflowState.steps.some(s => s.status === 'waiting_confirmation')
  const totalElapsed = useElapsed(workflowState.startTime, hasRunning)

  // 填充 pending 步骤：workflowState.steps 可能只有已开始的步骤
  // totalSteps 表示总数，补齐尚未 push 的 pending 步骤
  const displaySteps: (WorkflowStepState & { _index: number })[] = []
  for (let i = 0; i < workflowState.totalSteps; i++) {
    const existing = workflowState.steps[i]
    if (existing) {
      displaySteps.push({ ...existing, _index: i })
    } else {
      displaySteps.push({
        stepId: `pending_${i}`,
        stepName: undefined,
        status: 'pending',
        _index: i,
      })
    }
  }

  return (
    <div
      className="rounded-lg border overflow-hidden my-1 transition-colors"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: failedCount > 0 ? 'var(--color-error)' : 'var(--color-border)',
      }}
    >
      {/* 头部 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/20 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <Zap size={14} className="text-amber-500 flex-shrink-0" />
        <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
          {workflowState.commandName}
        </span>
        <div className="flex-1" />
        <span
          className="text-[11px] tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            color: 'var(--color-text-muted)',
          }}
        >
          {completedCount}/{workflowState.totalSteps}
        </span>
        {collapsed ? <ChevronDown size={12} className="flex-shrink-0" /> : <ChevronUp size={12} className="flex-shrink-0" />}
      </button>

      {/* 进度条 */}
      <div className="h-0.5 w-full" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${workflowState.totalSteps > 0 ? (completedCount / workflowState.totalSteps) * 100 : 0}%`,
            backgroundColor: failedCount > 0 ? 'var(--color-error)' : 'var(--color-success)',
          }}
        />
      </div>

      {/* 步骤列表 */}
      {!collapsed && (
        <div className="py-1">
          {displaySteps.map((step) => (
            <StepRow
              key={step.stepId}
              step={step}
              index={step._index}
              workflowStartTime={workflowState.startTime}
            />
          ))}
        </div>
      )}

      {/* 底部摘要 */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-t"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        <span>
          已完成 {completedCount}/{workflowState.totalSteps}
          {failedCount > 0 && <span className="text-red-500 ml-1">· {failedCount} 失败</span>}
        </span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">{formatDuration(totalElapsed)}</span>
        {hasRunning && (
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
            执行中
          </span>
        )}
        {!hasRunning && hasWaiting && (
          <span className="ml-auto flex items-center gap-1">
            <Pause size={10} className="text-amber-500" />
            等待确认
          </span>
        )}
      </div>
    </div>
  )
})
