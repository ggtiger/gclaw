'use client'

import { useState, useEffect, useRef } from 'react'
import type { ViewerInstance } from 'jit-viewer'
import 'jit-viewer/style.css'

// ─── 图片预览 ───

export function ImagePreview({ projectId, filePath, refreshKey }: { projectId: string; filePath: string; refreshKey: number }) {
  const [zoom, setZoom] = useState(1)
  const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(filePath)}&_t=${refreshKey}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="text-xs px-1.5 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>-</button>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="text-xs px-1.5 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>+</button>
        <button onClick={() => setZoom(1)} className="text-xs px-1.5 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>重置</button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
        <img src={url} alt={filePath} style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s' }} draggable={false} />
      </div>
    </div>
  )
}

// ─── 统一文档预览（PDF/Word/Excel/PPT） ───

export function JitViewerPreview({
  projectId, filePath, fileName, refreshKey
}: {
  projectId: string; filePath: string; fileName: string; refreshKey: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<ViewerInstance | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false
    Promise.all([
      import('jit-viewer').then(m => m.createViewer),
    ]).then(([createViewer]) => {
      if (destroyed || !containerRef.current) return
      const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(filePath)}`
      const isDark = document.documentElement.classList.contains('dark')
      const viewer = createViewer({
        target: containerRef.current,
        file: url,
        filename: fileName,
        theme: isDark ? 'dark' : 'light',
        toolbar: false,
        locale: 'zh-CN',
        width: '100%',
        height: '100%',
        onError: (err) => console.error('JitViewer error:', err),
      })
      viewerRef.current = viewer
      viewer.mount()
    })
    return () => { destroyed = true; viewerRef.current?.destroy(); viewerRef.current = null }
  }, [projectId, filePath, fileName, refreshKey])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <style>{`.jv-viewer__branding{position:absolute!important;top:-1000px!important}`}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
