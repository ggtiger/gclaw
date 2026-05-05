'use client'

import { useState, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, ExternalLink, FolderOpen } from 'lucide-react'
import { isTauri, openWithSystemApp, revealInFinder } from '@/lib/tauri'

// ── 图片扩展名 ──

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

function isImageFile(path: string): boolean {
  const ext = path.replace(/\\/g, '/').split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.has(ext)
}

export function toRelativePath(absolutePath: string, cwd: string): string | null {
  const normalized = absolutePath.replace(/\\/g, '/')
  const normalizedCwd = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  if (normalized.startsWith(normalizedCwd + '/')) {
    return normalized.slice(normalizedCwd.length + 1)
  }
  return null
}

function truncatePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return path
  return '...' + parts.slice(-2).join('/')
}

// ── Lightbox ──

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  if (typeof window === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[90vh] object-contain rounded-lg"
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body
  )
}

// ── 主组件 ──

interface FilePathActionProps {
  filePath: string
  projectId: string
  projectCwd?: string
  compact?: boolean
}

export const FilePathAction = memo(function FilePathAction({
  filePath,
  projectId,
  projectCwd,
  compact = false,
}: FilePathActionProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tauriEnv = isTauri()

  const isImage = isImageFile(filePath)
  const displayPath = truncatePath(filePath)
  const isAbsolute = filePath.startsWith('/') || /^[A-Z]:/i.test(filePath)

  // 绝对路径用 /api/local-file，相对路径用项目文件 API
  const imageUrl = isImage
    ? (isAbsolute
      ? `/api/local-file?path=${encodeURIComponent(filePath)}`
      : `/api/projects/${projectId}/files?action=download&path=${encodeURIComponent(filePath)}`)
    : null

  // 解析绝对路径：优先用 projectCwd，否则通过 API 回退
  const resolveAbsolutePath = useCallback(async (): Promise<string> => {
    if (isAbsolute) return filePath
    if (projectCwd) return projectCwd.replace(/\/$/, '') + '/' + filePath
    // 回退：通过项目文件 API 解析绝对路径
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', path: filePath }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.absolutePath as string
  }, [filePath, isAbsolute, projectCwd, projectId])

  const handleOpen = useCallback(async () => {
    try {
      setError(null)
      const absPath = await resolveAbsolutePath()
      await openWithSystemApp(absPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开失败')
    }
  }, [resolveAbsolutePath])

  const handleReveal = useCallback(async () => {
    try {
      setError(null)
      const absPath = await resolveAbsolutePath()
      await revealInFinder(absPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开目录失败')
    }
  }, [resolveAbsolutePath])

  const handlePreview = useCallback(() => {
    if (imageUrl) {
      setLightboxOpen(true)
    } else {
      // 不在项目目录内，用系统应用打开
      handleOpen()
    }
  }, [imageUrl, handleOpen])

  // 非 Tauri 且无图片预览能力：仅显示路径文本
  if (!tauriEnv && !isImage) {
    return (
      <span className={compact ? 'truncate max-w-[200px]' : ''} style={{ color: 'var(--color-text-muted)' }} title={filePath}>
        {displayPath}
      </span>
    )
  }

  if (compact) {
    // 紧凑模式：用于工具卡片 header
    return (
      <>
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1 py-px rounded truncate max-w-[240px]"
          style={{
            backgroundColor: 'var(--color-surface-hover)',
            color: 'var(--color-text-muted)',
          }}
          title={filePath}
        >
          {displayPath}
          {isImage && imageUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePreview() }}
              className="shrink-0 p-0.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer"
              title="预览"
            >
              <Eye size={10} />
            </button>
          )}
          {tauriEnv && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleOpen() }}
                className="shrink-0 p-0.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer"
                title="打开文件"
              >
                <ExternalLink size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleReveal() }}
                className="shrink-0 p-0.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer"
                title="打开文件位置"
              >
                <FolderOpen size={10} />
              </button>
            </>
          )}
        </span>
        {lightboxOpen && imageUrl && (
          <Lightbox src={imageUrl} alt={filePath} onClose={() => setLightboxOpen(false)} />
        )}
        {error && (
          <span className="text-[10px] text-[var(--color-error)]">{error}</span>
        )}
      </>
    )
  }

  // 完整模式：用于展开区域的 Input
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-mono truncate max-w-full" style={{ color: 'var(--color-text-muted)' }} title={filePath}>
          {filePath}
        </span>
        {isImage && imageUrl && (
          <button
            onClick={handlePreview}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:bg-white/20 dark:hover:bg-white/10"
            style={{ color: 'var(--color-primary, #7c3aed)' }}
          >
            <Eye size={10} />
            预览
          </button>
        )}
        {tauriEnv && (
          <>
            <button
              onClick={handleOpen}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:bg-white/20 dark:hover:bg-white/10"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ExternalLink size={10} />
              打开
            </button>
            <button
              onClick={handleReveal}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:bg-white/20 dark:hover:bg-white/10"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <FolderOpen size={10} />
              打开位置
            </button>
          </>
        )}
      </div>
      {lightboxOpen && imageUrl && (
        <Lightbox src={imageUrl} alt={filePath} onClose={() => setLightboxOpen(false)} />
      )}
      {error && (
        <span className="text-[10px] text-[var(--color-error)]">{error}</span>
      )}
    </>
  )
})
