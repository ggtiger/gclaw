'use client'

import { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileJson, Calendar } from 'lucide-react'
import { isTauri } from '@/lib/tauri'

interface ExportButtonProps {
  projectId: string
}

export function ExportButton({ projectId }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleExport = async (format: 'markdown' | 'json') => {
    if (exporting) return
    setExporting(true)
    const params = new URLSearchParams({ projectId, format })
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)

    try {
      const res = await fetch(`/api/chat/export?${params.toString()}`)
      if (!res.ok) return

      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `export.${format === 'json' ? 'json' : 'md'}`

      if (isTauri()) {
        const blob = await res.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const content = Array.from(new Uint8Array(arrayBuffer))

        const { save } = await import('@tauri-apps/plugin-dialog')
        const path = await save({
          defaultPath: filename,
          filters: [{ name: format === 'json' ? 'JSON' : 'Markdown', extensions: [format === 'json' ? 'json' : 'md'] }],
        })
        if (path) {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('save_file_content', { path, content })
        }
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch { /* ignore */ }
    setExporting(false)
    setOpen(false)
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md cursor-pointer transition-colors"
        style={{
          backgroundColor: open ? 'rgba(124, 58, 237, 0.10)' : 'transparent',
        }}
        title="导出对话"
      >
        <Download size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-lg border shadow-lg z-30 overflow-hidden animate-fade-in"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          {/* 时间范围 */}
          <div className="p-2.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <Calendar size={12} />
              时间范围（可选）
            </div>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={e => { e.stopPropagation(); setDateFrom(e.target.value); e.target.blur() }}
                className="flex-1 text-xs px-2 py-1 rounded border outline-none"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                placeholder="开始"
              />
              <input
                type="date"
                value={dateTo}
                onChange={e => { e.stopPropagation(); setDateTo(e.target.value); e.target.blur() }}
                className="flex-1 text-xs px-2 py-1 rounded border outline-none"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                placeholder="结束"
              />
            </div>
          </div>

          {/* 导出格式 */}
          <div className="py-1">
            <button
              onClick={() => handleExport('markdown')}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
              <div>
                <div className="font-medium" style={{ color: 'var(--color-text)' }}>Markdown</div>
                <div style={{ color: 'var(--color-text-muted)' }}>纯文本格式，适合阅读</div>
              </div>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <FileJson size={14} style={{ color: 'var(--color-text-muted)' }} />
              <div>
                <div className="font-medium" style={{ color: 'var(--color-text)' }}>JSON</div>
                <div style={{ color: 'var(--color-text-muted)' }}>含元数据，适合归档</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
