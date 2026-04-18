'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { Eye, FileEdit, ListChecks, FilePlus, Pencil, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import type { ActivityData, FileChangeEntry } from '@/types/chat'
import ReactMarkdown from 'react-markdown'
import * as Diff from 'diff'

// ─── hljs 懒加载 ───

let _hljs: typeof import('highlight.js').default | null = null
let _hljsLoading: Promise<typeof import('highlight.js').default> | null = null
function getHljs(): Promise<typeof import('highlight.js').default> {
  if (_hljs) return Promise.resolve(_hljs)
  if (!_hljsLoading) {
    _hljsLoading = import('highlight.js').then(m => { _hljs = m.default; return _hljs })
  }
  return _hljsLoading
}

function guessLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    kt: 'kotlin', swift: 'swift', c: 'c', cpp: 'cpp', h: 'c',
    cs: 'csharp', php: 'php', sh: 'bash', css: 'css', scss: 'scss',
    sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml',
    html: 'html', htm: 'html', md: 'markdown',
  }
  return map[ext] || ''
}

// ─── 代码块：文本先渲染，hljs 后增强 ───

function CodeBlock({ code, filePath }: { code: string; filePath: string }) {
  const codeRef = useRef<HTMLElement>(null)
  const lang = guessLang(filePath)

  useEffect(() => {
    if (!codeRef.current || !lang) return
    let cancelled = false
    getHljs().then(hljs => {
      if (cancelled || !codeRef.current) return
      if (hljs.getLanguage(lang)) {
        try {
          codeRef.current.innerHTML = hljs.highlight(code, { language: lang }).value
        } catch {}
      }
    })
    return () => { cancelled = true }
  }, [code, lang])

  return (
    <pre className="text-xs whitespace-pre-wrap break-all max-h-80 overflow-y-auto p-2 rounded-md" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
      <code ref={codeRef} className={lang ? `language-${lang}` : ''}>{code}</code>
    </pre>
  )
}

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

// ─── 文件变更项 ───

// ─── 行级 diff（使用 diff 库）───

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const changes = Diff.diffLines(oldText, newText)
  const result: DiffLine[] = []
  for (const part of changes) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const text of lines) {
      if (part.added) {
        result.push({ type: 'add', text })
      } else if (part.removed) {
        result.push({ type: 'remove', text })
      } else {
        result.push({ type: 'context', text })
      }
    }
  }
  return result
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 构建 diff 行的 HTML（带行号、背景色和前缀标记）
function buildDiffRows(lines: DiffLine[], htmlLines: string[] | null, startLine?: number): string {
  // startLine 是 old_string 在原文件中的起始行号
  let oldLine = startLine ?? 1
  let newLine = startLine ?? 1
  const numStyle = 'min-width:2.5rem;flex-shrink:0;text-align:right;user-select:none;font-size:0.75rem;padding-right:0.25rem;color:#6b7280'
  return lines.map((line, i) => {
    const isRemove = line.type === 'remove'
    const isAdd = line.type === 'add'
    const bg = isRemove ? 'rgba(239,68,68,0.12)' : isAdd ? 'rgba(16,185,129,0.12)' : 'transparent'
    const prefixColor = isRemove ? '#dc2626' : isAdd ? '#059669' : '#6b7280'
    const prefix = isRemove ? '−' : isAdd ? '+' : ' '
    const content = htmlLines?.[i] ?? escapeHtml(line.text)
    // 行号只在对应侧递增
    const oldNum = isAdd ? '' : String(oldLine)
    const newNum = isRemove ? '' : String(newLine)
    if (!isAdd) oldLine++
    if (!isRemove) newLine++
    return `<div style="display:flex;line-height:1.625;background:${bg}">`
      + `<span style="${numStyle}">${oldNum}</span>`
      + `<span style="${numStyle}">${newNum}</span>`
      + `<span style="color:${prefixColor};width:1.25rem;flex-shrink:0;text-align:center;user-select:none;font-size:0.75rem">${prefix}</span>`
      + `<span style="white-space:pre-wrap;word-break:break-all;font-size:0.75rem">${content}</span>`
      + `</div>`
  }).join('')
}

function DiffView({ diffLines, filePath, startLine }: { diffLines: DiffLine[]; filePath: string; startLine?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lang = guessLang(filePath)
  const plainText = useMemo(() => diffLines.map(l => l.text).join('\n'), [diffLines])
  const plainHtml = useMemo(() => buildDiffRows(diffLines, null, startLine), [diffLines, startLine])

  // hljs 高亮后替换整个内容
  useEffect(() => {
    if (!containerRef.current) return
    if (!lang) return
    let cancelled = false
    getHljs().then(hljs => {
      if (cancelled || !containerRef.current) return
      if (!hljs.getLanguage(lang)) return
      try {
        const highlighted = hljs.highlight(plainText, { language: lang, ignoreIllegals: true }).value
        if (cancelled) return
        const htmlLines = highlighted.split('\n')
        containerRef.current.innerHTML = buildDiffRows(diffLines, htmlLines, startLine)
      } catch { /* ignore */ }
    })
    return () => { cancelled = true }
  }, [plainText, lang, diffLines])

  return (
    <div
      ref={containerRef}
      className="hljs text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto rounded-md"
      style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
      dangerouslySetInnerHTML={{ __html: plainHtml }}
    />
  )
}

// ─── 文件变更项 ───

function FileChangeItem({ entry }: { entry: FileChangeEntry }) {
  const [expanded, setExpanded] = useState(false)
  const fileName = entry.filePath.split('/').pop() || entry.filePath
  const isWrite = entry.type === 'write'

  // 准备 diff 数据
  let diffLines: DiffLine[] | null = null
  let writeLines: DiffLine[] | null = null

  if (isWrite) {
    const content = truncate(entry.content)
    if (content) {
      writeLines = content.split('\n').map(text => ({ type: 'add' as const, text }))
    }
  } else {
    const oldStr = truncate(entry.oldString)
    const newStr = truncate(entry.newString)
    if (oldStr || newStr) {
      diffLines = computeDiff(oldStr || '', newStr || '')
    }
  }

  const hasContent = !!(writeLines || diffLines)

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors"
      >
        <StatusIcon status={entry.status} />
        {isWrite ? (
          <FilePlus size={12} className="text-emerald-500 shrink-0" />
        ) : (
          <Pencil size={12} className="text-amber-500 shrink-0" />
        )}
        <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--color-text)' }} title={entry.filePath}>
          {fileName}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{
          backgroundColor: isWrite ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
          color: isWrite ? 'var(--color-success)' : 'var(--color-warning)',
        }}>
          {isWrite ? '创建' : '编辑'}
        </span>
        {expanded ? <ChevronDown size={12} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />}
      </button>
      {expanded && (
        <div className="border-t p-2" style={{ borderColor: 'var(--color-border)' }}>
          {hasContent ? (
            <DiffView diffLines={writeLines || diffLines!} filePath={entry.filePath} startLine={entry.startLine} />
          ) : (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>无详细内容</span>
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
              {fileChanges.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {[...fileChanges].reverse().map(entry => (
              <FileChangeItem key={entry.toolUseId} entry={entry} />
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
