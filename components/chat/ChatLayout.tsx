'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sun, Moon, Monitor
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ProjectSettingsPanel } from '../settings/ProjectSettingsPanel'
import { AccountPanel } from '../settings/AccountPanel'
import { AgentsPanel } from '../agents/AgentsPanel'
import { ChannelsPanel } from '../channels/ChannelsPanel'
import { ProjectSidebar } from '../projects/ProjectSidebar'
import FocusPanel from '../panels/FocusPanel'
import FilesPanel from '../panels/FilesPanel'
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
  const chat = useChat(project.currentId)
  const activeProjectIds = useActiveProjects()
  const { theme, setTheme, backgroundImage, setBackgroundImage } = useTheme()
  const { user, loading: authLoading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)
  const [projectSidebarHidden, setProjectSidebarHidden] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState<'skills' | 'agents' | 'channels' | 'settings' | 'projectSettings' | 'account' | null>(null)
  const [filesFullscreen, setFilesFullscreen] = useState(false)
  const [rightPanelHidden, setRightPanelHidden] = useState(false)

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
      // 向上查找 drag region
      let el: HTMLElement | null = target
      let foundDrag = false
      while (el) {
        if (el.hasAttribute('data-tauri-no-drag')) return
        if (el.hasAttribute('data-tauri-drag-region')) { foundDrag = true; break }
        el = el.parentElement
      }
      if (!foundDrag) return
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

      {/* Main Area - flex row */}
      <div
        data-tauri-drag-region
        className="flex-1 flex gap-2 px-2 pb-2 pt-2 min-h-0 min-w-0 overflow-hidden relative z-10 "
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Left: Project Sidebar - 独立圆角卡片 (桌面端 ≥960px) */}
        {!projectSidebarHidden && !filesFullscreen && (
        <div data-tauri-no-drag className="hidden [@media(min-width:960px)]:flex flex-shrink-0 transition-all duration-200" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ProjectSidebar
            projects={project.projects}
            currentId={project.currentId}
            activeProjectIds={activeProjectIds}
            collapsed={projectSidebarCollapsed}
            onToggleCollapse={() => setProjectSidebarCollapsed(!projectSidebarCollapsed)}
            onSwitch={project.switchProject}
            onCreate={(name) => project.createProject(name)}
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
          data-tauri-no-drag
          className={`flex-1 flex flex-col ${isSecretary ? 'min-w-[500px]' : 'min-w-[350px]'} overflow-hidden bg-white dark:bg-[#1e293b] relative`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ChatPanel
            messages={chat.messages}
            initialLoading={chat.initialLoading}
            hasMore={chat.hasMore}
            onLoadMore={chat.loadMoreMessages}
            streamingContent={chat.streamingContent}
            thinkingContent={chat.thinkingContent}
            toolSummary={chat.toolSummary}
            sending={chat.sending}
            permissionRequest={chat.permissionRequest}
            askQuestion={chat.askQuestion}
            statusText={chat.statusText}
            projectId={project.currentId}
            projectName={currentProject?.name}
            sidebarHidden={projectSidebarHidden}
            onToggleSidebar={() => setProjectSidebarHidden(false)}
            onOpenMobileSidebar={() => setSidebarOpen(true)}
            rightPanelHidden={rightPanelHidden}
            onToggleRightPanel={() => setRightPanelHidden(false)}
            onSend={chat.sendMessage}
            onAbort={chat.abortChat}
            onClearChat={chat.clearChat}
            onRespondPermission={chat.respondPermission}
            onRespondAskQuestion={chat.respondAskQuestion}
            onUpdateMessage={chat.updateMessage}
            onOpenChannels={() => setModalOpen('channels')}
            onOpenSkills={() => setModalOpen('skills')}
            onOpenAgents={() => setModalOpen('agents')}
          />
        </main>
        )}

        {/* Right side panel */}
        {!rightPanelHidden && (
        <aside
          className={`relative min-h-0 ${filesFullscreen && !isSecretary ? 'flex-1 flex' : isSecretary ? 'w-80 max-w-[280px] min-w-[200px] shrink hidden [@media(min-width:1024px)]:flex' : 'flex-shrink-0 hidden [@media(min-width:1024px)]:flex'}`}
          style={{ WebkitAppRegion: 'no-drag', width: (filesFullscreen && !isSecretary) ? '100%' : isSecretary ? undefined : rightPanelWidth } as React.CSSProperties}
                    data-tauri-no-drag
        >
          {/* 拖拽手柄 - 仅 FilesPanel 且非全屏时显示 */}
          {!isSecretary && !filesFullscreen && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-50 hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors"
            title="拖拽调整宽度"
          />
          )}
          {/* 面板内容 */}
          <div className={`w-full h-full overflow-hidden flex flex-col ${glass ? 'glass' : 'bg-white dark:bg-gray-900'}`}>
            {isSecretary ? <FocusPanel projectId={project.currentId} onHide={() => setRightPanelHidden(true)} /> : <FilesPanel
              projectId={project.currentId}
              isFullscreen={filesFullscreen}
              onToggleFullscreen={() => setFilesFullscreen(!filesFullscreen)}
              onHide={() => setRightPanelHidden(true)}
            />}
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
              onCreate={(name) => project.createProject(name)}
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
        onOpenModal={(panel) => setModalOpen(panel)}
      />

      {/* Modal 弹出框 */}
      <Modal open={modalOpen === 'skills'} onClose={() => setModalOpen(null)} title="技能管理">
        <SkillsPanel projectId={project.currentId} />
      </Modal>
      <Modal open={modalOpen === 'agents'} onClose={() => setModalOpen(null)} title="智能体管理">
        <AgentsPanel projectId={project.currentId} />
      </Modal>
      <Modal open={modalOpen === 'channels'} onClose={() => setModalOpen(null)} title="渠道管理">
        <ChannelsPanel projectId={project.currentId} />
      </Modal>
      <Modal open={modalOpen === 'settings'} onClose={() => setModalOpen(null)} title="设置">
        <SettingsPanel
          projectId={project.currentId}
          backgroundImage={backgroundImage}
          onBackgroundChange={setBackgroundImage}
        />
      </Modal>
      <Modal open={modalOpen === 'projectSettings'} onClose={() => setModalOpen(null)} title="项目设置">
        <ProjectSettingsPanel projectId={project.currentId} onClose={() => setModalOpen(null)} />
      </Modal>
      <Modal open={modalOpen === 'account'} onClose={() => setModalOpen(null)} title="账户">
        <AccountPanel />
      </Modal>
    </div>
  )
}
