'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Menu, Sun, Moon, Monitor
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
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
import Modal from '@/components/ui/Modal'

export function ChatLayout() {
  const project = useProject()
  const chat = useChat(project.currentId)
  const activeProjectIds = useActiveProjects()
  const { theme, setTheme, backgroundImage, setBackgroundImage } = useTheme()
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState<'skills' | 'agents' | 'channels' | 'settings' | null>(null)

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
      {/* 自定义背景图 */}
      {backgroundImage && (
        <div
          className="app-background"
          style={{ backgroundImage: `url(${backgroundImage})`, backgroundColor: 'var(--color-bg)' }}
        />
      )}

      {/* Main Area - flex row */}
      <div className="flex-1 flex gap-2 p-2 min-h-0 min-w-0 overflow-hidden relative z-10">
        {/* Left: Project Sidebar - 独立圆角卡片 (桌面端 ≥1024px) */}
        <div className="hidden [@media(min-width:960px)]:flex flex-shrink-0 transition-all duration-200">
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
            onUserMenu={() => setModalOpen('settings')}
          />
        </div>

        {/* Chat area - 圆角毛玻璃卡片 */}
        <main className={`flex-1 flex flex-col min-w-0 overflow-hidden rounded-2xl ${glass ? 'glass' : 'bg-white/80 dark:bg-gray-900/80'} border border-white/40 dark:border-white/[0.06] shadow-sm relative`}>
          {/* 移动端菜单按钮 */}
          <button
            className="[@media(min-width:960px)]:hidden absolute top-3 left-3 z-20 p-2 rounded-lg bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-300"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={18} />
          </button>
          <ChatPanel
            messages={chat.messages}
            streamingContent={chat.streamingContent}
            thinkingContent={chat.thinkingContent}
            toolSummary={chat.toolSummary}
            sending={chat.sending}
            permissionRequest={chat.permissionRequest}
            statusText={chat.statusText}
            projectId={project.currentId}
            projectName={currentProject?.name}
            onSend={chat.sendMessage}
            onAbort={chat.abortChat}
            onClearChat={chat.clearChat}
            onRespondPermission={chat.respondPermission}
            onUpdateMessage={chat.updateMessage}
            onOpenChannels={() => setModalOpen('channels')}
            onOpenSkills={() => setModalOpen('skills')}
            onOpenAgents={() => setModalOpen('agents')}
          />
        </main>

        {/* Right side panel - 圆角毛玻璃卡片 */}
        <aside className={`w-72 xl:w-80 flex-shrink-0 overflow-y-auto scrollbar-hidden hidden [@media(min-width:1024px)]:flex flex-col rounded-2xl ${glass ? 'glass' : 'bg-white/80 dark:bg-gray-900/80'} border border-white/40 dark:border-white/[0.06] shadow-sm`}>
          {isSecretary ? <FocusPanel /> : <FilesPanel projectId={project.currentId} />}
        </aside>
      </div>

      {/* Mobile overlay for project sidebar */}
      {sidebarOpen && (
        <div className="[@media(min-width:960px)]:hidden fixed inset-0 z-40 flex p-2">
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <div className={`absolute left-2 top-2 bottom-2 animate-slide-in-left rounded-2xl overflow-hidden glass`}>
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
              onUserMenu={() => setModalOpen('settings')}
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
        <SettingsPanel projectId={project.currentId} />
      </Modal>
    </div>
  )
}
