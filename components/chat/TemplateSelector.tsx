'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, Plus, X, ChevronDown } from 'lucide-react'

interface Template {
  id: string
  name: string
  description: string
  systemPrompt: string
  firstMessage: string
  isBuiltIn: boolean
}

interface TemplateSelectorProps {
  projectId: string
  onSelect: (template: Template) => void
}

export function TemplateSelector({ projectId, onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch {
      console.error('加载模板失败')
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (templates.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors border"
        style={{
          borderColor: open ? 'var(--color-primary)' : 'var(--color-border)',
          backgroundColor: open ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
          color: open ? 'var(--color-primary)' : 'var(--color-text-muted)',
        }}
      >
        <FileText size={13} />
        模板
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 max-h-64 rounded-lg border shadow-lg z-20 overflow-hidden animate-fade-in"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="max-h-60 overflow-y-auto py-1">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => { onSelect(tpl); setOpen(false) }}
                className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
                style={{ color: 'var(--color-text)' }}
              >
                <div className="flex items-center gap-1.5">
                  <FileText size={13} style={{ color: 'var(--color-primary)' }} />
                  <span className="text-sm font-medium">{tpl.name}</span>
                  {tpl.isBuiltIn && (
                    <span className="text-[10px] px-1 py-0 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                      内置
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {tpl.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
