'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Code2,
  File,
  FileText,
  FolderOpen,
  Folder,
  AlertCircle,
  Loader2,
  FilePlus,
  FolderPlus,
  Upload,
  Download,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Maximize2,
  Minimize2,
  PanelRightClose,
  X,
  Copy,
  Scissors,
  ClipboardPaste,
  ExternalLink,
  MoreHorizontal,
  GitBranch,
  Plus,
  Minus,
  Undo2,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Upload as PushIcon,
  Send,
  Save,
  Sparkles,
  Check,
  ListTree,
  List,
} from 'lucide-react'
import type { TreeEntry, FilesPanelProps, MenuItem, ClipboardState } from './files/types'
import type { GitStatusResponse, GitFileStatus, GitDirInfo } from '@/types/git'
import { getFileCategory } from './files/types'
import { ContextMenu, TreeView } from './files/FileTree'
import { FileIconSm } from './files/FileTree'
import { ImagePreview, JitViewerPreview } from './files/previews'
import { HtmlEditor, CodeEditor, MarkdownEditor, TextEditor, DiffEditor } from './files/editors'
import type { EditorActions } from './files/editors'
import { isTauri, openWithSystemApp, revealInFinder, selectDirectory } from '@/lib/tauri'
import { useFilePreview } from '@/contexts/FilePreviewContext'

// ─── Git 状态标记字母 ───

function StatusLetter({ code }: { code: string }) {
  const map: Record<string, string> = { M: 'text-amber-500', A: 'text-emerald-500', D: 'text-red-500', R: 'text-blue-500', C: 'text-purple-500', '?': 'text-emerald-500', '!': 'text-gray-400' }
  return <span className={`text-[10px] font-bold w-3 text-center ${map[code] || 'text-gray-400'}`}>{code === '?' ? 'U' : code}</span>
}

// ─── Git 变更文件行 ───

