'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'

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

// ─── PDF 预览 ───

export function PDFPreview({ projectId, filePath, fileName }: { projectId: string; filePath: string; fileName: string }) {
  const url = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(filePath)}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PDF · {fileName}</span>
      </div>
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <iframe
          src={url}
          className="absolute inset-0 w-full h-full border-0"
          title={fileName}
        />
      </div>
    </div>
  )
}

// ─── Word 预览 ───

export function WordPreview({ projectId, filePath }: { projectId: string; filePath: string }) {
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const downloadUrl = `/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(filePath)}`
        const res = await fetch(downloadUrl)
        if (!res.ok) throw new Error('下载文件失败')
        const arrayBuffer = await res.arrayBuffer()
        if (cancelled) return
        const base64 = btoa(new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), ''))
        const convertRes = await fetch('/api/convert/word-to-markdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: base64 }),
        })
        const result = await convertRes.json()
        if (cancelled) return
        if (result.success) {
          setMarkdown(result.markdown || '（空文档）')
        } else {
          setError(result.error || '转换失败')
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, filePath])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>解析 Word 文档...</span>
      </div>
    )
  }
  if (error) {
    return <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-error)' }}>{error}</div>
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Word 文档</span>
      </div>
      <div className="flex-1 overflow-auto p-3 thin-scrollbar">
        <div className="markdown-body text-xs leading-[1.6]"><MarkdownRenderer content={markdown} /></div>
      </div>
    </div>
  )
}

// ─── Excel 预览 ───

export function ExcelPreview({ projectId, filePath }: { projectId: string; filePath: string }) {
  const [sheets, setSheets] = useState<{ name: string; data: string[][] }[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const XLSX = await import('xlsx')
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(filePath)}`)
        if (!res.ok) throw new Error('下载失败')
        const arrayBuffer = await res.arrayBuffer()
        if (cancelled) return
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const parsedSheets = workbook.SheetNames.map(name => {
          const worksheet = workbook.Sheets[name]
          const data: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          return { name, data: data.map(row => row.map((cell: unknown) => String(cell ?? ''))) }
        })
        setSheets(parsedSheets)
        setActiveSheet(0)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, filePath])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>解析 Excel 文档...</span>
      </div>
    )
  }
  if (error) {
    return <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-error)' }}>{error}</div>
  }
  if (sheets.length === 0) {
    return <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-text-muted)' }}>空工作簿</div>
  }

  const sheet = sheets[activeSheet]

  return (
    <div className="flex flex-col h-full">
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0 overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
          {sheets.map((s, i) => (
            <button key={i} onClick={() => setActiveSheet(i)}
              className="text-xs px-2 py-0.5 rounded shrink-0 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: i === activeSheet ? 'var(--color-primary)' : 'transparent',
                color: i === activeSheet ? 'white' : 'var(--color-text-secondary)',
              }}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        {sheet.data.length > 0 ? (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {sheet.data[0].map((header, ci) => (
                  <th key={ci} className="border px-2 py-1 text-left font-semibold"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.data.slice(1).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border px-2 py-1"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: ri % 2 === 0 ? 'transparent' : 'var(--color-bg-tertiary)' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-8 text-xs" style={{ color: 'var(--color-text-muted)' }}>空工作表</div>
        )}
      </div>
    </div>
  )
}

// ─── PPT 预览 ───

export function PPTPreview({ projectId, filePath }: { projectId: string; filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [{ init }, res] = await Promise.all([
          import('pptx-preview'),
          fetch(`/api/projects/${encodeURIComponent(projectId)}/files?action=download&path=${encodeURIComponent(filePath)}`),
        ])
        if (!res.ok) throw new Error('下载失败')
        if (cancelled || !containerRef.current || !wrapperRef.current) return
        containerRef.current.innerHTML = ''
        const arrayBuffer = await res.arrayBuffer()
        if (cancelled || !containerRef.current) return
        const rect = wrapperRef.current.getBoundingClientRect()
        const w = Math.max(rect.width - 32, 400)
        const h = Math.max(rect.height - 32, 300)
        const previewer = init(containerRef.current, { width: w, height: h })
        await previewer.preview(arrayBuffer)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '渲染失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [projectId, filePath])

  if (error) {
    return <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-error)' }}>{error}</div>
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="text-xs px-1 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>-</button>
        <span className="text-xs mx-1" style={{ color: 'var(--color-text-muted)' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="text-xs px-1 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>+</button>
      </div>
      <div ref={wrapperRef} className="flex-1 overflow-auto thin-scrollbar flex items-start justify-center p-4" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
        {loading && (
          <div className="flex items-center gap-2 py-8">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>渲染 PPT...</span>
          </div>
        )}
        <div
          ref={containerRef}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s' }}
        />
      </div>
    </div>
  )
}
