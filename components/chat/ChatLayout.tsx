'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sun, Moon, Monitor, Eye, Code2, Maximize2, Minimize2, PanelRightClose
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ProjectSettingsPanel } from '../settings/ProjectSettingsPanel'
import { AccountPanel } from '../settings/AccountPanel'
import { AgentsPanel } from '../agents/AgentsPanel'
import { AgentTemplatePanel } from '../agents/AgentTemplatePanel'
import { ChannelsPanel } from '../channels/ChannelsPanel'
import { SchedulesPanel } from '../schedules/SchedulesPanel'
import { ProjectSidebar } from '../projects/ProjectSidebar'
import FocusPanel from '../panels/FocusPanel'
import FilesPanel from '../panels/FilesPanel'
import ActivityPanel from '../panels/ActivityPanel'
import { PreviewPanel } from '../dev-mode/PreviewPanel'
import { CommandPalette } from './CommandPalette'
import { useChat, useActiveProjects } from '@/hooks/useChat'
import { useProject } from '@/hooks/useProject'
import { useTheme } from '@/hooks/useTheme'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAuth } from '@/hooks/useAuth'
import { isTauri } from '@/lib/tauri'
import Modal from '@/components/ui/Modal'
import { WindowControls } from '@/components/ui/WindowControls'

