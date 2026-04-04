'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Code2,
  File,
  FileCode,
  FileText,
  FolderOpen,
  Image,
  Grid,
  List,
  Upload,
  Download,
  FolderPlus,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react'

interface FileInfo {
  name: string
  type: 'file' | 'directory'
  size?: string
  modifiedAt?: string
}

interface FilesPanelProps {
  projectId: string
}

type ViewMode = 'grid' | 'list'
type Tab = 'code' | 'files'

// 文件图标配置
function getFileIcon(name: string, type: 'file' | 'directory') {
  if (type === 'directory') {
    return { icon: FolderOpen, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-500/20' }
  }

  const ext = name.split('.').pop()?.toLowerCase() || ''

  // PDF
  if (ext === 'pdf') {
    return { icon: null, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-500/20', label: 'PDF' }
  }
  // Excel/CSV
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return { icon: null, color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-500/20', label: 'X' }
  }
  // Word
  if (['docx', 'doc'].includes(ext)) {
    return { icon: null, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-500/20', label: 'W' }
  }
  // Markdown
  if (['md', 'markdown'].includes(ext)) {
    return { icon: null, color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-500/20', label: 'MD' }
  }
  // 图片
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return { icon: Image, color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-500/20' }
  }
  // 代码文件
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'json', 'yaml', 'yml', 'sh', 'bash'].includes(ext)) {
    return { icon: FileCode, color: 'text-gray-500', bgColor: 'bg-gray-50 dark:bg-gray-500/20' }
  }

  return { icon: File, color: 'text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-500/20' }
}

// 文件图标组件
function FileIcon({ name, type, size = 40 }: { name: string; type: 'file' | 'directory'; size?: number }) {
  const config = getFileIcon(name, type)
  const IconComponent = config.icon

  if (IconComponent) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg ${config.bgColor}`}
        style={{ width: size, height: size }}
      >
        <IconComponent size={size * 0.55} className={config.color} />
      </div>
    )
  }

  // 带文字标签的图标（PDF、Excel、Word、Markdown）
  return (
    <div
      className={`flex items-center justify-center rounded-lg ${config.bgColor}`}
      style={{ width: size, height: size }}
    >
      <span
        className={`font-bold ${config.color}`}
        style={{ fontSize: size * 0.35 }}
      >
        {config.label}
      </span>
    </div>
  )
}

export default function FilesPanel({ projectId }: FilesPanelProps) {
  const [tab, setTab] = useState<Tab>('files')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/files?path=${encodeURIComponent(path)}`
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '加载失败')
      }
      setFiles(data.files || [])
      setCurrentPath(data.currentPath || path)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文件列表失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchFiles('')
  }, [fetchFiles])

  // 路径导航条
  const pathParts = currentPath.split('/').filter(Boolean)

  const navigateTo = (index: number) => {
    if (index === -1) {
      fetchFiles('')
    } else {
      const newPath = pathParts.slice(0, index + 1).join('/')
      fetchFiles(newPath)
    }
  }

  const handleDoubleClick = (file: FileInfo) => {
    if (file.type === 'directory') {
      const newPath = currentPath ? `${currentPath}/${file.name}` : file.name
      fetchFiles(newPath)
    }
  }

  const formatDate = (iso?: string) => {
    if (!iso) return '-'
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return '-'
    }
  }

  // 加载中状态
  if (loading && files.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-purple-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部拖拽区域 */}
      <div data-tauri-drag-region className="h-1 flex-shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      {/* 顶部 Tab 栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('code')}
            className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              color: tab === 'code' ? 'var(--color-text)' : 'var(--color-text-muted)',
            }}
          >
            <Code2 size={14} />
            代码
            {tab === 'code' && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-primary)' }}
              />
            )}
          </button>
          <button
            onClick={() => setTab('files')}
            className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              color: tab === 'files' ? 'var(--color-text)' : 'var(--color-text-muted)',
            }}
          >
            <FileText size={14} />
            文件
            {tab === 'files' && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-primary)' }}
              />
            )}
          </button>
        </div>

        {/* 工具按钮组 */}
        <div className="flex items-center gap-0.5">
          <button
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 text-[var(--color-text-secondary)] cursor-pointer transition-colors"
            title="新建文件夹"
          >
            <FolderPlus size={14} />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 text-[var(--color-text-secondary)] cursor-pointer transition-colors"
            title="上传"
          >
            <Upload size={14} />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 text-[var(--color-text-secondary)] cursor-pointer transition-colors"
            title="下载"
          >
            <Download size={14} />
          </button>
          <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--color-border)' }} />
          <button
            onClick={() => setViewMode('grid')}
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 cursor-pointer transition-colors"
            style={{ color: viewMode === 'grid' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            title="网格视图"
          >
            <Grid size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 cursor-pointer transition-colors"
            style={{ color: viewMode === 'list' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            title="列表视图"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* 路径导航条 */}
      <div className="flex items-center gap-1 px-3 py-2 text-xs border-b" style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--panel-border)' }}>
        <button
          onClick={() => navigateTo(-1)}
          className="flex items-center gap-1 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors"
        >
          <FileText size={12} />
          <span>文件</span>
        </button>
        {pathParts.map((part, index) => (
          <div key={index} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <button
              onClick={() => navigateTo(index)}
              className={`hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors ${
                index === pathParts.length - 1 ? 'font-medium' : ''
              }`}
              style={{
                color: index === pathParts.length - 1 ? 'var(--color-text)' : undefined,
              }}
            >
              {part}
            </button>
          </div>
        ))}
      </div>

      {/* 错误状态 */}
      {error && (
        <div
          className="mx-3 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* 文件列表区域 */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {files.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FolderOpen size={40} className="mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              该目录为空
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-4 gap-3">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex flex-col items-center p-2 rounded-xl cursor-pointer transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/10"
                onDoubleClick={() => handleDoubleClick(file)}
              >
                <FileIcon name={file.name} type={file.type} size={44} />
                <span
                  className="mt-1.5 text-xs text-center truncate w-full"
                  style={{ color: 'var(--color-text)' }}
                  title={file.name}
                >
                  {file.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* 列表头部 */}
            <div
              className="grid grid-cols-[1fr_80px_120px] gap-2 px-2 py-1.5 text-xs font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <span>名称</span>
              <span>大小</span>
              <span>修改时间</span>
            </div>
            {/* 列表内容 */}
            {files.map((file) => (
              <div
                key={file.name}
                className="grid grid-cols-[1fr_80px_120px] gap-2 px-2 py-2 rounded-xl cursor-pointer transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/10 items-center"
                onDoubleClick={() => handleDoubleClick(file)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon name={file.name} type={file.type} size={24} />
                  <span
                    className="text-xs truncate"
                    style={{ color: 'var(--color-text)' }}
                    title={file.name}
                  >
                    {file.name}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {file.size || '-'}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {formatDate(file.modifiedAt)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 加载指示器 */}
        {loading && files.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={20} className="animate-spin text-purple-500" />
          </div>
        )}
      </div>
    </div>
  )
}
