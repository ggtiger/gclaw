'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Code2,
  File,
  FileText,
  FolderOpen,
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
  Copy,
  Scissors,
  ClipboardPaste,
  ExternalLink,
  MoreHorizontal,
} from 'lucide-react'
import type { TreeEntry, FilesPanelProps, MenuItem, ClipboardState } from './files/types'
import { getFileCategory } from './files/types'
import { ContextMenu, TreeView } from './files/FileTree'
import { FileIconSm } from './files/FileTree'
import { ImagePreview, PDFPreview, WordPreview, ExcelPreview, PPTPreview } from './files/previews'
import { HtmlEditor, CodeEditor, MarkdownEditor, TextEditor } from './files/editors'
import { isTauri, openWithSystemApp, revealInFinder } from '@/lib/tauri'

// ─── 主组件 ───

export default function FilesPanel({ projectId, onToggleFullscreen, isFullscreen }: FilesPanelProps) {
  // 文件树
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [loading, setLoading] = useState(true)
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [treeWidth, setTreeWidth] = useState(180)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const splitDragRef = useRef(false)
  const splitStartXRef = useRef(0)
  const splitStartWidthRef = useRef(0)

  // 全屏切换时自动调整树宽度
  useEffect(() => {
    if (isFullscreen) {
      setTreeWidth(300)
    } else if (treeWidth > 220) {
      setTreeWidth(180)
    }
  }, [isFullscreen])

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
    await loadFileContent(entry)
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
    const { mode, sourcePath, sourceName, sourceType } = clipboard
    const destPath = targetDir ? `${targetDir}/${sourceName}` : sourceName

    // 检查是否粘贴到自身目录
    if (sourcePath === destPath) {
      setClipboard(null)
      return
    }

    try {
      if (mode === 'copy') {
        await fileAction('copy', sourcePath, destPath)
      } else {
        // 剪切 = 移动（使用 rename API）
        await fileAction('rename', sourcePath, destPath)
        setClipboard(null)
        // 如果剪切的是当前选中的文件，更新选中状态
        if (selectedFile?.path === sourcePath) {
          setSelectedFile({ ...selectedFile, path: destPath })
          setSelectedPath(destPath)
        }
      }
      if (targetDir) {
        setExpandedFolders(prev => new Set(prev).add(targetDir))
      }
      fetchTree()
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
    // 已在目标目录中
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
      })
      .catch(err => {
        console.error('[FilesPanel] 移动失败:', err)
        setError(err instanceof Error ? err.message : '移动失败')
      })
  }

  // 文件树容器的 mousedown —— 启动拖拽跟踪
  const handleTreeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // 只响应左键
    const el = (e.target as HTMLElement).closest('[data-entry-path]') as HTMLElement | null
    if (!el) return
    if ((e.target as HTMLElement).tagName === 'INPUT') return // 重命名输入框不触发
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
        if (dx + dy < 8) return // 阈值，避免误触发
        drag.active = true
        draggedPathRef.current = drag.sourcePath
        setDraggedPath(drag.sourcePath)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }

      // 找到光标下方的目录元素
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const dirEl = el?.closest('[data-entry-type="directory"]') as HTMLElement | null
      const treeContainer = el?.closest('[data-tree-container]') as HTMLElement | null

      let targetPath: string | null = null
      if (dirEl) {
        const dirPath = dirEl.dataset.entryPath!
        // 不能拖放到自身或子目录
        if (dirPath !== drag.sourcePath && !dirPath.startsWith(drag.sourcePath + '/')) {
          targetPath = dirPath
        }
      } else if (treeContainer) {
        targetPath = '' // 空白区域 = 根目录
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
      setTimeout(() => { dragJustEndedRef.current = false }, 50) // 短暂标记阻止 click

      const targetDir = dropTargetRef.current

      // 重置视觉状态
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
      // 文件菜单
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
      // 文件夹菜单
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
    } catch (err) { setError(err instanceof Error ? err.message : '上传失败') }
    finally { setUploading(false) }
  }

  // ─── 渲染 ───
  if (loading && tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-transparent">
      {/* 工具栏 */}
      <div
        data-tauri-drag-region
        className="fp-header flex items-center justify-between px-3 pt-3 pb-2 py-1.5 border-b shrink-0 select-none"
        style={{ borderColor: 'var(--panel-border)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {onToggleFullscreen && (
            <button onClick={onToggleFullscreen} className="p-0.5 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title={isFullscreen ? '退出全屏' : '全屏'}>
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          <Code2 size={16} style={{ color: 'var(--color-primary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>文件</span>
        </div>
        <div className="fp-toolbar flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* 始终显示的核心按钮 */}
          <button onClick={() => startCreate('file', '')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="新建文件">
            <FilePlus size={15} />
          </button>
          <button onClick={refreshCurrentFile} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title={selectedFile ? '刷新当前文件' : '刷新文件树'}>
            <RefreshCw size={15} />
          </button>

          {/* 宽屏：直接显示更多按钮 */}
          <button onClick={() => startCreate('folder', '')} className="fp-extra p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="新建文件夹">
            <FolderPlus size={15} />
          </button>
          <button onClick={() => { uploadDirRef.current = ''; fileInputRef.current?.click() }} className="fp-extra p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="上传" disabled={uploading}>
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          </button>
          {selectedFile && (
            <button onClick={() => {
              const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(selectedFile.path)}`
              const a = document.createElement('a'); a.href = url; a.download = selectedFile.name; a.click()
            }} className="fp-extra p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="下载当前文件">
              <Download size={15} />
            </button>
          )}
          {selectedFile && isTauri() && (
            <button onClick={() => handleOpenLocal(selectedFile.path)} className="fp-extra p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="本地打开">
              <ExternalLink size={15} />
            </button>
          )}
          {selectedFile && isTauri() && (
            <button onClick={() => handleRevealInDir(selectedFile.path)} className="fp-extra p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }} title="打开所在目录">
              <FolderOpen size={15} />
            </button>
          )}

          {/* 窄屏：更多下拉 */}
          <div className="fp-more relative">
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className="p-1 rounded cursor-pointer"
              style={{ color: 'var(--color-text-secondary)' }}
              title="更多"
            >
              <MoreHorizontal size={15} />
            </button>
            {moreMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-50 min-w-[140px]" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                  <button onClick={() => { startCreate('folder', ''); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--color-bg-secondary)]" style={{ color: 'var(--color-text-secondary)' }}>
                    <FolderPlus size={13} /> 新建文件夹
                  </button>
                  <button onClick={() => { uploadDirRef.current = ''; fileInputRef.current?.click(); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--color-bg-secondary)]" style={{ color: 'var(--color-text-secondary)' }} disabled={uploading}>
                    <Upload size={13} /> {uploading ? '上传中...' : '上传文件'}
                  </button>
                  {selectedFile && (
                    <button onClick={() => {
                      const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(selectedFile.path)}`
                      const a = document.createElement('a'); a.href = url; a.download = selectedFile.name; a.click()
                      setMoreMenuOpen(false)
                    }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--color-bg-secondary)]" style={{ color: 'var(--color-text-secondary)' }}>
                      <Download size={13} /> 下载文件
                    </button>
                  )}
                  {selectedFile && isTauri() && (
                    <button onClick={() => { handleOpenLocal(selectedFile.path); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--color-bg-secondary)]" style={{ color: 'var(--color-text-secondary)' }}>
                      <ExternalLink size={13} /> 本地打开
                    </button>
                  )}
                  {selectedFile && isTauri() && (
                    <button onClick={() => { handleRevealInDir(selectedFile.path); setMoreMenuOpen(false) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--color-bg-secondary)]" style={{ color: 'var(--color-text-secondary)' }}>
                      <FolderOpen size={13} /> 打开目录
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
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
        {/* 左侧：文件树 */}
        <div className="flex flex-col overflow-hidden shrink-0" style={{ width: treeWidth }}>
          {/* 搜索框 */}
          <div className="px-2 py-1 border-b shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <Search size={12} style={{ color: 'var(--color-text-muted)' }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索文件..."
                className="text-xs bg-transparent outline-none flex-1"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
          </div>
          {/* 文件树列表 */}
          <div
            data-tree-container
            className="flex-1 overflow-y-auto py-1"
            onContextMenu={handleBgContextMenu}
            onMouseDown={handleTreeMouseDown}
            style={dropTargetPath === '' ? { backgroundColor: 'var(--color-primary-subtle)', outline: '1.5px dashed var(--color-primary)', borderRadius: 3 } : undefined}
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
              />
            )}
            {/* 新建项输入 */}
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
              {/* 文件名标题栏 */}
              <div className="flex items-center gap-1.5 px-2 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                <FileIconSm name={selectedFile.name} type={selectedFile.type} />
                <span className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{selectedFile.name}</span>
              </div>
              {/* 内容区 */}
              <div className="flex-1 overflow-hidden min-h-0">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                  </div>
                ) : previewError ? (
                  <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--color-error)' }}>{previewError}</div>
                ) : (() => {
                  const cat = getFileCategory(selectedFile.name)
                  if (cat === 'image') return <ImagePreview key={previewKey} projectId={projectId} filePath={selectedFile.path} refreshKey={previewKey} />
                  if (cat === 'pdf') return <PDFPreview key={previewKey} projectId={projectId} filePath={selectedFile.path} fileName={selectedFile.name} />
                  if (cat === 'word') return <WordPreview key={previewKey} projectId={projectId} filePath={selectedFile.path} />
                  if (cat === 'excel') return <ExcelPreview key={previewKey} projectId={projectId} filePath={selectedFile.path} />
                  if (cat === 'ppt') return <PPTPreview key={previewKey} projectId={projectId} filePath={selectedFile.path} />
                  if (cat === 'html') return <HtmlEditor content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} />
                  if (cat === 'code') return <CodeEditor content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} />
                  if (cat === 'markdown') return <MarkdownEditor content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} />
                  if (cat === 'text') return <TextEditor content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} />
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