function GitFileItem({
  file,
  onStage,
  onUnstage,
  onDiscard,
  onSelect,
  showStage,
  showUnstage,
  showDiscard,
  indent,
}: {
  file: GitFileStatus
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onDiscard?: (path: string) => void
  onSelect: (path: string) => void
  showStage?: boolean
  showUnstage?: boolean
  showDiscard?: boolean
  indent?: number
}) {
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = !indent && file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : ''

  return (
    <div className="flex items-center gap-1.5 py-[2px] group cursor-pointer transition-colors"
      style={{ paddingLeft: indent ? `${indent}px` : '8px', paddingRight: '8px' }}
      onClick={() => onSelect(file.path)}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <StatusLetter code={file.statusCode} />
      <span className="text-xs truncate" style={{ color: 'var(--color-text)' }}>{fileName}</span>
      {dirPath && <span className="text-[10px] truncate opacity-50" style={{ color: 'var(--color-text-muted)' }}>{dirPath}</span>}
      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {showStage && onStage && (
          <button onClick={e => { e.stopPropagation(); onStage(file.path) }} className="p-0.5 rounded cursor-pointer hover:bg-emerald-500/10" title="暂存">
            <Plus size={11} className="text-emerald-500" />
          </button>
        )}
        {showUnstage && onUnstage && (
          <button onClick={e => { e.stopPropagation(); onUnstage(file.path) }} className="p-0.5 rounded cursor-pointer hover:bg-amber-500/10" title="取消暂存">
            <Minus size={11} className="text-amber-500" />
          </button>
        )}
        {showDiscard && onDiscard && file.statusCode !== '?' && (
          <button onClick={e => { e.stopPropagation(); onDiscard(file.path) }} className="p-0.5 rounded cursor-pointer hover:bg-red-500/10" title="丢弃更改">
            <Undo2 size={11} className="text-red-500" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Git 变更文件树形展示 ───

interface GitTreeNode {
  name: string
  path: string
  files: GitFileStatus[]
  children: Map<string, GitTreeNode>
}

/** 将平铺文件列表按目录结构分组 */
function buildGitTree(files: GitFileStatus[]): GitTreeNode {
  const root: GitTreeNode = { name: '', path: '', files: [], children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/')
    if (parts.length === 1) {
      root.files.push(f)
    } else {
      let node = root
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join('/')
        if (!node.children.has(dir)) {
          node.children.set(dir, { name: parts[i], path: dir, files: [], children: new Map() })
        }
        node = node.children.get(dir)!
      }
      node.files.push(f)
    }
  }
  return root
}

function GitTreeGroup({
  node,
  depth,
  expandedDirs,
  onToggleDir,
  ...itemProps
}: {
  node: GitTreeNode
  depth: number
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onDiscard?: (path: string) => void
  onSelect: (path: string) => void
  showStage?: boolean
  showUnstage?: boolean
  showDiscard?: boolean
}) {
  const sortedChildren = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
  const sortedFiles = [...node.files].sort((a, b) => {
    const na = a.path.split('/').pop() || ''
    const nb = b.path.split('/').pop() || ''
    return na.localeCompare(nb)
  })

  return (
    <>
      {sortedChildren.map(child => {
        const isExpanded = expandedDirs.has(child.path)
        // 计算子树中的变更文件数
        const count = countFiles(child)
        return (
          <div key={child.path}>
            <div className="flex items-center gap-1 cursor-pointer group transition-colors"
              style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '8px' }}
              onClick={() => onToggleDir(child.path)}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {isExpanded
                ? <ChevronDown size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                : <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              }
              <Folder size={12} className="text-blue-500 shrink-0" />
              <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{child.name}</span>
              <span className="text-[10px] ml-auto shrink-0" style={{ color: 'var(--color-text-muted)' }}>{count}</span>
            </div>
            {isExpanded && (
              <GitTreeGroup node={child} depth={depth + 1} expandedDirs={expandedDirs} onToggleDir={onToggleDir} {...itemProps} />
            )}
          </div>
        )
      })}
      {sortedFiles.map(f => (
        <div key={f.path} style={{ paddingLeft: `${(depth + (sortedChildren.length > 0 ? 0 : 0)) * 0}px` }}>
          <GitFileItem file={f} {...itemProps} indent={depth * 12 + 12} />
        </div>
      ))}
    </>
  )
}

function countFiles(node: GitTreeNode): number {
  let n = node.files.length
  for (const child of node.children.values()) n += countFiles(child)
  return n
}

// ─── 主组件 ───

export default function FilesPanel({
  projectId, onToggleFullscreen, isFullscreen, onHide, hideHeaderButtons, refreshKey,
  diffFilePath, onDiffFileConsumed,
  previewFilePath, onPreviewFileConsumed,
  sendToChat,
}: FilesPanelProps) {
  // 文件树
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const filePreviewCtx = useFilePreview()
  const [error, setError] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // 预览/编辑
  const [selectedFile, setSelectedFile] = useState<TreeEntry | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  // diff 预览模式
  const [diffOldContent, setDiffOldContent] = useState<string | null>(null)
  const [diffNewContent, setDiffNewContent] = useState<string | null>(null)

  // HTML 编辑器模式（外部控制）
  const [htmlMode, setHtmlMode] = useState<'edit' | 'preview' | 'split' | 'visual'>('split')
  // Markdown 编辑器模式（外部控制）
  const [mdMode, setMdMode] = useState<'edit' | 'preview' | 'split'>('split')
  // 图片缩放 + 旋转
  const [imageZoom, setImageZoom] = useState(1)
  const [imageRotation, setImageRotation] = useState(0)
  // 文件标签栏：自适应宽窄模式
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [compactMode, setCompactMode] = useState(false)
  const [mdExportOpen, setMdExportOpen] = useState(false)
  const [fileActionsOpen, setFileActionsOpen] = useState(false)

  useEffect(() => {
    const el = tabBarRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      setCompactMode(entries[0].contentRect.width < 580)
    })
    observer.observe(el)
    return () => observer.disconnect()
  })
  // 编辑器操作注册
  const editorActionsRef = useRef<EditorActions>({})
  const handleRegisterActions = useCallback((actions: EditorActions) => { editorActionsRef.current = actions }, [])

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)

  // 重命名
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // 新建
  const [creating, setCreating] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null)
  const [createValue, setCreateValue] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  // 上传
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const uploadDirRef = useRef('')

  // 剪贴板
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

  // 拖拽（鼠标事件方式）
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const draggedPathRef = useRef<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const dropTargetRef = useRef<string | null>(null)
  const mouseDragRef = useRef<{ sourcePath: string; startX: number; startY: number; active: boolean } | null>(null)
  const dragJustEndedRef = useRef(false)

  // 删除确认
  const [pendingDelete, setPendingDelete] = useState<TreeEntry | null>(null)

  const [treeWidth, setTreeWidth] = useState(180)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const splitDragRef = useRef(false)
  const splitStartXRef = useRef(0)
  const splitStartWidthRef = useRef(0)

  // Git 源码管理区域
  const [gitSectionOpen, setGitSectionOpen] = useState(true)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [generatingCommit, setGeneratingCommit] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [gitDirDropdownOpen, setGitDirDropdownOpen] = useState(false)
  const [switchingBranch, setSwitchingBranch] = useState(false)
  const [gitViewMode, setGitViewMode] = useState<'flat' | 'tree'>('flat')
  const [gitExpandedDirs, setGitExpandedDirs] = useState<Set<string>>(new Set(['']))

  // 多 git 目录管理
  const [gitDirs, setGitDirs] = useState<GitDirInfo[]>([])
  const [activeGitDir, setActiveGitDir] = useState<string | null>(null) // 相对路径
  const [activeGitStatus, setActiveGitStatus] = useState<GitStatusResponse | null>(null)
  const gitDirsMap = new Map(gitDirs.map(d => [d.path, d.branch]))

  // 工作目录（cwd）
  const [projectCwd, setProjectCwd] = useState<string>('')
  const [effectiveCwd, setEffectiveCwd] = useState<string>('')
  const [cwdDropdownOpen, setCwdDropdownOpen] = useState(false)
  const [cwdRefreshKey, setCwdRefreshKey] = useState(0)

  // 全屏切换时自动调整树宽度 + 刷新当前文件
  useEffect(() => {
    if (isFullscreen) {
      setTreeWidth(300)
    } else if (treeWidth > 220) {
      setTreeWidth(180)
    }
    if (selectedFile) {
      setPreviewKey(k => k + 1)
      loadFileContent(selectedFile)
    }
  }, [isFullscreen])

  // HTML 编辑器模式切换（含全屏切换）
  const handleHtmlModeChange = useCallback((newMode: 'edit' | 'preview' | 'split' | 'visual') => {
    if (newMode === 'visual' && !isFullscreen && onToggleFullscreen) {
      onToggleFullscreen()
    }
    setHtmlMode(newMode)
  }, [isFullscreen, onToggleFullscreen])

  // 退出全屏时自动切回分栏
  useEffect(() => {
    if (!isFullscreen && htmlMode === 'visual') {
      setHtmlMode('split')
    }
  }, [isFullscreen, htmlMode])

  // 文件切换时重置 HTML/Markdown 模式
  useEffect(() => {
    setHtmlMode('split')
    setMdMode('split')
    setImageZoom(1)
    setImageRotation(0)
    setFileActionsOpen(false)
    editorActionsRef.current = {}
  }, [selectedFile?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // 当前文件类型
  const selectedFileCategory = selectedFile ? getFileCategory(selectedFile.name) : null

  // ─── 加载当前工作目录（cwd）───
  useEffect(() => {
    async function loadCwd() {
      try {
        const res = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`)
        const data = await res.json()
        setProjectCwd(data.cwd || '')
        setEffectiveCwd(data.effectiveCwd || '')
      } catch { /* ignore */ }
    }
    loadCwd()
  }, [projectId])

  // 切换工作目录
  const handleChangeCwd = useCallback(async (newCwd: string) => {
    try {
      await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: newCwd }),
      })
      setProjectCwd(newCwd)
      setCwdDropdownOpen(false)
      // 触发文件树和 git 状态刷新
      setCwdRefreshKey(k => k + 1)
    } catch { /* ignore */ }
  }, [projectId])

  // 打开系统目录选择器
  const handleSelectDirectory = useCallback(async () => {
    const selected = await selectDirectory()
    if (selected) {
      await handleChangeCwd(selected)
    }
  }, [handleChangeCwd])

  // ─── 加载文件树 ───
  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files?action=tree`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '加载失败')
      setTree(data.tree || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文件树失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchTree() }, [fetchTree])

  // ─── cwd 切换后刷新文件树和 git 状态 ───
  useEffect(() => {
    if (cwdRefreshKey > 0) {
      fetchTree()
      // 重置 git 状态，让 scan 重新检测
      setGitDirs([])
      setActiveGitDir(null)
      setActiveGitStatus(null)
    }
  }, [cwdRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 外部刷新信号（AI 工具操作完成后触发）───
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      fetchTree()
      fetchGitStatus()
    }
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 外部请求 diff 预览（从动态面板点击文件）───
  useEffect(() => {
    if (!diffFilePath || !onDiffFileConsumed) return
    const fileName = diffFilePath.split('/').pop() || diffFilePath
    const entry: TreeEntry = { name: fileName, path: diffFilePath, type: 'file' }
    setSelectedFile(entry)
    setSelectedPath(diffFilePath)
    setPreviewKey(k => k + 1)
    setDiffOldContent(null)
    setDiffNewContent(null)
    setPreviewLoading(true)
    setPreviewError(null)
    // 通过文件 API 读取当前内容
    fetch(`/api/projects/${encodeURIComponent(projectId)}/files?action=read&path=${encodeURIComponent(diffFilePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.content !== undefined) {
          setPreviewContent(data.content)
          setDiffNewContent(data.content)
          // 尝试通过 git 获取旧版本做 diff
          if (activeGitDir) {
            const relPath = activeGitDir ? diffFilePath.replace(`${activeGitDir}/`, '') : diffFilePath
            fetch(`/api/projects/${encodeURIComponent(projectId)}/git?diff=${encodeURIComponent(relPath)}&dir=${encodeURIComponent(activeGitDir)}`)
              .then(r => r.json())
              .then(d => {
                if (d.oldContent !== undefined) setDiffOldContent(d.oldContent)
              })
              .catch(() => {})
          }
        } else {
          setPreviewError(data.error || '读取文件失败')
        }
      })
      .catch(err => setPreviewError(err instanceof Error ? err.message : '读取文件失败'))
      .finally(() => setPreviewLoading(false))
    onDiffFileConsumed()
  }, [diffFilePath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 外部请求文件预览（从聊天工具调用预览）───
  useEffect(() => {
    if (!previewFilePath || !onPreviewFileConsumed) return
    const fileName = previewFilePath.split('/').pop() || previewFilePath
    const entry: TreeEntry = { name: fileName, path: previewFilePath, type: 'file' }
    setSelectedFile(entry)
    setSelectedPath(previewFilePath)
    setPreviewKey(k => k + 1)
    setPreviewLoading(true)
    setPreviewError(null)
    setDiffOldContent(null)
    setDiffNewContent(null)
    fetch(`/api/projects/${encodeURIComponent(projectId)}/files?action=read&path=${encodeURIComponent(previewFilePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.content !== undefined) {
          setPreviewContent(data.content)
        } else {
          setPreviewError(data.error || '读取文件失败')
        }
      })
      .catch(err => setPreviewError(err instanceof Error ? err.message : '读取文件失败'))
      .finally(() => setPreviewLoading(false))
    onPreviewFileConsumed()
  }, [previewFilePath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 扫描 git 目录 ───
  const scanGitDirs = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git?scan`)
      const data: { gitDirs: GitDirInfo[] } = await res.json()
      setGitDirs(data.gitDirs || [])
      // 自动选中第一个（如果没有选中）
      if (data.gitDirs?.length > 0 && !activeGitDir) {
        setActiveGitDir(data.gitDirs[0].path)
      }
    } catch { /* ignore */ }
  }, [projectId, activeGitDir])

  useEffect(() => { scanGitDirs() }, [scanGitDirs])

  // ─── 获取活跃 git 目录的状态 ───
  const fetchGitStatus = useCallback(async (gitDir?: string | null) => {
    const dir = gitDir ?? activeGitDir
    if (dir === null && gitDirs.length === 0) return
    try {
      const params = dir ? `?dir=${encodeURIComponent(dir)}` : ''
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git${params}`)
      const data: GitStatusResponse = await res.json()
      setActiveGitStatus(data)
    } catch { /* ignore */ }
  }, [projectId, activeGitDir, gitDirs.length])

  useEffect(() => {
    if (activeGitDir !== null || gitDirs.length > 0) {
      fetchGitStatus()
    }
  }, [activeGitDir, gitDirs.length, fetchGitStatus])

  // ─── 分栏拖拽 ───
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!splitDragRef.current) return
      const diff = e.clientX - splitStartXRef.current
      const newWidth = Math.min(350, Math.max(100, splitStartWidthRef.current + diff))
      setTreeWidth(newWidth)
    }
    const handleUp = () => {
      if (!splitDragRef.current) return
      splitDragRef.current = false
      setIsDraggingSplit(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.getElementById('split-resize-overlay')?.remove()
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
  }, [])

  const handleSplitDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    splitDragRef.current = true
    splitStartXRef.current = e.clientX
    splitStartWidthRef.current = treeWidth
    setIsDraggingSplit(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const overlay = document.createElement('div')
    overlay.id = 'split-resize-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;'
    overlay.addEventListener('mousemove', (ev) => {
      if (!splitDragRef.current) return
      const diff = ev.clientX - splitStartXRef.current
      const newWidth = Math.min(350, Math.max(100, splitStartWidthRef.current + diff))
      setTreeWidth(newWidth)
    })
    overlay.addEventListener('mouseup', () => {
      splitDragRef.current = false
      setIsDraggingSplit(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      overlay.remove()
    })
    document.body.appendChild(overlay)
  }

  // ─── 文件操作 ───
  const fileAction = async (action: string, filePath?: string, newPath?: string, name?: string) => {
    const payload = { action, path: filePath, newPath, name }
    console.log('[FilesPanel] fileAction 请求:', payload)
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    console.log('[FilesPanel] fileAction 响应:', res.status, data)
    if (!res.ok) throw new Error(data.error || '操作失败')
    return data
  }

  // ─── Git 操作 ───
  const gitAction = useCallback(async (action: string, filePath?: string) => {
    setGitError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, path: filePath, dir: activeGitDir }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '操作失败')
      fetchGitStatus()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : '操作失败')
    }
  }, [projectId, activeGitDir, fetchGitStatus])

  const handleGenerateCommit = async () => {
    const staged = activeGitStatus?.staged ?? []
    if (staged.length === 0) {
      setGitError('请先暂存要提交的文件')
      return
    }
    setGeneratingCommit(true)
    setGitError(null)
    try {
      const stagedInfo = staged.map(f => `${f.statusCode} ${f.path}`).join('\n')
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: '你是一个 git 提交信息生成助手。根据暂存的文件变更，中文提交信息。仅返回提交信息文本，不要解释，不要用引号包裹。',
          user: stagedInfo,
          maxTokens: 2000,
          projectId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '生成失败')
      if (data.text) setCommitMessage(data.text)
    } catch (err) {
      setGitError(err instanceof Error ? err.message : '生成提交信息失败')
    } finally {
      setGeneratingCommit(false)
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    setCommitting(true)
    setGitError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', message: commitMessage.trim(), dir: activeGitDir }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '提交失败')
      setCommitMessage('')
      fetchGitStatus()
      fetchTree()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setCommitting(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    setGitError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push', dir: activeGitDir }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '推送失败')
      fetchGitStatus()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : '推送失败')
    } finally {
      setPushing(false)
    }
  }

  const handleCheckout = async (branchName: string) => {
    setSwitchingBranch(true)
    setGitError(null)
    setBranchDropdownOpen(false)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', path: branchName, dir: activeGitDir }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '切换分支失败')
      scanGitDirs()
      fetchGitStatus()
      fetchTree()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : '切换分支失败')
    } finally {
      setSwitchingBranch(false)
    }
  }

  // ─── 保存文件 ───
  const saveFile = async (content: string) => {
    if (!selectedFile) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', path: selectedFile.path, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败')
      setPreviewContent(content)
      // 保存成功后刷新文件树和 git 状态
      fetchTree()
      fetchGitStatus()
      // 如果在 diff 模式，更新 newContent 为最新保存内容
      if (diffOldContent !== null) {
        setDiffNewContent(content)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ─── 展开/折叠目录 ───
  const toggleFolder = (dirPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }

  // ─── 选择文件 ───
  const selectFile = async (entry: TreeEntry) => {
    setSelectedFile(entry)
    setSelectedPath(entry.path)
    setPreviewKey(k => k + 1)
    setDiffOldContent(null)
    setDiffNewContent(null)
    await loadFileContent(entry)
  }

  // 从 git 变更列表选择文件 → 显示 diff
  const selectGitFile = async (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath
    const fullPath = activeGitDir ? `${activeGitDir}/${filePath}` : filePath
    const entry: TreeEntry = { name: fileName, path: fullPath, type: 'file' }
    setSelectedFile(entry)
    setSelectedPath(fullPath)
    setPreviewKey(k => k + 1)
    setPreviewContent(null)
    setDiffOldContent(null)
    setDiffNewContent(null)
    setPreviewLoading(true)
    setPreviewError(null)

    try {
      // 判断是 staged 还是 unstaged/untracked
      const isStaged = activeGitStatus?.staged.some(f => f.path === filePath)
      const params = new URLSearchParams({ diff: filePath })
      if (activeGitDir) params.set('dir', activeGitDir)
      if (isStaged) params.set('staged', '1')
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/git?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '获取 diff 失败')
      setDiffOldContent(data.oldContent ?? null)
      setDiffNewContent(data.newContent ?? null)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '获取 diff 失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const loadFileContent = async (entry: TreeEntry) => {
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewContent(null)

    const category = getFileCategory(entry.name)
    if (category === 'image' || category === 'unknown' || category === 'pdf' || category === 'word' || category === 'excel' || category === 'ppt') {
      setPreviewLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files?action=read&path=${encodeURIComponent(entry.path)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '加载失败')
      setPreviewContent(data.content ?? '')
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '加载文件失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const refreshCurrentFile = () => {
    if (selectedFile) {
      setPreviewKey(k => k + 1)
      loadFileContent(selectedFile)
    } else {
      fetchTree()
    }
  }

  // ─── 本地打开 / 打开所在目录 ───
  const handleOpenLocal = async (entryPath: string) => {
    try {
      const data = await fileAction('resolve', entryPath)
      if (data.absolutePath) {
        await openWithSystemApp(data.absolutePath)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开失败')
    }
  }

  const handleRevealInDir = async (entryPath: string) => {
    try {
      const data = await fileAction('resolve', entryPath)
      if (data.absolutePath) {
        await revealInFinder(data.absolutePath)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开目录失败')
    }
  }

  // ─── 粘贴操作 ───
  const handlePaste = async (targetDir: string) => {
    if (!clipboard) return
    const { mode, sourcePath, sourceName } = clipboard
    const destPath = targetDir ? `${targetDir}/${sourceName}` : sourceName

    if (sourcePath === destPath) {
      setClipboard(null)
      return
    }

    try {
      if (mode === 'copy') {
        await fileAction('copy', sourcePath, destPath)
      } else {
        await fileAction('rename', sourcePath, destPath)
        setClipboard(null)
        if (selectedFile?.path === sourcePath) {
          setSelectedFile({ ...selectedFile, path: destPath })
          setSelectedPath(destPath)
        }
      }
      if (targetDir) {
        setExpandedFolders(prev => new Set(prev).add(targetDir))
      }
      fetchTree()
      fetchGitStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '粘贴失败')
    }
  }

  // ─── 拖拽移动文件（鼠标事件方式）───
  const moveFileCallbackRef = useRef<(srcPath: string, targetDir: string) => void>(() => {})
  moveFileCallbackRef.current = (srcPath: string, targetDir: string) => {
    const fileName = srcPath.split('/').pop()!
    const destPath = targetDir ? `${targetDir}/${fileName}` : fileName
    if (srcPath === destPath) return
    const srcDir = srcPath.includes('/') ? srcPath.substring(0, srcPath.lastIndexOf('/')) : ''
    if (srcDir === targetDir) return

    fileAction('rename', srcPath, destPath)
      .then(() => {
        if (targetDir) setExpandedFolders(prev => new Set(prev).add(targetDir))
        if (selectedFile?.path === srcPath) {
          setSelectedFile({ ...selectedFile, path: destPath })
          setSelectedPath(destPath)
        }
        fetchTree()
        fetchGitStatus()
      })
      .catch(err => {
        console.error('[FilesPanel] 移动失败:', err)
        setError(err instanceof Error ? err.message : '移动失败')
      })
  }

  const handleTreeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const el = (e.target as HTMLElement).closest('[data-entry-path]') as HTMLElement | null
    if (!el) return
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const entryPath = el.dataset.entryPath!
    mouseDragRef.current = { sourcePath: entryPath, startX: e.clientX, startY: e.clientY, active: false }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = mouseDragRef.current
      if (!drag) return

      if (!drag.active) {
        const dx = Math.abs(e.clientX - drag.startX)
        const dy = Math.abs(e.clientY - drag.startY)
        if (dx + dy < 8) return
        drag.active = true
        draggedPathRef.current = drag.sourcePath
        setDraggedPath(drag.sourcePath)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }

      const el = document.elementFromPoint(e.clientX, e.clientY)
      const dirEl = el?.closest('[data-entry-type="directory"]') as HTMLElement | null
      const treeContainer = el?.closest('[data-tree-container]') as HTMLElement | null

      let targetPath: string | null = null
      if (dirEl) {
        const dirPath = dirEl.dataset.entryPath!
        if (dirPath !== drag.sourcePath && !dirPath.startsWith(drag.sourcePath + '/')) {
          targetPath = dirPath
        }
      } else if (treeContainer) {
        targetPath = ''
      }

      if (dropTargetRef.current !== targetPath) {
        dropTargetRef.current = targetPath
        setDropTargetPath(targetPath)
      }
    }

    const handleMouseUp = () => {
      const drag = mouseDragRef.current
      mouseDragRef.current = null

      if (!drag?.active) return

      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      dragJustEndedRef.current = true
      setTimeout(() => { dragJustEndedRef.current = false }, 50)

      const targetDir = dropTargetRef.current

      draggedPathRef.current = null
      setDraggedPath(null)
      dropTargetRef.current = null
      setDropTargetPath(null)

      if (targetDir === null) return
      moveFileCallbackRef.current(drag.sourcePath, targetDir)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // ─── 右键菜单 ───
  const handleContextMenu = (e: React.MouseEvent, entry: TreeEntry) => {
    e.preventDefault()
    e.stopPropagation()
    const items: MenuItem[] = []
    const tauriMode = isTauri()

    if (entry.type === 'file') {
      if (tauriMode) {
        items.push({ label: '打开', icon: <ExternalLink size={12} />, onClick: () => handleOpenLocal(entry.path) })
        items.push({ label: '打开所在目录', icon: <FolderOpen size={12} />, onClick: () => handleRevealInDir(entry.path) })
      }
      items.push({ label: '下载', icon: <Download size={12} />, onClick: () => {
        const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(entry.path)}`
        const a = document.createElement('a'); a.href = url; a.download = entry.name; a.click()
      }})
      items.push({ label: '复制', icon: <Copy size={12} />, onClick: () => {
        setClipboard({ mode: 'copy', sourcePath: entry.path, sourceName: entry.name, sourceType: entry.type })
      }})
      items.push({ label: '剪切', icon: <Scissors size={12} />, onClick: () => {
        setClipboard({ mode: 'cut', sourcePath: entry.path, sourceName: entry.name, sourceType: entry.type })
      }})
    } else {
      if (tauriMode) {
        items.push({ label: '打开', icon: <ExternalLink size={12} />, onClick: () => handleOpenLocal(entry.path) })
        items.push({ label: '打开所在目录', icon: <FolderOpen size={12} />, onClick: () => handleRevealInDir(entry.path) })
      }
      items.push({ label: '新建文件', icon: <FilePlus size={12} />, onClick: () => startCreate('file', entry.path) })
      items.push({ label: '新建文件夹', icon: <FolderPlus size={12} />, onClick: () => startCreate('folder', entry.path) })
      items.push({ label: '上传文件', icon: <Upload size={12} />, onClick: () => { uploadDirRef.current = entry.path; fileInputRef.current?.click() } })
      if (clipboard) {
        items.push({ label: '粘贴', icon: <ClipboardPaste size={12} />, onClick: () => handlePaste(entry.path) })
      }
      items.push({ label: '复制', icon: <Copy size={12} />, onClick: () => {
        setClipboard({ mode: 'copy', sourcePath: entry.path, sourceName: entry.name, sourceType: entry.type })
      }})
      items.push({ label: '剪切', icon: <Scissors size={12} />, onClick: () => {
        setClipboard({ mode: 'cut', sourcePath: entry.path, sourceName: entry.name, sourceType: entry.type })
      }})
    }
    items.push({
      label: '重命名', icon: <Pencil size={12} />, onClick: () => {
        setRenamingPath(entry.path)
        setRenameValue(entry.name)
        setTimeout(() => renameInputRef.current?.select(), 0)
      }
    })
    items.push({
      label: '删除', icon: <Trash2 size={12} />, danger: true, onClick: () => {
        console.log('[FilesPanel] 删除点击:', entry.path)
        setPendingDelete(entry)
      }
    })

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const handleBgContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const items: MenuItem[] = [
      { label: '新建文件', icon: <FilePlus size={12} />, onClick: () => startCreate('file', '') },
      { label: '新建文件夹', icon: <FolderPlus size={12} />, onClick: () => startCreate('folder', '') },
      { label: '上传文件', icon: <Upload size={12} />, onClick: () => { uploadDirRef.current = ''; fileInputRef.current?.click() } },
    ]
    if (clipboard) {
      items.push({ label: '粘贴', icon: <ClipboardPaste size={12} />, onClick: () => handlePaste('') })
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  // ─── 重命名 ───
  const submitRename = async () => {
    if (!renamingPath || !renameValue.trim() || renameValue.trim() === renamingPath.split('/').pop()) {
      setRenamingPath(null)
      return
    }
    const parts = renamingPath.split('/')
    const newPath = [...parts.slice(0, -1), renameValue.trim()].join('/')
    try {
      await fileAction('rename', renamingPath, newPath || renameValue.trim())
      if (selectedFile?.path === renamingPath) {
        setSelectedFile({ ...selectedFile, path: newPath || renameValue.trim(), name: renameValue.trim() })
      }
      fetchTree()
      fetchGitStatus()
    } catch (err) { setError(err instanceof Error ? err.message : '重命名失败') }
    setRenamingPath(null)
  }

  // ─── 新建 ───
  const startCreate = (type: 'file' | 'folder', parentPath: string) => {
    setCreating({ type, parentPath })
    setCreateValue('')
    setTimeout(() => createInputRef.current?.focus(), 0)
  }

  const submitCreate = async () => {
    if (!creating || !createValue.trim()) { setCreating(null); return }
    try {
      await fileAction(creating.type === 'folder' ? 'mkdir' : 'create', creating.parentPath, undefined, createValue.trim())
      if (creating.parentPath) {
        setExpandedFolders(prev => new Set(prev).add(creating.parentPath))
      }
      fetchTree()
      fetchGitStatus()
    } catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    setCreating(null)
  }

  // ─── 上传 ───
  const handleUpload = async (fileList: FileList) => {
    if (fileList.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('dir', uploadDirRef.current)
      for (let i = 0; i < fileList.length; i++) formData.append('files', fileList[i])
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { method: 'PUT', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '上传失败')
      if (uploadDirRef.current) {
        setExpandedFolders(prev => new Set(prev).add(uploadDirRef.current))
      }
      fetchTree()
      fetchGitStatus()
    } catch (err) { setError(err instanceof Error ? err.message : '上传失败') }
    finally { setUploading(false) }
  }

  // ─── Git 数据（基于活跃 git 目录） ───
  const stagedFiles = activeGitStatus?.staged ?? []
  const unstagedFiles = activeGitStatus?.unstaged ?? []
  const untrackedFiles = activeGitStatus?.untracked ?? []
  const changesFiles = [...unstagedFiles, ...untrackedFiles]
  const totalGitChanges = stagedFiles.length + changesFiles.length
  const isGitRepo = activeGitStatus?.isGitRepo ?? false

  // ─── 渲染 ───
  if (loading && tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 合并工具栏 + 工作目录 + Git 信息 */}
      <div
        data-tauri-drag-region
        className="fp-header flex items-center justify-between px-2 py-1 border-b shrink-0 select-none"
        style={{ borderColor: 'var(--panel-border)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 左侧：收起 + 图标 + 工作目录 + Git 信息 */}
        <div className="flex items-center gap-1.5 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {!hideHeaderButtons && onHide && !isFullscreen && (
            <button onClick={onHide} className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer" title="收起面板">
              <PanelRightClose size={14} />
            </button>
          )}
          <Code2 size={16} style={{ color: 'var(--color-primary)' }} />

          {/* 工作目录 */}
          <FolderOpen size={11} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          <div className="relative min-w-0">
            <button
              onClick={() => setCwdDropdownOpen(!cwdDropdownOpen)}
              className="text-[11px] text-left truncate cursor-pointer hover:underline"
              style={{ color: projectCwd ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}
              title={projectCwd || '默认目录'}
            >
              {projectCwd ? (
                <>
                  <span className="opacity-60">~/</span>
                  {projectCwd.split('/').slice(-2).join('/')}
                </>
              ) : '默认'}
            </button>
            {cwdDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCwdDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-50 min-w-[220px]"
                  style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                  <button
                    onClick={() => handleChangeCwd('')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-[var(--color-bg-tertiary)]"
                    style={{ color: !projectCwd ? 'var(--color-primary)' : 'var(--color-text)' }}
                  >
                    {!projectCwd ? <Check size={10} /> : <Folder size={10} />}
                    项目默认目录
                  </button>
                  {projectCwd && (
                    <button
                      onClick={() => handleChangeCwd('')}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-[var(--color-bg-tertiary)]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <Folder size={10} />
                      <span className="truncate">{projectCwd}</span>
                      <span className="ml-auto text-red-400 hover:text-red-500 shrink-0">移除</span>
                    </button>
                  )}
                  {isTauri() && (
                    <button
                      onClick={handleSelectDirectory}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-[var(--color-bg-tertiary)]"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <FolderPlus size={10} />
                      选择本地目录...
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Git 分支 */}
          {isGitRepo && activeGitStatus?.branch && (
            <div className="relative">
              <button
                onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 cursor-pointer transition-colors shrink-0"
                style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
                title="切换分支"
              >
                {switchingBranch ? <Loader2 size={9} className="animate-spin" /> : <GitBranch size={9} />}
                {activeGitStatus.branch}
                <ChevronDown size={8} />
              </button>
              {branchDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBranchDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-50 min-w-[120px] max-h-40 overflow-y-auto"
                    style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    {activeGitStatus.branches.map(b => (
                      <button key={b.name}
                        onClick={() => { if (!b.isCurrent) handleCheckout(b.name) }}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-left hover:bg-[var(--color-bg-tertiary)]"
                        style={{ color: b.isCurrent ? 'var(--color-primary)' : 'var(--color-text)' }}
                      >
                        {b.isCurrent ? <Check size={10} /> : <GitBranch size={10} />}
                        {b.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Git 目录切换 */}
          {gitDirs.length > 1 && isGitRepo && (
            <div className="relative">
              <button
                onClick={() => setGitDirDropdownOpen(!gitDirDropdownOpen)}
                className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 cursor-pointer transition-colors shrink-0"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}
                title="切换 Git 目录"
              >
                <Folder size={9} />
                {activeGitDir === '' ? '根目录' : activeGitDir || '根目录'}
                <ChevronDown size={8} />
              </button>
              {gitDirDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setGitDirDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-50 min-w-[140px] max-h-40 overflow-y-auto"
                    style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    {gitDirs.map(d => (
                      <button key={d.path || '__root__'}
                        onClick={() => { setActiveGitDir(d.path); setGitDirDropdownOpen(false) }}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-left hover:bg-[var(--color-bg-tertiary)]"
                        style={{ color: (activeGitDir ?? '') === d.path ? 'var(--color-primary)' : 'var(--color-text)' }}
                      >
                        {((activeGitDir ?? '') === d.path) ? <Check size={10} /> : <Folder size={10} />}
                        {d.path === '' ? '根目录' : d.path}
                        <span style={{ color: 'var(--color-text-muted)' }}>{d.branch}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 右侧：操作按钮 */}
        <div className="fp-toolbar flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => startCreate('file', '')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="新建文件">
            <FilePlus size={15} />
          </button>
          <button onClick={fetchTree} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="刷新项目目录">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => startCreate('folder', '')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="新建文件夹">
            <FolderPlus size={15} />
          </button>
          <button onClick={() => { uploadDirRef.current = ''; fileInputRef.current?.click() }} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="上传" disabled={uploading}>
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          </button>
          {isTauri() && (
            <button onClick={async () => {
              const dirPath = effectiveCwd || projectCwd
              if (dirPath) { try { await revealInFinder(dirPath) } catch { /* ignore */ } }
            }} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="打开目录位置">
              <ExternalLink size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mx-2 my-1 px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>
          <AlertCircle size={12} /> {error}
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer">&times;</button>
        </div>
      )}

      {/* ── 左右分栏 ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 左侧：文件树 + Git 变更 */}
        <div className="flex flex-col overflow-hidden shrink-0" style={{ width: treeWidth }}>
          {/* 搜索框 */}
          <div className="px-2 py-1 border-b shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <Search size={12} style={{ color: 'var(--color-text-muted)' }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索文件..."
                className="text-xs bg-transparent outline-none flex-1 min-w-0"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
          </div>
          {/* 文件树列表 */}
          <div
            data-tree-container
            className="min-h-0 overflow-y-auto py-1"
            style={{ flex: totalGitChanges > 0 && isGitRepo ? '1 1 50%' : '1 1 100%' }}
            onContextMenu={handleBgContextMenu}
            onMouseDown={handleTreeMouseDown}
          >
            {tree.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <FolderOpen size={28} style={{ color: 'var(--color-text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>空项目</span>
              </div>
            ) : (
              <TreeView
                entries={tree}
                selectedPath={selectedPath}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
                onSelectFile={selectFile}
                onContextMenu={handleContextMenu}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameConfirm={submitRename}
                onRenameCancel={() => setRenamingPath(null)}
                renameInputRef={renameInputRef}
                searchQuery={searchQuery}
                level={0}
                draggedPath={draggedPath}
                dropTargetPath={dropTargetPath}
                gitDirsMap={gitDirsMap}
                onSelectGitDir={(dirPath) => { setActiveGitDir(dirPath) }}
                activeGitDir={activeGitDir}
              />
            )}
            {creating && (
              <div
                className="flex items-center gap-1 py-[3px] pr-2"
                style={{ paddingLeft: 8 + (creating.parentPath ? creating.parentPath.split('/').length * 14 : 0) + (creating.parentPath ? 12 : 0) }}
              >
                <FileIconSm name={createValue || (creating.type === 'folder' ? '新文件夹' : '新文件')} type={creating.type === 'folder' ? 'directory' : 'file'} />
                <input
                  ref={createInputRef}
                  value={createValue}
                  onChange={e => setCreateValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(null) }}
                  onBlur={() => { if (!createValue.trim()) setCreating(null); else submitCreate() }}
                  placeholder={creating.type === 'folder' ? '文件夹名' : '文件名'}
                  className="text-sm bg-transparent border-b outline-none flex-1 min-w-0"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}
                />
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center py-3">
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
              </div>
            )}
          </div>

          {/* ── Git 源码管理区域（文件树下方） ── */}
          {isGitRepo && totalGitChanges > 0 && (
            <div className="border-t shrink-0 flex flex-col" style={{ borderColor: 'var(--panel-border)', flex: '1 1 50%', minHeight: 0 }}>
              {/* Git 错误 */}
              {gitError && (
                <div className="mx-2 my-1 px-2 py-1 rounded-md text-[10px] flex items-center gap-1 shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>
                  <AlertCircle size={10} /> {gitError}
                  <button onClick={() => setGitError(null)} className="ml-auto cursor-pointer">&times;</button>
                </div>
              )}
              {/* 提交栏 */}
              <div className="px-2 py-1 border-b shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
                <div className="flex items-center gap-1">
                  <input
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleCommit() } }}
                    placeholder="提交信息..."
                    className="text-[11px] rounded px-1.5 py-0.5 flex-1 min-w-0 bg-transparent outline-none"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
                  />
                  <button onClick={handleGenerateCommit} disabled={generatingCommit || stagedFiles.length === 0}
                    className="p-0.5 rounded cursor-pointer disabled:opacity-30" style={{ color: 'var(--color-primary)' }} title="AI 生成提交信息">
                    {generatingCommit ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  </button>
                  <button onClick={handleCommit} disabled={committing || !commitMessage.trim() || stagedFiles.length === 0}
                    className="p-0.5 rounded cursor-pointer disabled:opacity-30" style={{ color: 'var(--color-primary)' }} title="提交">
                    {committing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  </button>
                  {activeGitStatus?.hasRemote && (
                    <button onClick={handlePush} disabled={pushing}
                      className="p-0.5 rounded cursor-pointer disabled:opacity-30" style={{ color: 'var(--color-text-secondary)' }} title="推送">
                      {pushing ? <Loader2 size={12} className="animate-spin" /> : <PushIcon size={12} />}
                    </button>
                  )}
                  {totalGitChanges > 0 && (
                    <button onClick={() => setGitViewMode(gitViewMode === 'flat' ? 'tree' : 'flat')}
                      className="p-0.5 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
                      style={{ color: gitViewMode === 'tree' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                      title={gitViewMode === 'flat' ? '树形视图' : '平铺视图'}>
                      {gitViewMode === 'flat' ? <ListTree size={12} /> : <List size={12} />}
                    </button>
                  )}
                </div>
              </div>
              {/* 变更文件列表（可滚动） */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* 已暂存 */}
                {stagedFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 px-2 py-0.5 select-none cursor-pointer"
                      onClick={() => setGitSectionOpen(!gitSectionOpen)}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {gitSectionOpen ? <ChevronDown size={10} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--color-text-muted)' }} />}
                      <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--color-text-secondary)' }}>已暂存</span>
                      <span className="text-[10px] px-1 rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>{stagedFiles.length}</span>
                      <button onClick={e => { e.stopPropagation(); gitAction('unstage-all') }} className="ml-auto p-0.5 rounded cursor-pointer hover:bg-amber-500/10" title="全部取消暂存">
                        <Minus size={10} className="text-amber-500" />
                      </button>
                    </div>
                    {gitSectionOpen && (gitViewMode === 'flat' ? (
                      stagedFiles.map(f => (
                        <GitFileItem key={f.path} file={f} onSelect={selectGitFile}
                          onUnstage={p => gitAction('unstage', p)} showUnstage />
                      ))
                    ) : (
                      <GitTreeGroup node={buildGitTree(stagedFiles)} depth={0}
                        expandedDirs={gitExpandedDirs}
                        onToggleDir={p => setGitExpandedDirs(prev => {
                          const next = new Set(prev)
                          next.has(p) ? next.delete(p) : next.add(p)
                          return next
                        })}
                        onSelect={selectGitFile} onUnstage={p => gitAction('unstage', p)} showUnstage />
                    ))}
                  </div>
                )}
                {/* 更改 */}
                {changesFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 px-2 py-0.5 select-none cursor-pointer"
                      onClick={() => setGitSectionOpen(!gitSectionOpen)}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {gitSectionOpen ? <ChevronDown size={10} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--color-text-muted)' }} />}
                      <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--color-text-secondary)' }}>更改</span>
                      <span className="text-[10px] px-1 rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>{changesFiles.length}</span>
                      <button onClick={e => { e.stopPropagation(); gitAction('stage-all') }} className="ml-auto p-0.5 rounded cursor-pointer hover:bg-emerald-500/10" title="全部暂存">
                        <Plus size={10} className="text-emerald-500" />
                      </button>
                    </div>
                    {gitSectionOpen && (gitViewMode === 'flat' ? (
                      changesFiles.map(f => (
                        <GitFileItem key={f.path} file={f} onSelect={selectGitFile}
                          onStage={p => gitAction('stage', p)} onDiscard={p => gitAction('discard', p)}
                          showStage showDiscard />
                      ))
                    ) : (
                      <GitTreeGroup node={buildGitTree(changesFiles)} depth={0}
                        expandedDirs={gitExpandedDirs}
                        onToggleDir={p => setGitExpandedDirs(prev => {
                          const next = new Set(prev)
                          next.has(p) ? next.delete(p) : next.add(p)
                          return next
                        })}
                        onSelect={selectGitFile}
                        onStage={p => gitAction('stage', p)} onDiscard={p => gitAction('discard', p)}
                        showStage showDiscard />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 分栏拖拽手柄 */}
        <div
          onMouseDown={handleSplitDragStart}
          className="w-1 shrink-0 cursor-col-resize relative group"
          style={{ backgroundColor: isDraggingSplit ? 'var(--color-primary)' : 'var(--color-border)', transition: 'background-color 0.15s' }}
        >
          {!isDraggingSplit && (
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 opacity-0 group-hover:opacity-100 bg-purple-500/40 transition-opacity" />
          )}
        </div>

        {/* 右侧：预览/编辑区 */}
        <div className="flex-1 overflow-hidden min-w-0 flex flex-col">
          {selectedFile ? (
            <>
              {/* 文件标签栏：左中可溢出，右侧固定 */}
              <div className="flex items-center px-2 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                {/* 左侧 + 中间内容：可溢出裁剪 */}
                <div ref={tabBarRef} className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                  <FileIconSm name={selectedFile.name} type={selectedFile.type} />
                  <span className="text-xs truncate shrink-0 max-w-[100px]" style={{ color: 'var(--color-text)' }}>{selectedFile.name}</span>
                  {/* HTML 模式切换 */}
                  {selectedFileCategory === 'html' && htmlMode !== 'visual' && (
                    <>
                      <button onClick={() => handleHtmlModeChange('edit')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: htmlMode === 'edit' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: htmlMode === 'edit' ? 'var(--color-primary-subtle)' : 'transparent' }}>
                        编辑
                      </button>
                      <button onClick={() => handleHtmlModeChange('split')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: htmlMode === 'split' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: htmlMode === 'split' ? 'var(--color-primary-subtle)' : 'transparent' }}>
                        分栏
                      </button>
                      <button onClick={() => handleHtmlModeChange('preview')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: htmlMode === 'preview' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: htmlMode === 'preview' ? 'var(--color-primary-subtle)' : 'transparent' }}>
                        预览
                      </button>
                      <button onClick={() => handleHtmlModeChange('visual')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: 'var(--color-text-secondary)' }}>
                        可视化
                      </button>
                    </>
                  )}
                  {/* Markdown 模式切换 */}
                  {selectedFileCategory === 'markdown' && (
                    <>
                      <button onClick={() => setMdMode('edit')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: mdMode === 'edit' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mdMode === 'edit' ? 'var(--color-primary-subtle)' : 'transparent' }}>
                        编辑
                      </button>
                      <button onClick={() => setMdMode('split')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: mdMode === 'split' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mdMode === 'split' ? 'var(--color-primary-subtle)' : 'transparent' }}>
                        分栏
                      </button>
                      <button onClick={() => setMdMode('preview')} className="text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0"
                        style={{ color: mdMode === 'preview' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mdMode === 'preview' ? 'var(--color-primary-subtle)' : 'transparent' }}>
                        预览
                      </button>
                    </>
                  )}
                  {/* 弹性间距 */}
                  <div className="flex-1 min-w-0" />
                  {/* 图片：缩放 + 旋转 */}
                  {selectedFileCategory === 'image' && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))} className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                        <Minus size={13} />
                      </button>
                      <span className="text-[10px] min-w-[2rem] text-center shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                        {Math.round(imageZoom * 100)}%
                      </span>
                      <button onClick={() => setImageZoom(z => Math.min(3, z + 0.25))} className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                        <Plus size={13} />
                      </button>
                      {imageZoom !== 1 && (
                        <button onClick={() => setImageZoom(1)} className="text-[11px] px-1 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                          重置
                        </button>
                      )}
                      <button onClick={() => setImageRotation(r => (r + 90) % 360)} className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="顺时针旋转 90°">
                        <RotateCw size={14} />
                      </button>
                    </div>
                  )}
                  {/* ── 宽屏：全部内联 ── */}
                  {!compactMode && (
                  <>
                    <button onClick={refreshCurrentFile} className="p-1 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title="刷新当前文件">
                      <RefreshCw size={13} />
                    </button>
                    {selectedFileCategory === 'code' && (
                      <button onClick={() => editorActionsRef.current.copy?.()} className="flex items-center gap-1 text-[11px] px-1 py-0.5 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title="复制内容">
                        <Copy size={12} /> 复制
                      </button>
                    )}
                    {selectedFileCategory === 'markdown' && (
                      <div className="relative shrink-0">
                        <button onClick={() => setMdExportOpen(!mdExportOpen)} className="flex items-center gap-1 text-[11px] px-1 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="导出">
                          <Download size={12} /> 导出 <ChevronDown size={10} />
                        </button>
                        {mdExportOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMdExportOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 rounded shadow-lg border z-50 py-1 min-w-[100px]" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                              <button onClick={() => { editorActionsRef.current.exportPdf?.(); setMdExportOpen(false) }} className="w-full text-left text-xs px-3 py-1.5 cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text)' }}>
                                导出 PDF
                              </button>
                              <button onClick={() => { editorActionsRef.current.exportWord?.(); setMdExportOpen(false) }} className="w-full text-left text-xs px-3 py-1.5 cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text)' }}>
                                导出 Word
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <button onClick={() => {
                      const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(selectedFile.path)}`
                      const a = document.createElement('a'); a.href = url; a.download = selectedFile.name; a.click()
                    }} className="p-1 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title="下载文件">
                      <Download size={13} />
                    </button>
                    {isTauri() && (
                      <button onClick={() => handleOpenLocal(selectedFile.path)} className="p-1 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title="本地打开">
                        <ExternalLink size={13} />
                      </button>
                    )}
                    {isTauri() && (
                      <button onClick={() => handleRevealInDir(selectedFile.path)} className="p-1 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title="打开所在目录">
                        <FolderOpen size={13} />
                      </button>
                    )}
                  </>
                  )}
                </div>
                {/* 右侧固定按钮：保存、更多菜单、关闭 —— 始终可见 */}
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {/* 保存按钮 */}
                  {(() => {
                    const showSave = selectedFileCategory && !['image', 'pdf', 'word', 'excel', 'ppt'].includes(selectedFileCategory) && !(selectedFileCategory === 'html' && htmlMode === 'visual')
                    return showSave ? (
                      <button
                        onClick={() => editorActionsRef.current.save?.()}
                        disabled={saving}
                        className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded cursor-pointer"
                        style={{ color: 'var(--color-primary)' }}
                        title="Ctrl+S 保存">
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} 保存
                      </button>
                    ) : null
                  })()}
                  {/* ── 窄屏：更多菜单 ── */}
                  {compactMode && (
                  <div className="relative">
                    <button onClick={() => setFileActionsOpen(!fileActionsOpen)} className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="更多操作">
                      <MoreHorizontal size={14} />
                    </button>
                    {fileActionsOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setFileActionsOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-50 min-w-[140px]"
                          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                          <button onClick={() => { refreshCurrentFile(); setFileActionsOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                            <RefreshCw size={12} /> 刷新
                          </button>
                          {selectedFileCategory === 'code' && (
                            <button onClick={() => { editorActionsRef.current.copy?.(); setFileActionsOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                              <Copy size={12} /> 复制
                            </button>
                          )}
                          {selectedFileCategory === 'markdown' && (
                            <>
                              <button onClick={() => { editorActionsRef.current.exportPdf?.(); setFileActionsOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                                <Download size={12} /> 导出 PDF
                              </button>
                              <button onClick={() => { editorActionsRef.current.exportWord?.(); setFileActionsOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                                <Download size={12} /> 导出 Word
                              </button>
                            </>
                          )}
                          <button onClick={() => {
                            const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(selectedFile.path)}`
                            const a = document.createElement('a'); a.href = url; a.download = selectedFile.name; a.click()
                            setFileActionsOpen(false)
                          }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                            <Download size={12} /> 下载
                          </button>
                          {isTauri() && (
                            <button onClick={() => { handleOpenLocal(selectedFile.path); setFileActionsOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                              <ExternalLink size={12} /> 打开
                            </button>
                          )}
                          {isTauri() && (
                            <button onClick={() => { handleRevealInDir(selectedFile.path); setFileActionsOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
                              <FolderOpen size={12} /> 打开所在目录
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  )}
                  {/* 关闭 */}
                  <button
                    onClick={() => { setSelectedFile(null); setSelectedPath(null); setPreviewContent(null); setDiffOldContent(null); setDiffNewContent(null) }}
                    className="p-0.5 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
                    style={{ color: 'var(--color-text-muted)' }}
                    title="关闭">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden min-h-0">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                  </div>
                ) : previewError ? (
                  <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--color-error)' }}>{previewError}</div>
                ) : diffOldContent !== null || diffNewContent !== null ? (
                  <DiffEditor
                    oldContent={diffOldContent || ''}
                    newContent={diffNewContent || ''}
                    fileName={selectedFile.name}
                    onSave={saveFile}
                    saving={saving}
                  />
                ) : (() => {
                  const cat = getFileCategory(selectedFile.name)
                  if (cat === 'image') return <ImagePreview key={previewKey} projectId={projectId} filePath={selectedFile.path} refreshKey={previewKey} zoom={imageZoom} rotation={imageRotation} />
                  if (['pdf', 'word', 'excel', 'ppt'].includes(cat)) return <JitViewerPreview key={previewKey} projectId={projectId} filePath={selectedFile.path} fileName={selectedFile.name} refreshKey={previewKey} />
                  if (cat === 'html') return <HtmlEditor key={previewKey} content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} onSendToChat={sendToChat} onToggleFullscreen={onToggleFullscreen} isFullscreen={isFullscreen} mode={htmlMode} onModeChange={handleHtmlModeChange} registerActions={handleRegisterActions} />
                  if (cat === 'code') return <CodeEditor key={previewKey} content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} registerActions={handleRegisterActions} />
                  if (cat === 'markdown') return <MarkdownEditor key={previewKey} content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} projectId={projectId} filePath={selectedFile.path} mode={mdMode} onModeChange={setMdMode} registerActions={handleRegisterActions} />
                  if (cat === 'text') return <TextEditor key={previewKey} content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} registerActions={handleRegisterActions} />
                  return (
                    <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--color-text-muted)' }}>
                      <File size={24} />
                      <span className="text-sm">不支持预览此类型</span>
                      <button onClick={() => {
                        const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(selectedFile.path)}`
                        const a = document.createElement('a'); a.href = url; a.download = selectedFile.name; a.click()
                      }} className="text-sm px-2 py-1 rounded-md cursor-pointer" style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-subtle)' }}>
                        下载文件
                      </button>
                    </div>
                  )
                })()}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--color-text-muted)' }}>
              <FileText size={28} />
              <span className="text-sm">选择文件预览或编辑</span>
            </div>
          )}
        </div>
      </div>

      {/* 隐藏的上传 input */}
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = '' }} />

      {/* 删除确认对话框 */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPendingDelete(null)} />
          <div className="relative rounded-xl shadow-2xl border p-5 w-80" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--panel-border)' }}>
            <p className="text-sm mb-1" style={{ color: 'var(--color-text)' }}>
              确定删除 <strong>"{pendingDelete.name}"</strong>{pendingDelete.type === 'directory' ? ' 及其所有内容' : ''}？
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>此操作不可撤销</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors"
                style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const entry = pendingDelete
                  setPendingDelete(null)
                  fileAction('delete', entry.path)
                    .then(() => {
                      if (selectedFile?.path === entry.path) {
                        setSelectedFile(null)
                        setSelectedPath(null)
                        setPreviewContent(null)
                      }
                      fetchTree()
                      fetchGitStatus()
                    })
                    .catch((err) => {
                      console.error('[FilesPanel] 删除失败:', err)
                      setError(err instanceof Error ? err.message : '删除失败')
                    })
                }}
                className="px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors text-white"
                style={{ backgroundColor: 'var(--color-error)' }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  )
}
