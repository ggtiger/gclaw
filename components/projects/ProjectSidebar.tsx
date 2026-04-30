'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { FolderOpen, FolderClosed, Plus, Trash2, Pencil, Check, X, PanelLeftClose, ChevronRight, ChevronDown, Loader2, Bot, Monitor, FileText, Settings, Settings2, Download, ExternalLink, FolderPlus, FolderInput, Shield } from 'lucide-react'
import type { ProjectInfo, ProjectMode, ProjectType, Folder } from '@/types/skills'
import { ModeSelector } from './ModeSelector'
import appIcon from '@/public/icon.png'
import { version } from '@/package.json'
import { useUpdateStore } from '@/lib/store/update-store'
import { useAssistantIdentity } from '@/hooks/useAssistantIdentity'

function getExpanded(key: string, defaultVal: boolean): boolean {
  try {
    const val = localStorage.getItem(key)
    return val === null ? defaultVal : val === 'true'
  } catch { return defaultVal }
}

function setExpanded(key: string, val: boolean) {
  try { localStorage.setItem(key, String(val)) } catch {}
}

// 项目图标子组件：使用助理头像/图标
function ProjectIcon({ projectId, assistantIcons, isCurrent }: {
  projectId: string
  assistantIcons: Record<string, { assistantIcon?: string; assistantAvatar?: string }>
  isCurrent: boolean
}) {
  const identity = useAssistantIdentity(assistantIcons[projectId], projectId)
  if (identity.avatarUrl) {
    return (
      <div className={`w-5 h-5 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 ${isCurrent ? 'ring-1 ring-purple-400/40' : ''}`}>
        <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }
  return <identity.Icon size={14} className={`flex-shrink-0 ${isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
}

interface ProjectSidebarProps {
  projects: ProjectInfo[]
  currentId: string
  activeProjectIds: Set<string>
  collapsed: boolean
  onToggleCollapse: () => void
  onSwitch: (id: string) => void
  onCreate: (name: string, type?: ProjectType, mode?: ProjectMode) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  glass?: boolean
  userRole?: 'admin' | 'user'
  onOpenSettings?: (tab?: string) => void
  onCycleTheme?: () => void
  themeIcon?: React.ReactNode
  user?: { username: string; role?: string; avatarUrl?: string }
  onUserMenu?: () => void
  onHide?: () => void
  onOpenProjectSettings?: (projectId: string) => void
  folders?: Folder[]
  projectFolderMap?: Record<string, string | null>
  ownerMeta?: Record<string, { username: string; role: string; avatarUrl?: string }>
  projectAssistantIcons?: Record<string, { assistantIcon?: string; assistantAvatar?: string }>
  currentUser?: { id: string; username: string }
  onCreateFolder?: (name: string) => void
  onRenameFolder?: (id: string, name: string) => void
  onDeleteFolder?: (id: string) => void
  onMoveProjectToFolder?: (projectId: string, folderId: string | null) => void
}

export function ProjectSidebar({
  projects, currentId, activeProjectIds, collapsed, onToggleCollapse,
  onSwitch, onCreate, onRename, onDelete, userRole,
  onOpenSettings, onCycleTheme, themeIcon, user, onUserMenu, onHide, onOpenProjectSettings,
  folders: foldersProp = [],
  projectFolderMap: folderMap = {},
  ownerMeta = {},
  projectAssistantIcons = {},
  currentUser,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveProjectToFolder,
}: ProjectSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ProjectType>('development')
  const [newMode, setNewMode] = useState<ProjectMode | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // 文件夹相关状态
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {}
    foldersProp.forEach(f => { state[f.id] = getExpanded(`gclaw-sidebar-folder-${f.id}`, true) })
    return state
  })
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({})
  const [moveDropdownId, setMoveDropdownId] = useState<string | null>(null)
  const moveDropdownRef = useRef<HTMLDivElement>(null)

  const updateStatus = useUpdateStore(s => s.status)
  const updateVersion = useUpdateStore(s => s.updateVersion)
  const updateError = useUpdateStore(s => s.errorMsg)
  const applyAndRelaunch = useUpdateStore(s => s.applyAndRelaunch)
  const tauriUpdateAvailable = useUpdateStore(s => s.tauriUpdateAvailable)
  const tauriUpdateVersion = useUpdateStore(s => s.tauriUpdateVersion)
  const tauriCanAutoInstall = useUpdateStore(s => s.tauriCanAutoInstall)
  const tauriDownloadUrl = useUpdateStore(s => s.tauriDownloadUrl)

  // 同步文件夹展开状态
  useEffect(() => {
    setExpandedFolders(prev => {
      const next = { ...prev }
      foldersProp.forEach(f => {
        if (!(f.id in next)) {
          next[f.id] = getExpanded(`gclaw-sidebar-folder-${f.id}`, true)
        }
      })
      return next
    })
  }, [foldersProp])

  // 点击外部关闭移动下拉
  useEffect(() => {
    if (!moveDropdownId) return
    const handler = (e: MouseEvent) => {
      if (moveDropdownRef.current && !moveDropdownRef.current.contains(e.target as Node)) {
        setMoveDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moveDropdownId])

  // 多用户检测：按 ownerId 分组
  const { multiUser, userGroups } = useMemo(() => {
    const ownerSet = new Set<string>()
    projects.forEach(p => { if (p.ownerId) ownerSet.add(p.ownerId) })
    const isMulti = ownerSet.size > 1

    if (!isMulti) {
      return { multiUser: false, userGroups: [] as { ownerId: string; ownerName: string; projects: ProjectInfo[] }[] }
    }

    const groupMap = new Map<string, { ownerName: string; projects: ProjectInfo[] }>()
    projects.forEach(p => {
      const oid = p.ownerId || '__none__'
      if (!groupMap.has(oid)) groupMap.set(oid, { ownerName: p.ownerName || '未知用户', projects: [] })
      groupMap.get(oid)!.projects.push(p)
    })

    // 当前用户排最前
    const groups = [...groupMap.entries()].map(([ownerId, data]) => ({
      ownerId,
      ownerName: data.ownerName,
      projects: data.projects,
    }))
    groups.sort((a, b) => {
      if (a.ownerId === currentUser?.id) return -1
      if (b.ownerId === currentUser?.id) return 1
      return 0
    })

    return { multiUser: true, userGroups: groups }
  }, [projects, currentUser])

  // 初始化用户组展开状态
  useEffect(() => {
    if (!multiUser) return
    setExpandedUsers(prev => {
      const next = { ...prev }
      userGroups.forEach(g => {
        if (!(g.ownerId in next)) {
          const isCurrent = g.ownerId === currentUser?.id
          next[g.ownerId] = getExpanded(`gclaw-sidebar-user-${g.ownerId}`, isCurrent)
        }
      })
      return next
    })
  }, [multiUser, userGroups, currentUser])

  const handleTauriUpdate = async () => {
    if (tauriCanAutoInstall) {
      onOpenSettings?.('about')
    } else if (tauriDownloadUrl) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener')
        await openUrl(tauriDownloadUrl)
      } catch {
        window.open(tauriDownloadUrl, '_blank')
      }
    } else {
      onOpenSettings?.('about')
    }
  }

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim(), newType, newMode)
      setNewName('')
      setNewType('development')
      setNewMode(undefined)
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

  const handleCreateFolder = () => {
    if (newFolderName.trim() && onCreateFolder) {
      onCreateFolder(newFolderName.trim())
      setNewFolderName('')
      setCreatingFolder(false)
    }
  }

  const handleRenameFolder = (id: string) => {
    if (editFolderName.trim() && onRenameFolder) {
      onRenameFolder(id, editFolderName.trim())
      setEditingFolderId(null)
      setEditFolderName('')
    }
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = !prev[folderId]
      setExpanded(`gclaw-sidebar-folder-${folderId}`, next)
      return { ...prev, [folderId]: next }
    })
  }

  const toggleUserGroup = (ownerId: string) => {
    setExpandedUsers(prev => {
      const next = !prev[ownerId]
      setExpanded(`gclaw-sidebar-user-${ownerId}`, next)
      return { ...prev, [ownerId]: next }
    })
  }

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  // 按文件夹分组项目
  const groupByFolder = useCallback((projectList: ProjectInfo[]) => {
    const folderProjects: Record<string, ProjectInfo[]> = {}
    const ungrouped: ProjectInfo[] = []

    foldersProp.forEach(f => { folderProjects[f.id] = [] })

    projectList.forEach(p => {
      const fid = folderMap[p.id]
      if (fid && folderProjects[fid]) {
        folderProjects[fid].push(p)
      } else {
        ungrouped.push(p)
      }
    })

    return { folderProjects, ungrouped }
  }, [foldersProp, folderMap])

  // 项目行渲染
  const renderProject = (project: ProjectInfo, showFolderOps = true) => {
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
            <ProjectIcon projectId={project.id} assistantIcons={projectAssistantIcons} isCurrent={isCurrent} />
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
                {userRole === 'admin' && project.ownerName && !multiUser && (
                  <span className="opacity-60">· {project.ownerName}</span>
                )}
              </div>
            </div>
            <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
              {showFolderOps && onMoveProjectToFolder && foldersProp.length > 0 && (
                <div className="relative" ref={moveDropdownId === project.id ? moveDropdownRef : undefined}>
                  <button
                    onClick={e => { e.stopPropagation(); setMoveDropdownId(moveDropdownId === project.id ? null : project.id) }}
                    className="p-0.5 rounded-lg cursor-pointer text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200" title="移入文件夹"
                  ><FolderInput size={11} /></button>
                  {moveDropdownId === project.id && (
                    <div className="absolute right-0 top-6 z-50 w-36 py-1 rounded-lg shadow-lg border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                      <button
                        onClick={e => { e.stopPropagation(); onMoveProjectToFolder(project.id, null); setMoveDropdownId(null) }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer"
                        style={{ color: folderMap[project.id] ? 'var(--color-text-secondary)' : 'var(--color-primary)' }}
                      >未分组</button>
                      {foldersProp.map(f => (
                        <button
                          key={f.id}
                          onClick={e => { e.stopPropagation(); onMoveProjectToFolder(project.id, f.id); setMoveDropdownId(null) }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer flex items-center gap-1.5"
                          style={{ color: folderMap[project.id] === f.id ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
                        >
                          <FolderClosed size={10} className="flex-shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {onOpenProjectSettings && (
                <button
                  onClick={e => { e.stopPropagation(); onOpenProjectSettings(project.id) }}
                  className="p-0.5 rounded-lg cursor-pointer text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200" title="项目设置"
                ><Settings2 size={11} /></button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setEditingId(project.id); setEditName(project.name) }}
                className="p-0.5 rounded-lg cursor-pointer text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200" title="重命名"
              ><Pencil size={11} /></button>
              {project.type !== 'secretary' && (
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
  }

  // 文件夹渲染
  const renderFolderGroup = (folder: Folder, folderProjects: ProjectInfo[]) => {
    const isExpanded = expandedFolders[folder.id] !== false
    const isEditing = editingFolderId === folder.id

    return (
      <div key={folder.id} className="mt-2 mb-1">
        <div
          className="group/folder mx-1.5 flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 rounded-lg cursor-pointer transition-all duration-200 border-l-2 border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-700/30"
          onClick={() => toggleFolder(folder.id)}
        >
          {isExpanded ? <ChevronDown size={12} className="flex-shrink-0 text-slate-400 dark:text-slate-500" /> : <ChevronRight size={12} className="flex-shrink-0 text-slate-400 dark:text-slate-500" />}
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={editFolderName}
                onChange={e => setEditFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameFolder(folder.id)
                  if (e.key === 'Escape') { setEditingFolderId(null); setEditFolderName('') }
                }}
                className="flex-1 px-1.5 py-0.5 rounded text-xs border outline-none min-w-0 focus:border-purple-500 transition-colors"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
              <button onClick={() => handleRenameFolder(folder.id)} className="p-0.5 cursor-pointer text-purple-600 dark:text-purple-400"><Check size={10} /></button>
              <button onClick={() => { setEditingFolderId(null); setEditFolderName('') }} className="p-0.5 cursor-pointer text-slate-400"><X size={10} /></button>
            </div>
          ) : (
            <>
              <FolderClosed size={14} className="flex-shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="flex-1 text-xs font-semibold truncate text-slate-700 dark:text-slate-200">{folder.name}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{folderProjects.length}</span>
              <div className="hidden group-hover/folder:flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                {onRenameFolder && (
                  <button onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }} className="p-0.5 rounded cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title="重命名">
                    <Pencil size={10} />
                  </button>
                )}
                {onDeleteFolder && (
                  <button onClick={() => onDeleteFolder(folder.id)} className="p-0.5 rounded cursor-pointer text-slate-400 hover:text-red-500 transition-colors" title="删除文件夹">
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {/* 文件夹内项目缩进 */}
        {isExpanded && folderProjects.length > 0 && (
          <div className="ml-3 mt-0.5 border-l border-slate-200/60 dark:border-slate-600/30">
            {folderProjects.map(p => renderProject(p))}
          </div>
        )}
      </div>
    )
  }

  // 渲染项目列表（带文件夹分组）
  const renderGroupedProjects = (projectList: ProjectInfo[]) => {
    const { folderProjects, ungrouped } = groupByFolder(projectList)
    const hasFolders = foldersProp.some(f => (folderProjects[f.id] || []).length > 0)

    return (
      <>
        {foldersProp.map(f => renderFolderGroup(f, folderProjects[f.id] || []))}
        {/* 文件夹和未分组项目之间加分隔 */}
        {hasFolders && ungrouped.length > 0 && (
          <div className="mx-4 my-1.5 border-t border-slate-200/60 dark:border-white/[0.06]" />
        )}
        {ungrouped.map(p => renderProject(p))}
      </>
    )
  }

  if (collapsed) {
    return (
      <div
        className="w-10 h-full flex flex-col items-center py-2 flex-shrink-0 glass"
      >
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-xl cursor-pointer transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400"
          title="展开项目列表"
        >
          <ChevronRight size={16} />
        </button>
        {/* 底部工具栏 - 收起态 */}
        <div className="mt-auto  border-gray-200 dark:border-white/[0.06] py-2 flex flex-col items-center gap-1">
          <button onClick={() => onOpenSettings?.()} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="设置">
            <Settings size={16} />
          </button>
          <button onClick={onCycleTheme} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="切换主题">
            {themeIcon}
          </button>
          {user && (
            <button onClick={onUserMenu} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer overflow-hidden" title={user.username}>
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                : user.username.charAt(0).toUpperCase()
              }
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-56 h-full flex flex-col flex-shrink-0 glass"
    >
      {/* macOS 红绿灰空间 + GClaw 品牌区域 */}
      <div
        data-tauri-drag-region
        className="pt-3 pl-[16px] pr-3 pb-2 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* GClaw 图标 + 名称 + 版本 */}
        <div className="flex items-center gap-2" >
          <Image src={appIcon} alt="GClaw" width={20} height={20} className="w-5 h-5 rounded" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">GClaw</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">v{version}</span>
          {updateStatus === 'ready' && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                applyAndRelaunch()
              }}
              className="ml-1 px-1.5 py-0.5 text-[10px] bg-blue-500 hover:bg-blue-600 text-white rounded animate-pulse cursor-pointer transition-colors whitespace-nowrap shrink-0"
              title={`更新到 v${updateVersion}`}
            >
              重启更新
            </button>
          )}
          {updateStatus === 'applying' && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded whitespace-nowrap shrink-0 animate-pulse">
              更新中...
            </span>
          )}
          {updateStatus === 'error' && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded whitespace-nowrap shrink-0 cursor-help" title={updateError || '更新失败'}>
              更新失败
            </span>
          )}
          {tauriUpdateAvailable && updateStatus !== 'ready' && updateStatus !== 'applying' && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleTauriUpdate() }}
              className="ml-1 px-1.5 py-0.5 text-[10px] bg-purple-600 hover:bg-purple-700 text-white rounded animate-pulse cursor-pointer transition-colors whitespace-nowrap shrink-0 flex items-center gap-0.5"
              title={`新版本 v${tauriUpdateVersion} 可用`}
            >
              {tauriCanAutoInstall ? <Download size={10} /> : <ExternalLink size={10} />}
              v{tauriUpdateVersion}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onHide}
            className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer"
            title="收起侧边栏"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      {/* Header - 项目标题 */}
      <div className="flex items-center justify-between px-3 py-2 " style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center gap-1.5">
          <FolderOpen size={14} className="text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>项目</span>
        </div>
        <div className="flex items-center gap-0.5">
          {onCreateFolder && (
            <button
              onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
              className="p-1 rounded-xl cursor-pointer transition-all duration-200 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
              title="新建文件夹"
            >
              <FolderPlus size={14} />
            </button>
          )}
          <button
            onClick={() => { setCreating(!creating); setNewName('') }}
            className="p-1 rounded-xl cursor-pointer transition-all duration-200 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
            title="新建项目"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* New folder input */}
      {creatingFolder && (
        <div className="px-2 py-1.5 border-b" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="flex items-center gap-1">
            <FolderClosed size={13} className="flex-shrink-0 text-amber-500 dark:text-amber-400" />
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
              }}
              placeholder="文件夹名称"
              className="flex-1 px-2 py-1 rounded-lg text-xs border outline-none min-w-0 focus:border-purple-500 transition-colors"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            <button onClick={handleCreateFolder} className="p-1 rounded-lg cursor-pointer text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all duration-200">
              <Check size={14} />
            </button>
            <button onClick={() => { setCreatingFolder(false); setNewFolderName('') }} className="p-1 rounded-lg cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-200">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

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
          {/* 协作模式选择 */}
          <ModeSelector value={newMode} onChange={setNewMode} />
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

        {multiUser ? (
          // 多用户：按用户分组，带头像和角色
          userGroups.map(group => {
            const isExpanded = expandedUsers[group.ownerId] !== false
            const meta = ownerMeta[group.ownerId]
            const isMe = group.ownerId === currentUser?.id
            return (
              <div key={group.ownerId} className="mb-1">
                <div
                  className="mx-1.5 flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  onClick={() => toggleUserGroup(group.ownerId)}
                >
                  {isExpanded ? <ChevronDown size={12} className="flex-shrink-0 text-slate-400" /> : <ChevronRight size={12} className="flex-shrink-0 text-slate-400" />}
                  {/* 头像 */}
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 bg-purple-500/15 text-purple-600 dark:text-purple-400 overflow-hidden">
                    {meta?.avatarUrl
                      ? <img src={meta.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : group.ownerName.charAt(0).toUpperCase()
                    }
                  </div>
                  {/* 名称 + 角色标签 */}
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{group.ownerName}</span>
                    {meta?.role === 'admin' && (
                      <Shield size={10} className="flex-shrink-0 text-amber-500" />
                    )}
                    {isMe && (
                      <span className="text-[9px] px-1 py-px rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex-shrink-0">我</span>
                    )}
                  </div>
                  {/* 项目数 */}
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{group.projects.length}</span>
                </div>
                {isExpanded && (isMe ? renderGroupedProjects(group.projects) : group.projects.map(p => renderProject(p, false)))}
              </div>
            )
          })
        ) : (
          // 单用户：直接显示文件夹+项目
          renderGroupedProjects(projects)
        )}
      </div>

      {/* 底部工具栏 - 展开态 */}
      <div className="mt-auto  border-gray-200 dark:border-white/[0.06] px-3 py-2 flex items-center gap-1">
        <button onClick={() => onOpenSettings?.()} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="设置">
          <Settings size={16} />
        </button>
        <button onClick={onCycleTheme} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="切换主题">
          {themeIcon}
        </button>
        <div className="flex-1" />
        {user && (
          <button onClick={onUserMenu} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer overflow-hidden" title={user.username}>
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              : user.username.charAt(0).toUpperCase()
            }
          </button>
        )}
      </div>
    </div>
  )
}
