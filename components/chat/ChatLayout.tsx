'use client'

import { useState, useEffect } from 'react'
import {
  MessageCircle, Settings, Trash2, Sun, Moon, Monitor,
  Menu, X, Zap, Bot, Link2
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { AgentsPanel } from '../agents/AgentsPanel'
import { ChannelsPanel } from '../channels/ChannelsPanel'
import { ProjectSidebar } from '../projects/ProjectSidebar'
import { MobileNav, type Tab } from './MobileNav'
import { CommandPalette } from './CommandPalette'
import { useChat, useActiveProjects } from '@/hooks/useChat'
import { useProject } from '@/hooks/useProject'
import { useTheme } from '@/hooks/useTheme'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

type SidePanel = 'none' | 'skills' | 'agents' | 'channels' | 'settings'

function tabToSidePanel(tab: Tab): SidePanel {
  if (tab === 'chat') return 'none'
  return tab
}

export function ChatLayout() {
  const project = useProject()
  const chat = useChat(project.currentId)
  const activeProjectIds = useActiveProjects()
  const { theme, setTheme, backgroundImage, setBackgroundImage, hasBackground } = useTheme()
  const [sidePanel, setSidePanel] = useState<SidePanel>('none')
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

  // 移动端降级毛玻璃为纯色
  const g = hasBackground && !isMobile

  // 移动端面板内容
  const renderSidePanelContent = (panel: SidePanel) => {
    switch (panel) {
      case 'skills': return <SkillsPanel projectId={project.currentId} />
      case 'agents': return <AgentsPanel projectId={project.currentId} />
      case 'channels': return <ChannelsPanel projectId={project.currentId} />
      case 'settings': return <SettingsPanel projectId={project.currentId} backgroundImage={backgroundImage} onBackgroundChange={setBackgroundImage} />
      default: return null
    }
  }

  const panelTitle = (panel: SidePanel) => {
    switch (panel) {
      case 'skills': return '技能管理'
      case 'agents': return '智能体管理'
      case 'channels': return '渠道管理'
      case 'settings': return '设置'
      default: return ''
    }
  }

  return (
    <div className="h-screen flex flex-col relative" style={{ backgroundColor: g ? 'transparent' : 'var(--color-bg)' }}>
      {/* 自定义背景图 */}
      {hasBackground && (
        <div
          className="app-background"
          style={{ backgroundImage: `url(${backgroundImage})`, backgroundColor: 'var(--color-bg)' }}
        />
      )}

      {/* Top Bar */}
      <header
        className={`flex items-center h-13 px-2 sm:px-4 border-b flex-shrink-0 relative z-10 ${g ? 'glass-heavy' : ''}`}
        style={g ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        {/* Left: mobile menu + Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            className="lg:hidden toolbar-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}>
              <MessageCircle size={16} style={{ color: 'var(--color-primary)' }} />
            </div>
            <span className="font-semibold text-sm hidden xs:inline" style={{ color: 'var(--color-text)' }}>
              GClaw
            </span>
          </div>
        </div>

        {/* Current project name */}
        {project.currentId && (
          <div className="hidden sm:flex items-center gap-1.5 ml-4 px-2.5 py-1 rounded-full text-xs" style={{
            backgroundColor: g ? 'var(--glass-surface)' : 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
            color: 'var(--color-text-secondary)',
          }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{
              backgroundColor: chat.sending ? 'var(--color-warning, #f59e0b)' : 'var(--color-success)',
              animation: chat.sending ? 'pulse 1.5s ease-in-out infinite' : undefined,
            }} />
            <span>{project.projects.find(p => p.id === project.currentId)?.name || project.currentId.slice(0, 8)}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Stats badge */}
        {chat.lastStats && (
          <div className="hidden md:flex items-center gap-1.5 text-xs mr-3 px-2 py-1 rounded-full" style={{
            color: 'var(--color-text-muted)',
            backgroundColor: g ? 'var(--glass-surface)' : 'var(--color-bg-secondary)',
          }}>
            <span>{chat.lastStats.model}</span>
            {chat.lastStats.costUsd > 0 && (
              <span className="opacity-60">·</span>
            )}
            {chat.lastStats.costUsd > 0 && (
              <span>${chat.lastStats.costUsd.toFixed(4)}</span>
            )}
          </div>
        )}

        {/* Management buttons group (桌面/平板) */}
        <div className="hidden md:flex items-center gap-0.5 mr-2 px-1 py-0.5 rounded-lg" style={{
          backgroundColor: g ? 'transparent' : 'var(--color-bg-secondary)',
        }}>
          <button
            onClick={() => toggleSidePanel('skills')}
            className={`toolbar-btn ${sidePanel === 'skills' ? 'active' : ''}`}
            title="技能管理"
          >
            <Zap size={16} />
          </button>
          <button
            onClick={() => toggleSidePanel('agents')}
            className={`toolbar-btn ${sidePanel === 'agents' ? 'active' : ''}`}
            title="智能体管理"
          >
            <Bot size={16} />
          </button>
          <button
            onClick={() => toggleSidePanel('channels')}
            className={`toolbar-btn ${sidePanel === 'channels' ? 'active' : ''}`}
            title="渠道管理"
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={() => toggleSidePanel('settings')}
            className={`toolbar-btn ${sidePanel === 'settings' ? 'active' : ''}`}
            title="设置"
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Utility buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={cycleTheme}
            className="toolbar-btn"
            title={`主题: ${theme}`}
          >
            {themeIcon()}
          </button>
          <button
            onClick={chat.clearChat}
            className="toolbar-btn hidden sm:inline-flex"
            title="清空对话"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left: Project Sidebar (桌面端 ≥1024px) */}
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
            glass={g}
          />
        </div>

        {/* Chat area */}
        <main className="flex-1 flex flex-col min-w-0">
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
            onRespondPermission={chat.respondPermission}
            onUpdateMessage={chat.updateMessage}
            glass={g}
          />
        </main>

        {/* Right side panel (桌面端 ≥1024px 内嵌，平板 md~lg 叠加) */}
        {sidePanel !== 'none' && (
          <>
            {/* 桌面端：内嵌面板 */}
            <aside
              className={`w-72 xl:w-80 border-l flex-shrink-0 overflow-y-auto hidden lg:block animate-slide-in-right ${g ? 'glass' : ''}`}
              style={g ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: g ? 'var(--glass-border)' : 'var(--color-border)' }}>
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
              {renderSidePanelContent(sidePanel)}
            </aside>

            {/* 平板端 (md ~ lg)：叠加面板 */}
            <div className="hidden md:block lg:hidden fixed right-0 top-13 bottom-0 w-80 z-30 animate-slide-in-right">
              <div
                className={`h-full border-l overflow-y-auto ${g ? 'glass-heavy' : ''}`}
                style={g ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
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
              className="hidden md:block lg:hidden fixed inset-0 z-20 bg-black/20 animate-fade-in"
              style={{ top: '52px' }}
              onClick={() => setSidePanel('none')}
            />
          </>
        )}
      </div>

      {/* 移动端底部导航 */}
      <MobileNav activeTab={mobileTab} onTabChange={handleMobileTab} />

      {/* 移动端面板 (全屏覆盖) */}
      {sidePanel !== 'none' && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col" style={{ top: '52px' }}>
          <div
            className="flex-1 overflow-y-auto animate-fade-in"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: 'var(--color-border)' }}>
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
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <div className={`absolute left-0 top-0 bottom-0 animate-slide-in-left ${g ? 'glass-heavy' : ''}`} style={g ? {} : { backgroundColor: 'var(--color-surface)' }}>
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
              glass={g}
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
    </div>
  )
}
