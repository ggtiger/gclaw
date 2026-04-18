'use client'

import { useRef, useEffect, useState } from 'react'
import { Eye, FileEdit, ListChecks, FilePlus, Pencil, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import type { ActivityData, FileChangeEntry } from '@/types/chat'
import ReactMarkdown from 'react-markdown'
import { DiffEditor } from './files/editors'

// ─── 截断工具 ───

const MAX_CHARS = 5000
function truncate(text: string | undefined): string {
  if (!text) return ''
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n... (已截断)' : text
}

// ─── 状态图标 ───

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
    case 'error': return <XCircle size={12} className="text-red-500 shrink-0" />
    default: return <Loader2 size={12} className="text-blue-500 shrink-0 animate-spin" />
  }
}

// ─── 简易 todo 状态图标 ───

function todoStatusIcon(status: string) {
  const s = status.toLowerCase()
  if (s === 'completed' || s === 'done') return <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
  if (s === 'in_progress') return <Loader2 size={12} className="text-blue-500 shrink-0 animate-spin" />
  return <div className="w-3 h-3 rounded-full border shrink-0" style={{ borderColor: 'var(--color-border)' }} />
}

// ─── 同文件变更合并 ───

function groupFileChanges(entries: FileChangeEntry[]): { filePath: string; items: FileChangeEntry[] }[] {
  const map = new Map<string, FileChangeEntry[]>()
  for (const entry of entries) {
    const arr = map.get(entry.filePath)
    if (arr) arr.push(entry)
    else map.set(entry.filePath, [entry])
  }
  // 按每组最新操作时间倒序
  return Array.from(map.entries())
    .map(([filePath, items]) => ({ filePath, items }))
    .sort((a, b) => {
      const aLast = a.items[a.items.length - 1].timestamp
      const bLast = b.items[b.items.length - 1].timestamp
      return bLast.localeCompare(aLast)
    })
}

// ─── 文件变更项（支持多条合并） ───

function FileChangeItem({ entries }: { entries: FileChangeEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const first = entries[0]
  const fileName = first.filePath.split('/').pop() || first.filePath

  // 合并状态：任一 error → error，全部 completed → completed，否则 pending
  const hasError = entries.some(e => e.status === 'error')
  const allCompleted = entries.every(e => e.status === 'completed')
  const mergedStatus = hasError ? 'error' : allCompleted ? 'completed' : 'pending'

  const hasWrite = entries.some(e => e.type === 'write')

  // 合并 diff 内容
  let oldContent: string
  let newContent: string
  let startLine: number | undefined

  if (hasWrite) {
    // Write 操作：取最后一次写入的完整内容
    const lastWrite = [...entries].reverse().find(e => e.type === 'write')
    oldContent = ''
    newContent = truncate(lastWrite?.content) || ''
    startLine = undefined
  } else if (entries.length === 1) {
    oldContent = truncate(first.oldString) || ''
    newContent = truncate(first.newString) || ''
    startLine = first.startLine
  } else {
    // 多条 edit：按 startLine 排序后拼接 old/new
    const sorted = [...entries].sort((a, b) => (a.startLine || 0) - (b.startLine || 0))
    oldContent = sorted.map(e => truncate(e.oldString) || '').join('\n')
    newContent = sorted.map(e => truncate(e.newString) || '').join('\n')
    startLine = sorted[0].startLine
  }

  const hasContent = !!(oldContent || newContent)

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors"
      >
        <StatusIcon status={mergedStatus} />
        {hasWrite ? (
          <FilePlus size={12} className="text-emerald-500 shrink-0" />
        ) : (
          <Pencil size={12} className="text-amber-500 shrink-0" />
        )}
        <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--color-text)' }} title={first.filePath}>
          {fileName}
        </span>
        {entries.length > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{
            backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)'
          }}>
            ×{entries.length}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{
          backgroundColor: hasWrite ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
          color: hasWrite ? 'var(--color-success)' : 'var(--color-warning)',
        }}>
          {hasWrite ? '创建' : '编辑'}
        </span>
        {expanded ? <ChevronDown size={12} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />}
      </button>
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
          {hasContent ? (
            <div style={{ height: Math.min(Math.max(newContent.split('\n').length * 20 + 60, 120), 400) }}>
              <DiffEditor
                oldContent={oldContent}
                newContent={newContent}
                fileName={first.filePath}
                readOnly
                startLine={startLine}
              />
            </div>
          ) : (
            <div className="p-2">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>无详细内容</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ───

interface ActivityPanelProps {
  activityData: ActivityData
}

export default function ActivityPanel({ activityData }: ActivityPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { planContent, fileChanges, todos } = activityData
  const hasData = !!planContent || fileChanges.length > 0 || todos.length > 0

  // 自动滚动到最新变更
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [fileChanges.length, todos.length, planContent])

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <Eye size={28} style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>暂无执行动态</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>发送消息后，AI 的操作将在此实时展示</span>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-2.5 p-2.5 overflow-y-auto h-full">
      {/* 设计方案区域 */}
      {planContent && (
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Eye size={13} style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>设计方案</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <ReactMarkdown>{planContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 文件变更区域 */}
      {fileChanges.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <FileEdit size={13} style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>文件变更</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
              {new Set(fileChanges.map(f => f.filePath)).size}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {groupFileChanges(fileChanges).map(group => (
              <FileChangeItem key={group.filePath} entries={group.items} />
            ))}
          </div>
        </div>
      )}

      {/* 任务进度区域 */}
      {todos.length > 0 && (
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <ListChecks size={13} style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>任务进度</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
              {todos.filter(t => t.status === 'completed').length}/{todos.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {todos.map((todo, i) => (
              <div key={todo.id || i} className="flex items-start gap-1.5">
                <div className="mt-0.5">{todoStatusIcon(todo.status)}</div>
                <span className="text-xs leading-relaxed" style={{
                  color: todo.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text)',
                  textDecorationLine: todo.status === 'completed' ? 'line-through' : 'none',
                }}>
                  {todo.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
