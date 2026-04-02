'use client'

import { useState } from 'react'
import { FolderOpen, Plus, Trash2, Pencil, Check, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { ProjectInfo } from '@/types/skills'

interface ProjectSidebarProps {
  projects: ProjectInfo[]
  currentId: string
  activeProjectIds: Set<string>
  collapsed: boolean
  onToggleCollapse: () => void
  onSwitch: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  glass?: boolean
}

export function ProjectSidebar({
  projects, currentId, activeProjectIds, collapsed, onToggleCollapse,
  onSwitch, onCreate, onRename, onDelete, glass,
}: ProjectSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim())
      setNewName('')
      setCreating(false)
    }
  }

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRename(id, editName.trim())
      setEditingId(null)
      setEditName('')
    }
  }

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  if (collapsed) {
    return (
      <div
        className={`w-10 flex flex-col items-center py-2 border-r flex-shrink-0 ${glass ? 'glass' : ''}`}
        style={glass ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          title="展开项目列表"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`w-56 flex flex-col border-r flex-shrink-0 ${glass ? 'glass' : ''}`}
      style={glass ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: glass ? 'var(--glass-border)' : 'var(--color-border)' }}>
        <div className="flex items-center gap-1.5">
          <FolderOpen size={14} style={{ color: 'var(--color-primary)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>项目</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setCreating(!creating); setNewName('') }}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            title="新建项目"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            title="收起"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* New project input */}
      {creating && (
        <div className="px-2 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex gap-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="项目名称"
              className="flex-1 px-2 py-1 rounded text-xs border outline-none min-w-0"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            <button onClick={handleCreate} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-primary)' }}>
              <Check size={14} />
            </button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {projects.map(project => {
          const isCurrent = project.id === currentId
          const isEditing = editingId === project.id
          const isConfirmDel = confirmDeleteId === project.id
          const isRunning = activeProjectIds.has(project.id)

          return (
            <div
              key={project.id}
              className="group mx-1.5 mb-0.5 rounded-lg transition-all"
              style={{
                backgroundColor: isCurrent ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : undefined,
              }}
            >
              {isEditing ? (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(project.id)
                      if (e.key === 'Escape') { setEditingId(null); setEditName('') }
                    }}
                    className="flex-1 px-1.5 py-0.5 rounded text-xs border outline-none min-w-0"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                  />
                  <button onClick={() => handleRename(project.id)} className="p-0.5 cursor-pointer" style={{ color: 'var(--color-primary)' }}>
                    <Check size={12} />
                  </button>
                  <button onClick={() => { setEditingId(null); setEditName('') }} className="p-0.5 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
                    <X size={12} />
                  </button>
                </div>
              ) : isConfirmDel ? (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-error, #ef4444)' }}>确认删除?</span>
                  <button
                    onClick={() => { onDelete(project.id); setConfirmDeleteId(null) }}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                    style={{ backgroundColor: 'var(--color-error, #ef4444)', color: '#fff' }}
                  >删除</button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                    style={{ color: 'var(--color-text-muted)' }}
                  >取消</button>
                </div>
              ) : (
                <div
                  onClick={() => onSwitch(project.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer rounded-lg hover:bg-[var(--color-bg-secondary)] transition-all"
                  style={{ color: isCurrent ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') onSwitch(project.id) }}
                >
                  <FolderOpen size={13} style={{ color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-muted)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate">{project.name}</span>
                      {isRunning && (
                        <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                      )}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{formatDate(project.updatedAt)}</div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(project.id); setEditName(project.name) }}
                      className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }} title="重命名"
                    ><Pencil size={11} /></button>
                    {projects.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(project.id) }}
                        className="p-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }} title="删除"
                      ><Trash2 size={11} /></button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
