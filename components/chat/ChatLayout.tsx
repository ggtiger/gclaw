'use client'

import { useState, useEffect, useRef } from 'react'
import {
  MessageCircle, Settings, Sun, Moon, Monitor,
  Menu, X, Zap, Bot, Link2, LogOut, User, Target, FolderOpen, Trash2
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { AgentsPanel } from '../agents/AgentsPanel'
import { ChannelsPanel } from '../channels/ChannelsPanel'
import { ProjectSidebar } from '../projects/ProjectSidebar'
import FocusPanel from '../panels/FocusPanel'
import FilesPanel from '../panels/FilesPanel'
import { MobileNav, type Tab } from './MobileNav'
import { CommandPalette } from './CommandPalette'
import { useChat, useActiveProjects } from '@/hooks/useChat'
import { useProject } from '@/hooks/useProject'
import { useTheme } from '@/hooks/useTheme'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAuth } from '@/hooks/useAuth'

type SidePanel = 'none' | 'skills' | 'agents' | 'channels' | 'settings' | 'focus' | 'workspace'

function tabToSidePanel(tab: Tab): SidePanel {
  if (tab === 'chat') return 'none'
  return tab
}

export function ChatLayout() {
  const project = useProject()
  const chat = useChat(project.currentId)
  const activeProjectIds = useActiveProjects()
  const { theme, setTheme, backgroundImage, setBackgroundImage } = useTheme()
  const { user, logout } = useAuth()
  const [sidePanel, setSidePanel] = useState<SidePanel>('none')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'settings' | 'account' | 'audit' | 'users' | 'security'>('settings')
  const userMenuRef = useRef<HTMLDivElement>(null)
  const userBtnRef = useRef<HTMLButtonElement>(null)
  const userDropdownRef = useRef<HTMLDivElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)
  const [mobileTab, setMobileTab] = useState<Tab>('chat')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

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

  // 项目切换时重置面板状态
  useEffect(() => {
    if (isSecretary) {
      setSidePanel('focus')
    } else {
      setSidePanel('none')
    }
  }, [project.currentId, isSecretary])

  // 点击外部关闭用户菜单
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insideBtn = userMenuRef.current?.contains(target)
      const insideDropdown = userDropdownRef.current?.contains(target)
      if (!insideBtn && !insideDropdown) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const toggleSidePanel = (panel: SidePanel) => {
    setSidePanel(prev => (prev === panel ? 'none' : panel))
  }

  const handleMobileTab = (tab: Tab) => {
    setMobileTab(tab)
    setSidePanel(tabToSidePanel(tab))
  }

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
      if (sidePanel !== 'none') { setSidePanel('none'); return }
    },
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onCloseCommandPalette: () => setCommandPaletteOpen(false),
    onClearChat: chat.clearChat,
    onCycleTheme: cycleTheme,
    onToggleSidePanel: (panel) => toggleSidePanel(panel as SidePanel),
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

  // 移动端面板内容
  const renderSidePanelContent = (panel: SidePanel) => {
    switch (panel) {
      case 'skills': return <SkillsPanel projectId={project.currentId} />
      case 'agents': return <AgentsPanel projectId={project.currentId} />
      case 'channels': return <ChannelsPanel projectId={project.currentId} />
      case 'settings': return <SettingsPanel key={settingsTab} projectId={project.currentId} backgroundImage={backgroundImage} onBackgroundChange={setBackgroundImage} initialTab={settingsTab} />
      case 'focus': return <FocusPanel />
      case 'workspace': return <FilesPanel projectId={project.currentId} />
      default: return null
    }
  }

  const panelTitle = (panel: SidePanel) => {
    switch (panel) {
      case 'skills': return '技能管理'
      case 'agents': return '智能体管理'
      case 'channels': return '渠道管理'
      case 'settings': return '设置'
      case 'focus': return '专注模式'
      case 'workspace': return '工作空间'
      default: return ''
    }
  }

  return (
    <div className="h-screen flex flex-col relative" style={{ backgroundColor: 'transparent' }}>
      {/* 自定义背景图 */}
      {backgroundImage && (
        <div
          className="app-background"
          style={{ backgroundImage: `url(${backgroundImage})`, backgroundColor: 'var(--color-bg)' }}
        />
      )}

      {/* Top Bar - 扁平横条，无圆角，无glass效果 */}
      <header
        className="flex items-center h-12 px-2 sm:px-4 flex-shrink-0 relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-white/[0.06]"
      >
        {/* Left: mobile menu + Logo + Project + Model/Cost */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            className="lg:hidden toolbar-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/10 dark:bg-purple-500/20">
              <MessageCircle size={16} className="text-purple-600 dark:text-purple-400" />
            </div>
            <span className="font-semibold text-sm hidden xs:inline" style={{ color: 'var(--color-text)' }}>
              GClaw
            </span>
          </div>
        </div>

        {/* Current project name */}
        {project.currentId && (
          <div className="hidden sm:flex items-center gap-1.5 ml-4 px-2.5 py-1 rounded-full text-xs bg-purple-500/10 dark:bg-purple-500/10" style={{
            color: 'var(--color-text-secondary)',
          }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{
              backgroundColor: chat.sending ? 'var(--color-warning, #f59e0b)' : 'var(--color-success)',
              animation: chat.sending ? 'pulse 1.5s ease-in-out infinite' : undefined,
            }} />
            <span>{project.projects.find(p => p.id === project.currentId)?.name || project.currentId.slice(0, 8)}</span>
          </div>
        )}

        {/* Model and Cost info - moved to left */}
        {chat.lastStats && (
          <div className="hidden md:flex items-center gap-3 ml-4">
            <span className="text-xs text-gray-500 font-mono">{chat.lastStats.model}</span>
            {chat.lastStats.costUsd > 0 && (
              <span className="text-xs text-gray-500">${chat.lastStats.costUsd.toFixed(4)}</span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Management buttons - 无分组容器，直接排列 */}
        <div className="hidden md:flex items-center gap-1">
          {/* 秘书类型：专注模式按钮 */}
          {isSecretary && (
            <button
              onClick={() => toggleSidePanel('focus')}
              className={`p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${sidePanel === 'focus' ? 'text-purple-600 dark:text-purple-400' : ''}`}
              title="专注模式"
            >
              <Target size={16} />
            </button>
          )}
          {/* 开发/办公类型：工作空间按钮 */}
          {!isSecretary && (
            <button
              onClick={() => toggleSidePanel('workspace')}
              className={`p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${sidePanel === 'workspace' ? 'text-purple-600 dark:text-purple-400' : ''}`}
              title="工作空间"
            >
              <FolderOpen size={16} />
            </button>
          )}
          <button
            onClick={() => toggleSidePanel('skills')}
            className={`p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${sidePanel === 'skills' ? 'text-purple-600 dark:text-purple-400' : ''}`}
            title="技能管理"
          >
            <Zap size={16} />
          </button>
          <button
            onClick={() => toggleSidePanel('agents')}
            className={`p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${sidePanel === 'agents' ? 'text-purple-600 dark:text-purple-400' : ''}`}
            title="智能体管理"
          >
            <Bot size={16} />
          </button>
          <button
            onClick={() => toggleSidePanel('channels')}
            className={`p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${sidePanel === 'channels' ? 'text-purple-600 dark:text-purple-400' : ''}`}
            title="渠道管理"
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={() => toggleSidePanel('settings')}
            className={`p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${sidePanel === 'settings' ? 'text-purple-600 dark:text-purple-400' : ''}`}
            title="设置"
          >
            <Settings size={16} />
          </button>
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title={`主题: ${theme}`}
          >
            {themeIcon()}
          </button>
          {/* Trash/Clear chat button */}
          <button
            onClick={chat.clearChat}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title="清空对话"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* 用户头像下拉菜单 */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              ref={userBtnRef}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`ml-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${userMenuOpen ? 'bg-purple-600 text-white' : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25'}`}
              title={user.username}
            >
              {user.username.charAt(0).toUpperCase()}
            </button>
          </div>
        )}
      </header>

      {/* Main Area - flex row with gap */}
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Left: Project Sidebar - 独立圆角卡片 (桌面端 ≥1024px) */}
        <div className="hidden lg:flex transition-all duration-200">
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
          />
        </div>

        {/* Chat area - 独立圆角卡片 */}
        <main className={`flex-1 flex flex-col min-w-0 overflow-hidden border-x border-gray-200 dark:border-white/[0.06]`}>
          <ChatPanel
            messages={chat.messages}
            streamingContent={chat.streamingContent}
            thinkingContent={chat.thinkingContent}
            toolSummary={chat.toolSummary}
            sending={chat.sending}
            permissionRequest={chat.permissionRequest}
            statusText={chat.statusText}
            projectId={project.currentId}
            onSend={chat.sendMessage}
            onAbort={chat.abortChat}
            onClearChat={chat.clearChat}
            onRespondPermission={chat.respondPermission}
            onUpdateMessage={chat.updateMessage}
          />
        </main>

        {/* Right side panel - 独立圆角卡片 (桌面端 ≥1024px 内嵌，平板 md~lg 叠加) */}
        {sidePanel !== 'none' && (
          <>
            {/* 桌面端：内嵌面板 */}
            <aside
              className={`w-72 xl:w-80 flex-shrink-0 overflow-y-auto hidden lg:flex flex-col animate-slide-in-right`}
            >
              <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: 'var(--glass-border)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {panelTitle(sidePanel)}
                </span>
                <button
                  onClick={() => setSidePanel('none')}
                  className="toolbar-btn"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderSidePanelContent(sidePanel)}
              </div>
            </aside>

            {/* 平板端 (md ~ lg)：叠加面板 */}
            <div className="hidden md:block lg:hidden fixed right-2 top-[60px] bottom-2 w-80 z-30 animate-slide-in-right">
              <div
                className={`h-full overflow-y-auto`}
              >
                <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {panelTitle(sidePanel)}
                  </span>
                  <button onClick={() => setSidePanel('none')} className="toolbar-btn">
                    <X size={16} />
                  </button>
                </div>
                {renderSidePanelContent(sidePanel)}
              </div>
            </div>
            {/* 平板遮罩 */}
            <div
              className="hidden md:block lg:hidden fixed inset-0 z-20 bg-black/10 backdrop-blur-sm animate-fade-in"
              style={{ top: '52px' }}
              onClick={() => setSidePanel('none')}
            />
          </>
        )}
      </div>

      {/* 移动端面板 (全屏覆盖) */}
      {sidePanel !== 'none' && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col p-2" style={{ top: '52px' }}>
          <div
            className={`flex-1 overflow-y-auto animate-fade-in`}
          >
            <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: 'var(--panel-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {panelTitle(sidePanel)}
              </span>
              <button onClick={() => { setSidePanel('none'); setMobileTab('chat') }} className="toolbar-btn">
                <X size={16} />
              </button>
            </div>
            {renderSidePanelContent(sidePanel)}
          </div>
        </div>
      )}

      {/* Mobile overlay for project sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex p-2">
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
        onToggleSidePanel={(panel) => toggleSidePanel(panel as SidePanel)}
      />

      {/* 移动端底部导航 - 独立圆角卡片 */}
      <div className="md:hidden fixed bottom-2 left-2 right-2 z-40">
        <MobileNav activeTab={mobileTab} onTabChange={handleMobileTab} />
      </div>

      {/* 用户菜单（fixed 定位避免被 header 裁剪） */}
      {userMenuOpen && user && userBtnRef.current && (
        <div
          ref={userDropdownRef}
          className="fixed z-50 w-44 rounded-lg border shadow-lg overflow-hidden animate-fade-in"
          style={{
            top: userBtnRef.current.getBoundingClientRect().bottom + 4,
            right: window.innerWidth - userBtnRef.current.getBoundingClientRect().right,
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
              {user.username}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {user.role === 'admin' ? '管理员' : '普通用户'}
            </div>
          </div>
          <button
            onClick={() => {
              setUserMenuOpen(false)
              setSettingsTab('account')
              setSidePanel('settings')
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <User size={14} />
            账户设置
          </button>
          <button
            onClick={() => {
              setUserMenuOpen(false)
              logout()
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors"
            style={{ color: 'var(--color-error)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
