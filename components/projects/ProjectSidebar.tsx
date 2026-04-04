'use client'

import { useState } from 'react'
import { FolderOpen, Plus, Trash2, Pencil, Check, X, ChevronLeft, ChevronRight, Loader2, Bot, Monitor, FileText, Settings } from 'lucide-react'
import type { ProjectInfo, ProjectType } from '@/types/skills'

interface ProjectSidebarProps {
  projects: ProjectInfo[]
  currentId: string
  activeProjectIds: Set<string>
  collapsed: boolean
  onToggleCollapse: () => void
  onSwitch: (id: string) => void
  onCreate: (name: string, type?: ProjectType) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  glass?: boolean
  userRole?: 'admin' | 'user'
  onOpenSettings?: () => void
  onCycleTheme?: () => void
  themeIcon?: React.ReactNode
  user?: { username: string; role?: string }
  onUserMenu?: () => void
  onHide?: () => void
}

export function ProjectSidebar({
  projects, currentId, activeProjectIds, collapsed, onToggleCollapse,
  onSwitch, onCreate, onRename, onDelete, userRole,
  onOpenSettings, onCycleTheme, themeIcon, user, onUserMenu, onHide,
}: ProjectSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ProjectType>('development')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim(), newType)
      setNewName('')
      setNewType('development')
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
        className="w-10 h-full flex flex-col items-center py-2 flex-shrink-0 rounded-2xl glass border border-white/40 dark:border-white/[0.06] shadow-sm"
      >
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-xl cursor-pointer transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400"
          title="展开项目列表"
        >
          <ChevronRight size={16} />
        </button>
        {/* 底部工具栏 - 收起态 */}
        <div className="mt-auto border-t border-gray-200 dark:border-white/[0.06] py-2 flex flex-col items-center gap-1">
          <button onClick={onOpenSettings} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="设置">
            <Settings size={16} />
          </button>
          <button onClick={onCycleTheme} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="切换主题">
            {themeIcon}
          </button>
          {user && (
            <button onClick={onUserMenu} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer" title={user.username}>
              {user.username.charAt(0).toUpperCase()}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-56 h-full flex flex-col flex-shrink-0 rounded-2xl glass border border-white/40 dark:border-white/[0.06] shadow-sm"
    >
      {/* macOS 红绿灯空间 + GClaw 品牌区域 */}
      <div
        data-tauri-drag-region
        className="pt-3 pl-[16px] pr-3 pb-2 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* GClaw 图标 + 名称 + 版本 */}
        <div className="flex items-center gap-2" >
          <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">G</span>
          </div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">GClaw</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">v0.1.0</span>
          <div className="flex-1" />
          <button
            onClick={onHide}
            className="p-1 rounded-lg cursor-pointer transition-colors text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-600 dark:hover:text-gray-300"
            title="收起侧边栏"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Header - 项目标题 */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center gap-1.5">
          <FolderOpen size={14} className="text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>项目</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setCreating(!creating); setNewName('') }}
            className="p-1 rounded-xl cursor-pointer transition-all duration-200 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
            title="新建项目"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* New project input */}
      {creating && (
        <div className="px-2 py-2 border-b" style={{ borderColor: 'var(--panel-border)' }}>
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
              className="flex-1 px-2 py-1 rounded-lg text-xs border outline-none min-w-0 focus:border-purple-500 transition-colors"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            <button onClick={handleCreate} className="p-1 rounded-lg cursor-pointer text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200">
              <Check size={14} />
            </button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="p-1 rounded-lg cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-200">
              <X size={14} />
            </button>
          </div>
          {/* 类型选择 */}
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => setNewType('development')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-lg border transition-all duration-200 cursor-pointer ${
                newType === 'development'
                  ? 'bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-300'
                  : 'bg-white/40 dark:bg-white/5 border-white/50 dark:border-white/[0.06] text-slate-600 dark:text-slate-400'
              }`}
            >
              <Monitor size={12} />
              <span>开发</span>
            </button>
            <button
              type="button"
              onClick={() => setNewType('office')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-lg border transition-all duration-200 cursor-pointer ${
                newType === 'office'
                  ? 'bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-300'
                  : 'bg-white/40 dark:bg-white/5 border-white/50 dark:border-white/[0.06] text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText size={12} />
              <span>办公</span>
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {projects.length === 0 && !creating && (
          <div className="text-center py-8">
            <FolderOpen size={28} className="mx-auto mb-2 text-slate-400" />
            <div className="text-xs text-slate-400">暂无项目，点击上方 + 创建</div>
            <button
              onClick={() => { setCreating(true); setNewName('') }}
              className="mt-2 text-xs px-3 py-1 rounded-xl cursor-pointer text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200"
            >创建第一个项目</button>
          </div>
        )}
        {projects.map(project => {
          const isCurrent = project.id === currentId
          const isEditing = editingId === project.id
          const isConfirmDel = confirmDeleteId === project.id
          const isRunning = activeProjectIds.has(project.id)

          return (
            <div
              key={project.id}
              className={`group mx-1.5 mb-0.5 rounded-xl transition-all duration-200 ${isCurrent ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300' : 'hover:bg-purple-50 dark:hover:bg-purple-500/10'}`}
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
                    className="flex-1 px-1.5 py-0.5 rounded-lg text-xs border outline-none min-w-0 focus:border-purple-500 transition-colors"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                  />
                  <button onClick={() => handleRename(project.id)} className="p-0.5 cursor-pointer text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all duration-200">
                    <Check size={12} />
                  </button>
                  <button onClick={() => { setEditingId(null); setEditName('') }} className="p-0.5 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-200">
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
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer rounded-xl transition-all duration-200"
                  style={{ color: isCurrent ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') onSwitch(project.id) }}
                >
                  <FolderOpen size={14} className={`flex-shrink-0 ${isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">{project.name}</span>
                      {project.type === 'secretary' && (
                        <span title="秘书项目"><Bot size={10} className="flex-shrink-0 text-purple-500" /></span>
                      )}
                      {isRunning && (
                        <Loader2 size={10} className="animate-spin flex-shrink-0 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div className="text-xs flex items-center gap-1 text-slate-400">
                      <span>{formatDate(project.updatedAt)}</span>
                      {userRole === 'admin' && project.ownerName && (
                        <span className="opacity-60">· {project.ownerName}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(project.id); setEditName(project.name) }}
                      className="p-0.5 rounded-lg cursor-pointer text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200" title="重命名"
                    ><Pencil size={11} /></button>
                    {projects.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(project.id) }}
                        className="p-0.5 rounded-lg cursor-pointer text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all duration-200" title="删除"
                      ><Trash2 size={11} /></button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部工具栏 - 展开态 */}
      <div className="mt-auto border-t border-gray-200 dark:border-white/[0.06] px-3 py-2 flex items-center gap-1">
        <button onClick={onOpenSettings} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="设置">
          <Settings size={16} />
        </button>
        <button onClick={onCycleTheme} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="切换主题">
          {themeIcon}
        </button>
        <div className="flex-1" />
        {user && (
          <button onClick={onUserMenu} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer" title={user.username}>
            {user.username.charAt(0).toUpperCase()}
          </button>
        )}
      </div>
    </div>
  )
}