export function ChatLayout() {
  const project = useProject()
  const [modalOpen, setModalOpen] = useState<'skills' | 'agents' | 'agentTemplates' | 'channels' | 'settings' | 'projectSettings' | 'account' | 'schedules' | null>(null)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'preferences' | 'settings'>('preferences')
  const chat = useChat(project.currentId, () => { setSettingsInitialTab('settings'); setModalOpen('settings') })
  const activeProjectIds = useActiveProjects()
  const { theme, setTheme, backgroundImage, setBackgroundImage } = useTheme()
  const { user, loading: authLoading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)
  const [projectSidebarHidden, setProjectSidebarHidden] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [filesFullscreen, setFilesFullscreen] = useState(false)
  const [rightPanelHidden, setRightPanelHidden] = useState(false)
  const [devPanelTab, setDevPanelTab] = useState<'files' | 'preview' | 'devPreview'>('files')
  const [devModeStatus, setDevModeStatus] = useState<{ state: string; previewUrl?: string; projectId?: string } | null>(null)
  const [filesRefreshKey, setFilesRefreshKey] = useState(0)
  const [diffFilePath, setDiffFilePath] = useState<string | null>(null)
  // 秘书面板当前标签（用于判断是否启用拖拽/全屏）
  const [secretaryTab, setSecretaryTab] = useState<string>('focus')

  // AI 工具操作完成后刷新文件树 + git 状态
  useEffect(() => {
    if (chat.activityData.fileChanges.length > 0) {
      setFilesRefreshKey(k => k + 1)
    }
  }, [chat.activityData.fileChanges.length])

  // 轮询开发模式状态
  useEffect(() => {
    const fetchDevMode = () => {
      fetch('/api/dev-mode')
        .then(res => res.json())
        .then(data => setDevModeStatus(data))
        .catch(() => {})
    }
    fetchDevMode()
    const interval = setInterval(fetchDevMode, 8000)
    return () => clearInterval(interval)
  }, [])

  // 监听 dev mode 项目切换事件
  useEffect(() => {
    const handler = async (e: Event) => {
      const { projectId } = (e as CustomEvent).detail
      if (projectId) {
        // 先刷新项目列表（dev mode 可能刚创建了新项目）
        await project.refreshProjects()
        project.switchProject(projectId)
      }
    }
    window.addEventListener('gclaw:switch-project', handler)
    return () => window.removeEventListener('gclaw:switch-project', handler)
  }, [project])

  // 右侧面板拖拽调整宽度
  const [rightPanelWidth, setRightPanelWidth] = useState(320)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = rightPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    // 创建透明遮罩层阻止 iframe 捕获鼠标事件
    const overlay = document.createElement('div')
    overlay.id = 'panel-resize-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;'
    document.body.appendChild(overlay)
  }, [rightPanelWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const diff = startX.current - e.clientX
      const newWidth = Math.max(200, startWidth.current + diff)
      setRightPanelWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // 移除遮罩层
      document.getElementById('panel-resize-overlay')?.remove()
    }
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // 判断是否为移动端（<768px），移动端降级毛玻璃为纯色
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // 项目类型判断
  const currentProject = project.projects.find(p => p.id === project.currentId)
  const projectType = currentProject?.type || 'secretary'
  const isSecretary = projectType === 'secretary'

  // 子项目列表（秘书项目用于 @转发）
  const [subProjects, setSubProjects] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    if (!isSecretary || !project.currentId) {
      setSubProjects([])
      return
    }
    fetch(`/api/agents?projectId=${project.currentId}`)
      .then(res => res.json())
      .then(data => {
        setSubProjects(data.subProjects || [])
      })
      .catch(() => {})
  }, [isSecretary, project.currentId])

  // 包装 sendMessage：检测 @项目名 并转发（秘书项目不调用 SDK）
  const handleSendWithRelay = useCallback(async (text: string, attachments?: unknown[]) => {
    // 非秘书项目 或 没有子项目：正常发送
    if (!isSecretary || subProjects.length === 0) {
      await chat.sendMessage(text, attachments as import('@/types/chat').ChatAttachment[])
      return
    }

    // 检测 @项目名
    const relayTargets: Array<{ projectId: string; projectName: string }> = []
    for (const sp of subProjects) {
      const escaped = sp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const mentionPattern = new RegExp(`@${escaped}(?:\\s|$)`, 'u')
      if (mentionPattern.test(text)) {
        relayTargets.push({ projectId: sp.id, projectName: sp.name })
      }
    }

    // 没有 @项目名：正常发送
    if (relayTargets.length === 0) {
      await chat.sendMessage(text, attachments as import('@/types/chat').ChatAttachment[])
      return
    }

    // 有 @项目名：只转发，不调用秘书 SDK
    // 1. 本地添加用户消息（即时显示，持久化由 relay API 完成）
    chat.addLocalMessage({
      id: `msg_${Date.now()}_relay_user`,
      role: 'user',
      content: text,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    })

    // 2. 逐个转发到子项目（sendToProject 读取 SSE 流，子项目有实时执行效果）
    for (const target of relayTargets) {
      chat.addLocalMessage({
        id: `msg_${Date.now()}_relay_ok_${target.projectId}`,
        role: 'system',
        content: `已转发到「${target.projectName}」`,
        messageType: 'text',
        createdAt: new Date().toISOString(),
      })
      // 不 await，并行执行多个子项目
      chat.sendToProject(
        target.projectId,
        text,
        currentProject?.name || '秘书',
        project.currentId,
      ).catch(err => {
        console.error(`[Relay] Failed for ${target.projectName}:`, err)
      })
    }
  }, [chat, isSecretary, subProjects, currentProject?.name, project.currentId])

  const themeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={18} />
      case 'dark': return <Moon size={18} />
      case 'system': return <Monitor size={18} />
    }
  }

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }

  // 禁用右键菜单（Tauri WebView 的 reload、autofill 等）
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  // Tauri 窗口拖拽：每次 mousedown 检查 __TAURI_INTERNALS__，兼容打包后注入时机
  useEffect(() => {
    if (typeof window === 'undefined') return
    // 缓存 Tauri 内部接口引用，避免每次 mousedown 都访问
    let tauriInvoke: ((cmd: string, args?: unknown) => Promise<unknown>) | null = null
    const checkTauri = () => {
      const ti = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } | undefined
      tauriInvoke = ti?.invoke || null
    }
    checkTauri()
    // 延迟检查，因为打包后可能延迟注入
    const timer = setTimeout(checkTauri, 2000)
    const handler = (e: MouseEvent) => {
      if (!tauriInvoke) return
      const target = e.target as HTMLElement
      // 交互元素不拖动
      if (target.closest('button, a, input, textarea, select, [role="button"]')) return
      // no-drag 区域内不拖动（聊天区、侧边栏内容等）
      if (target.closest('[data-tauri-no-drag]')) return
      // 向上查找 drag region — 用 closest 替代手动 while 循环
      if (!target.closest('[data-tauri-drag-region]')) return
      e.preventDefault()
      tauriInvoke('plugin:window|start_dragging', { label: 'main' }).catch(() => {})
    }
    document.addEventListener('mousedown', handler)
    return () => { document.removeEventListener('mousedown', handler); clearTimeout(timer) }
  }, [])

  // 键盘快捷键
  useKeyboardShortcuts({
    onEscape: () => {
      if (commandPaletteOpen) { setCommandPaletteOpen(false); return }
      if (modalOpen) { setModalOpen(null); return }
    },
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onCloseCommandPalette: () => setCommandPaletteOpen(false),
    onClearChat: chat.clearChat,
    onCycleTheme: cycleTheme,
    onFocusInput: () => {
      const input = document.querySelector<HTMLTextAreaElement>('.chat-input textarea')
      input?.focus()
    },
  })

  // 客户端认证检查：未登录则跳转到登录页
  useEffect(() => {
    if (!authLoading && !user) {
      if (isTauri()) {
        // Tauri 桌面端：通过 Rust 命令导航，避免 asset protocol 重定向问题
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('navigate_to', { path: '/login' }).catch(() => {
            window.location.href = '/login'
          })
        }).catch(() => {
          window.location.href = '/login'
        })
      } else {
        window.location.href = '/login'
      }
    }
  }, [authLoading, user])

  if (authLoading || !user) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // 等待项目加载
  if (project.loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>加载中...</div>
      </div>
    )
  }

  // Secretary 风格始终启用毛玻璃效果（移动端除外）
  const glass = !isMobile

  return (
    <div className="h-screen flex flex-col relative" style={{ backgroundColor: 'transparent' }}>
      {/* Windows 窗口控制按钮（右上角） */}
      <WindowControls />
      {/* 自定义背景图 */}
      {backgroundImage && (
        <div
          className="app-background"
          style={{ backgroundImage: `url(${backgroundImage})`, backgroundColor: 'var(--color-bg)' }}
        />
      )}

      {/* 装饰光晕 — 跟随主题颜色的三色光晕 */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 dark:opacity-12"
          style={{ background: 'radial-gradient(circle, var(--halo-color-1) 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full opacity-25 dark:opacity-10"
          style={{ background: 'radial-gradient(circle, var(--halo-color-2) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full opacity-25 dark:opacity-10"
          style={{ background: 'radial-gradient(circle, var(--halo-color-3) 0%, transparent 70%)' }} />
      </div>

      {/* Main Area - flex row */}
      <div
        className="flex-1 flex gap-2 px-2 pb-2 pt-2 min-h-0 min-w-0 overflow-hidden relative z-10 "
      >
        {/* Left: Project Sidebar - 独立圆角卡片 (桌面端 ≥960px) */}
        {!projectSidebarHidden && !filesFullscreen && (
        <div className="hidden [@media(min-width:960px)]:flex flex-shrink-0 transition-all duration-200">
          <ProjectSidebar
            projects={project.projects}
            currentId={project.currentId}
            activeProjectIds={activeProjectIds}
            collapsed={projectSidebarCollapsed}
            onToggleCollapse={() => setProjectSidebarCollapsed(!projectSidebarCollapsed)}
            onSwitch={project.switchProject}
            onCreate={(name, type, mode) => project.createProject(name, type, mode)}
            onRename={project.renameProject}
            onDelete={project.deleteProject}
            glass={glass}
            userRole={user?.role}
            onOpenSettings={() => setModalOpen('settings')}
            onCycleTheme={cycleTheme}
            themeIcon={themeIcon()}
            user={user ? { username: user.username, role: user.role } : undefined}
            onUserMenu={() => setModalOpen('account')}
            onHide={() => setProjectSidebarHidden(true)}
            onOpenProjectSettings={(id) => {
              if (id !== project.currentId) project.switchProject(id)
              setModalOpen('projectSettings')
            }}
          />
        </div>
        )}

        {/* Chat area - 聊天区不用 backdrop-filter（WebView2 滚动性能杀手） */}
        {!filesFullscreen && (
        <main
          className={`flex-1 flex flex-col ${isSecretary ? 'min-w-[500px]' : 'min-w-[350px]'} overflow-hidden glass relative`}
        >
          <ChatPanel
            messages={chat.messages}
            initialLoading={chat.initialLoading}
            hasMore={chat.hasMore}
            onLoadMore={chat.loadMoreMessages}
            streamingBlocks={chat.streamingBlocks}
            thinkingContent={chat.thinkingContent}
            sending={chat.sending}
            permissionRequest={chat.permissionRequest}
            askQuestion={chat.askQuestion}
            statusText={chat.statusText}
            projectId={project.currentId}
            sessionStats={chat.sessionStats}
            projectName={currentProject?.name}
            sidebarHidden={projectSidebarHidden}
            onToggleSidebar={() => setProjectSidebarHidden(false)}
            onOpenMobileSidebar={() => setSidebarOpen(true)}
            rightPanelHidden={rightPanelHidden}
            onToggleRightPanel={() => setRightPanelHidden(false)}
            onSend={handleSendWithRelay}
            onAbort={chat.abortChat}
            onClearChat={chat.clearChat}
            onRespondPermission={chat.respondPermission}
            onRespondAskQuestion={chat.respondAskQuestion}
            onUpdateMessage={chat.updateMessage}
            onOpenChannels={() => setModalOpen('channels')}
            onOpenSkills={() => setModalOpen('skills')}
            onOpenAgents={() => setModalOpen('agents')}
            onOpenSchedules={() => setModalOpen('schedules')}
            onOpenSettings={() => setModalOpen('settings')}
            onScheduleSend={async (message, schedule) => {
              try {
                const res = await fetch('/api/schedules', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: `定时消息: ${message.slice(0, 20)}...`,
                    type: 'chat-message',
                    schedule: {
                      mode: schedule.mode,
                      runAt: schedule.runAt,
                      intervalMs: schedule.intervalMs,
                    },
                    config: { message },
                    projectId: project.currentId,
                  }),
                })
                if (res.ok) {
                  chat.addLocalMessage({
                    id: `msg_${Date.now()}_scheduled`,
                    role: 'system',
                    content: `已设置定时发送: ${schedule.label}`,
                    messageType: 'text',
                    createdAt: new Date().toISOString(),
                  })
                }
              } catch (err) {
                console.error('Failed to schedule message:', err)
              }
            }}
          />
        </main>
        )}

        {/* Right side panel */}
        {!rightPanelHidden && (
        <aside
          className={`relative min-h-0 ${
            filesFullscreen
              ? 'flex-1 flex'
              : isSecretary
                ? (secretaryTab === 'files' ? 'flex-shrink-0 min-w-[200px] hidden [@media(min-width:1024px)]:flex' : 'w-80 max-w-[280px] min-w-[200px] shrink hidden [@media(min-width:1024px)]:flex')
                : 'flex-shrink-0 hidden [@media(min-width:1024px)]:flex'
          }`}
          style={{ width: filesFullscreen ? '100%' : (isSecretary && secretaryTab !== 'files') ? undefined : rightPanelWidth } as React.CSSProperties}
        >
          {/* 拖拽手柄 - 秘书文件标签或开发项目，非全屏时显示 */}
          {((isSecretary && secretaryTab === 'files') || !isSecretary) && !filesFullscreen && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-50 hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors"
            title="拖拽调整宽度"
          />
          )}
          {/* 面板内容 */}
          <div className={`w-full h-full overflow-hidden flex flex-col ${glass ? 'glass' : 'bg-white dark:bg-gray-900'}`}>
            {isSecretary ? (
              <FocusPanel projectId={project.currentId} onHide={() => setRightPanelHidden(true)} onTabChange={setSecretaryTab} isFullscreen={filesFullscreen} onToggleFullscreen={() => setFilesFullscreen(!filesFullscreen)} />
            ) : (
              <>
                {/* 开发项目 tab 栏 — 全屏时显示简化版 */}
                <div
                  data-tauri-drag-region
                  className="flex items-center gap-1 px-2 pt-2 pb-1 border-b shrink-0 select-none"
                  style={{ borderColor: 'var(--panel-border)', WebkitAppRegion: 'drag' } as React.CSSProperties}
                >
                  {/* 左侧操作按钮 */}
                  <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    {!filesFullscreen && (
                      <button onClick={() => setRightPanelHidden(true)} className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer" title="收起面板">
                        <PanelRightClose size={14} />
                      </button>
                    )}
                    <button onClick={() => setFilesFullscreen(!filesFullscreen)} className="p-0.5 rounded cursor-pointer shrink-0" style={{ color: 'var(--color-text-secondary)' }} title={filesFullscreen ? '退出全屏' : '全屏'}>
                      {filesFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                  </div>
                  {/* Tab pills */}
                  <div className="flex items-center gap-0.5 ml-1 p-0.5 rounded-lg overflow-x-auto scrollbar-none" style={{ backgroundColor: 'var(--color-bg-tertiary)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button
                      onClick={() => setDevPanelTab('files')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: devPanelTab === 'files' ? 'var(--color-surface)' : 'transparent',
                        color: devPanelTab === 'files' ? 'var(--color-text)' : 'var(--color-text-muted)',
                        boxShadow: devPanelTab === 'files' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      }}
                    >
                      <Code2 size={12} />
                      文件
                    </button>
                    <button
                      onClick={() => setDevPanelTab('preview')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: devPanelTab === 'preview' ? 'var(--color-surface)' : 'transparent',
                        color: devPanelTab === 'preview' ? 'var(--color-text)' : 'var(--color-text-muted)',
                        boxShadow: devPanelTab === 'preview' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      }}
                    >
                      <Eye size={12} />
                      动态
                      {chat.activityData.fileChanges.length > 0 && (
                        <span className="text-[10px] min-w-[16px] text-center px-1 rounded-full" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
                          {chat.activityData.fileChanges.length}
                        </span>
                      )}
                    </button>
                    {devModeStatus?.state === 'active' && devModeStatus.previewUrl && (
                      <button
                        onClick={() => setDevPanelTab('devPreview')}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: devPanelTab === 'devPreview' ? 'var(--color-surface)' : 'transparent',
                          color: devPanelTab === 'devPreview' ? 'var(--color-text)' : 'var(--color-text-muted)',
                          boxShadow: devPanelTab === 'devPreview' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        }}
                      >
                        <Monitor size={12} />
                        预览
                      </button>
                    )}
                  </div>
                </div>
                {/* Tab 内容 — 使用绝对定位确保 h-full 在 flex 容器中正确解析 */}
                <div className="flex-1 min-h-0 relative">
                  <div className="absolute inset-0 overflow-hidden">
                    {devPanelTab === 'files' ? (
                      <FilesPanel
                        projectId={project.currentId}
                        isFullscreen={filesFullscreen}
                        onToggleFullscreen={() => setFilesFullscreen(!filesFullscreen)}
                        onHide={() => setRightPanelHidden(true)}
                        hideHeaderButtons
                        refreshKey={filesRefreshKey}
                        diffFilePath={diffFilePath}
                        onDiffFileConsumed={() => setDiffFilePath(null)}
                      />
                    ) : devPanelTab === 'devPreview' ? (
                      <PreviewPanel
                        previewUrl={devModeStatus?.previewUrl}
                        isFullscreen={filesFullscreen}
                        onToggleFullscreen={() => setFilesFullscreen(!filesFullscreen)}
                      />
                    ) : (
                      <ActivityPanel activityData={chat.activityData} />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
        )}
      </div>

      {/* Mobile overlay for project sidebar */}
      {sidebarOpen && (
        <div className="[@media(min-width:960px)]:hidden fixed inset-0 z-40 flex p-2">
          <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <div className={`absolute left-2 top-2 bottom-2 animate-slide-in-left overflow-hidden glass`}>
            <ProjectSidebar
              projects={project.projects}
              currentId={project.currentId}
              activeProjectIds={activeProjectIds}
              collapsed={false}
              onToggleCollapse={() => setSidebarOpen(false)}
              onSwitch={(id) => { project.switchProject(id); setSidebarOpen(false) }}
              onCreate={(name, type, mode) => project.createProject(name, type, mode)}
              onRename={project.renameProject}
              onDelete={project.deleteProject}
              glass={glass}
              userRole={user?.role}
              onOpenSettings={() => setModalOpen('settings')}
              onCycleTheme={cycleTheme}
              themeIcon={themeIcon()}
              user={user ? { username: user.username, role: user.role } : undefined}
              onUserMenu={() => setModalOpen('account')}
              onHide={() => setSidebarOpen(false)}
              onOpenProjectSettings={(id) => {
                if (id !== project.currentId) project.switchProject(id)
                setModalOpen('projectSettings')
                setSidebarOpen(false)
              }}
            />
          </div>
        </div>
      )}

      {/* 命令面板 */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onClearChat={chat.clearChat}
        onCycleTheme={cycleTheme}
        onSwitchProject={project.switchProject}
        projects={project.projects}
        currentProjectId={project.currentId}
        onOpenModal={(panel) => setModalOpen(panel as typeof modalOpen)}
      />

      {/* Modal 弹出框 */}
      <Modal open={modalOpen === 'skills'} onClose={() => setModalOpen(null)} title="技能管理">
        <SkillsPanel projectId={project.currentId} />
      </Modal>
      <Modal open={modalOpen === 'agents'} onClose={() => setModalOpen(null)} title="智能体管理">
        <AgentsPanel projectId={project.currentId} onOpenTemplateLibrary={() => setModalOpen('agentTemplates')} />
      </Modal>
      <Modal open={modalOpen === 'agentTemplates'} onClose={() => setModalOpen('agents')} title="Agent 模板库">
        <AgentTemplatePanel />
      </Modal>
      <Modal open={modalOpen === 'channels'} onClose={() => setModalOpen(null)} title="渠道管理">
        <ChannelsPanel projectId={project.currentId} />
      </Modal>
      <Modal open={modalOpen === 'settings'} onClose={() => setModalOpen(null)} title="设置" wide persistent noScroll>
        <SettingsPanel
          projectId={project.currentId}
          backgroundImage={backgroundImage}
          onBackgroundChange={setBackgroundImage}
          initialTab={settingsInitialTab}
        />
      </Modal>
      <Modal open={modalOpen === 'projectSettings'} onClose={() => setModalOpen(null)} title="项目设置">
        <ProjectSettingsPanel projectId={project.currentId} onClose={() => setModalOpen(null)} />
      </Modal>
      <Modal open={modalOpen === 'account'} onClose={() => setModalOpen(null)} title="账户">
        <AccountPanel />
      </Modal>
      <Modal open={modalOpen === 'schedules'} onClose={() => setModalOpen(null)} title="定时任务">
        <SchedulesPanel projectId={project.currentId} />
      </Modal>
    </div>
  )
}
