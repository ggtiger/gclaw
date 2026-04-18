'use client'

import { useState, useCallback } from 'react'
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Undo2,
  Upload,
  Sparkles,
  Loader2,
  AlertCircle,
  Trash2,
  FileQuestion,
  Send,
} from 'lucide-react'
import type { GitStatusResponse, GitFileStatus } from '@/types/git'

interface GitPanelProps {
  projectId: string
  gitStatus: GitStatusResponse | null
  onRefresh: () => void
}

// ─── 文件状态标记 ───

function StatusLetter({ code }: { code: string }) {
  const map: Record<string, { color: string; label: string }> = {
    M: { color: 'text-amber-500', label: 'M' },
    A: { color: 'text-emerald-500', label: 'A' },
    D: { color: 'text-red-500', label: 'D' },
    R: { color: 'text-blue-500', label: 'R' },
    C: { color: 'text-purple-500', label: 'C' },
    '?': { color: 'text-emerald-500', label: 'U' },
    '!': { color: 'text-gray-400', label: '!' },
  }
  const s = map[code] || { color: 'text-gray-400', label: code }
  return <span className={`text-[10px] font-bold w-3 text-center ${s.color}`}>{s.label}</span>
}

// ─── 文件列表项 ───

function FileItem({
  file,
  onStage,
  onUnstage,
  onDiscard,
  showStage,
  showUnstage,
  showDiscard,
}: {
  file: GitFileStatus
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onDiscard?: (path: string) => void
  showStage?: boolean
  showUnstage?: boolean
  showDiscard?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  const handleAction = async (fn: (path: string) => void, path: string) => {
    setLoading(true)
    try { fn(path) } finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-[3px] group cursor-default transition-colors"
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <StatusLetter code={file.statusCode} />
      <span className="text-xs truncate" style={{ color: 'var(--color-text)' }}>{fileName}</span>
      {dirPath && <span className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{dirPath}</span>}
      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {loading && <Loader2 size={11} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
        {showStage && onStage && (
          <button onClick={() => handleAction(onStage, file.path)} className="p-0.5 rounded cursor-pointer hover:bg-emerald-500/10" title="暂存">
            <Plus size={12} className="text-emerald-500" />
          </button>
        )}
        {showUnstage && onUnstage && (
          <button onClick={() => handleAction(onUnstage, file.path)} className="p-0.5 rounded cursor-pointer hover:bg-amber-500/10" title="取消暂存">
            <Minus size={12} className="text-amber-500" />
          </button>
        )}
        {showDiscard && onDiscard && file.statusCode !== '?' && (
          <button onClick={() => handleAction(onDiscard, file.path)} className="p-0.5 rounded cursor-pointer hover:bg-red-500/10" title="丢弃更改">
            <Undo2 size={12} className="text-red-500" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 可折叠分组 ───

function FileGroup({
  title,
  files,
  count,
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  showStage,
  showUnstage,
  showDiscard,
  defaultOpen = true,
}: {
  title: string
  files: GitFileStatus[]
  count: number
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onDiscard?: (path: string) => void
  onStageAll?: () => void
  onUnstageAll?: () => void
  onDiscardAll?: () => void
  showStage?: boolean
  showUnstage?: boolean
  showDiscard?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (files.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1 px-3 py-1 select-none cursor-pointer"
        onClick={() => setOpen(!open)}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {open ? <ChevronDown size={12} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />}
        <span className="text-xs font-medium uppercase" style={{ color: 'var(--color-text-secondary)' }}>{title}</span>
        <span className="text-[10px] px-1 rounded-full"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>{count}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {onStageAll && (
            <button onClick={e => { e.stopPropagation(); onStageAll() }} className="p-0.5 rounded cursor-pointer hover:bg-emerald-500/10" title="全部暂存">
              <Plus size={12} className="text-emerald-500" />
            </button>
          )}
          {onUnstageAll && (
            <button onClick={e => { e.stopPropagation(); onUnstageAll() }} className="p-0.5 rounded cursor-pointer hover:bg-amber-500/10" title="全部取消暂存">
              <Minus size={12} className="text-amber-500" />
            </button>
          )}
          {onDiscardAll && (
            <button onClick={e => { e.stopPropagation(); onDiscardAll() }} className="p-0.5 rounded cursor-pointer hover:bg-red-500/10" title="全部丢弃">
              <Trash2 size={12} className="text-red-500" />
            </button>
          )}
        </div>
      </div>
      {open && files.map(f => (
        <FileItem key={f.path} file={f}
          onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard}
          showStage={showStage} showUnstage={showUnstage} showDiscard={showDiscard}
        />
      ))}
    </div>
  )
}

// ─── 主面板 ───

export default function GitPanel({ projectId, gitStatus, onRefresh }: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const gitAction = useCallback(async (action: string, filePath?: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, path: filePath }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '操作失败')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }, [projectId, onRefresh])

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    setCommitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', message: commitMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '提交失败')
      setCommitMessage('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setCommitting(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '推送失败')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '推送失败')
    } finally {
      setPushing(false)
    }
  }

  const handleUndoCommit = async () => {
    setUndoing(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo-commit' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '撤销失败')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤销失败')
    } finally {
      setUndoing(false)
    }
  }

  const handleGenerateMessage = async () => {
    if (!gitStatus || gitStatus.staged.length === 0) {
      setError('请先暂存要提交的文件')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const stagedFiles = gitStatus.staged.map(f => `${f.statusCode} ${f.path}`).join('\n')
      const prompt = `根据以下 git 暂存的文件变更，生成一条简洁的中文提交信息（仅返回提交信息文本，不要解释，不要用引号包裹）：\n${stagedFiles}`
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          projectId,
          options: { maxTokens: 200, temperature: 0.3 },
        }),
      })
      if (!res.ok || !res.body) throw new Error('生成失败')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let generated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'content' && evt.text) generated += evt.text
            } catch { /* skip */ }
          }
        }
      }
      if (generated.trim()) setCommitMessage(generated.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成提交信息失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleCommit()
    }
  }

  // ─── 非 git 仓库 ───
  if (gitStatus && !gitStatus.isGitRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <FileQuestion size={32} style={{ color: 'var(--color-text-muted)' }} />
        <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
          当前项目不是 Git 仓库
        </p>
        <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
          在项目目录中执行 <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>git init</code> 初始化
        </p>
      </div>
    )
  }

  const stagedFiles = gitStatus?.staged ?? []
  const unstagedFiles = gitStatus?.unstaged ?? []
  const untrackedFiles = gitStatus?.untracked ?? []
  const changesFiles = [...unstagedFiles, ...untrackedFiles]
  const totalChanges = stagedFiles.length + changesFiles.length

  return (
    <div className="flex flex-col h-full">
      {/* 头部：分支名 + 刷新 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--panel-border)' }}>
        {gitStatus?.branch ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <GitBranch size={13} style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>{gitStatus.branch}</span>
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>加载中...</span>
        )}
        <button onClick={onRefresh} className="p-1 rounded cursor-pointer ml-auto shrink-0"
          style={{ color: 'var(--color-text-secondary)' }} title="刷新">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-2 my-1 px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>
          <AlertCircle size={12} /> {error}
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer">&times;</button>
        </div>
      )}

      {/* 提交区 */}
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
        <textarea
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="提交信息..."
          rows={3}
          className="w-full text-xs rounded-md px-2 py-1.5 resize-none outline-none"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)', borderColor: 'transparent' }}
        />
        <div className="flex items-center gap-1 mt-1.5">
          <button
            onClick={handleGenerateMessage}
            disabled={generating || stagedFiles.length === 0}
            className="p-1 rounded cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--color-primary)' }} title="AI 生成提交信息"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
          <button
            onClick={handleCommit}
            disabled={committing || !commitMessage.trim() || stagedFiles.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-white cursor-pointer disabled:opacity-30 transition-colors"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {committing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            提交
          </button>
          <button onClick={handleUndoCommit} disabled={undoing}
            className="p-1 rounded cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--color-text-secondary)' }} title="撤销上次提交"
          >
            {undoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
          </button>
          {gitStatus?.hasRemote && (
            <button onClick={handlePush} disabled={pushing}
              className="p-1 rounded cursor-pointer disabled:opacity-30"
              style={{ color: 'var(--color-text-secondary)' }} title="推送"
            >
              {pushing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {totalChanges === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <GitBranch size={24} style={{ color: 'var(--color-text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>没有待提交的更改</span>
          </div>
        ) : (
          <>
            <FileGroup
              title="已暂存"
              files={stagedFiles}
              count={stagedFiles.length}
              onUnstage={(p) => gitAction('unstage', p)}
              onUnstageAll={() => gitAction('unstage-all')}
              showUnstage
            />
            <FileGroup
              title="更改"
              files={changesFiles}
              count={changesFiles.length}
              onStage={(p) => gitAction('stage', p)}
              onDiscard={(p) => gitAction('discard', p)}
              onStageAll={() => gitAction('stage-all')}
              onDiscardAll={() => gitAction('discard-all')}
              showStage
              showDiscard
            />
          </>
        )}
      </div>
    </div>
  )
}
