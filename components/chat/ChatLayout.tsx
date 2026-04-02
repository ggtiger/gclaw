'use client'

import { useState } from 'react'
import {
  MessageCircle, Settings, Trash2, Sun, Moon, Monitor,
  Menu, X, Zap, Bot, Link2, Image as ImageIcon
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { AgentsPanel } from '../agents/AgentsPanel'
import { ChannelsPanel } from '../channels/ChannelsPanel'
import { ProjectSidebar } from '../projects/ProjectSidebar'
import { useChat, useActiveProjects } from '@/hooks/useChat'
import { useProject } from '@/hooks/useProject'
import { useTheme } from '@/hooks/useTheme'

type SidePanel = 'none' | 'skills' | 'agents' | 'channels' | 'settings'

export function ChatLayout() {
  const project = useProject()
  const chat = useChat(project.currentId)
  const activeProjectIds = useActiveProjects()
  const { theme, setTheme, backgroundImage, setBackgroundImage, hasBackground } = useTheme()
  const [sidePanel, setSidePanel] = useState<SidePanel>('none')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)

  const toggleSidePanel = (panel: SidePanel) => {
    setSidePanel(prev => (prev === panel ? 'none' : panel))
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

  // 等待项目加载
  if (project.loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>加载中...</div>
      </div>
    )
  }

  // 根据是否有背景图决定使用毛玻璃效果
  const g = hasBackground

  return (
    <div className="h-screen flex flex-col relative" style={{ backgroundColor: g ? 'transparent' : 'var(--color-bg)' }}>
      {/* 自定义背景图 */}
      {g && (
        <div
          className="app-background"
          style={{ backgroundImage: `url(${backgroundImage})`, backgroundColor: 'var(--color-bg)' }}
        />
      )}

      {/* Top Bar */}
      <header
        className={`flex items-center h-13 px-4 border-b flex-shrink-0 relative z-10 ${g ? 'glass-heavy' : ''}`}
        style={g ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        {/* Left: mobile menu + Logo */}
        <div className="flex items-center gap-3">
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
            <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
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

        {/* Management buttons group */}
        <div className="flex items-center gap-0.5 mr-2 px-1 py-0.5 rounded-lg" style={{
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
            className="toolbar-btn"
            title="清空对话"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left: Project Sidebar (desktop) */}
        <div className="hidden lg:flex">
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
            onSend={chat.sendMessage}
            onAbort={chat.abortChat}
            onRespondPermission={chat.respondPermission}
            glass={g}
          />
        </main>

        {/* Right side panel */}
        {sidePanel !== 'none' && (
          <aside
            className={`w-80 border-l flex-shrink-0 overflow-y-auto hidden lg:block animate-slide-in-right ${g ? 'glass' : ''}`}
            style={g ? {} : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: g ? 'var(--glass-border)' : 'var(--color-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {sidePanel === 'skills' ? '技能管理' : sidePanel === 'agents' ? '智能体管理' : sidePanel === 'channels' ? '渠道管理' : '设置'}
              </span>
              <button
                onClick={() => setSidePanel('none')}
                className="toolbar-btn"
              >
                <X size={16} />
              </button>
            </div>
            {sidePanel === 'skills' && <SkillsPanel projectId={project.currentId} />}
            {sidePanel === 'agents' && <AgentsPanel projectId={project.currentId} />}
            {sidePanel === 'channels' && <ChannelsPanel projectId={project.currentId} />}
            {sidePanel === 'settings' && <SettingsPanel projectId={project.currentId} backgroundImage={backgroundImage} onBackgroundChange={setBackgroundImage} />}
          </aside>
        )}
      </div>

      {/* Mobile overlay for side panel */}
      {sidePanel !== 'none' && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setSidePanel('none')} />
          <div
            className={`absolute right-0 top-0 bottom-0 w-80 overflow-y-auto animate-slide-in-right ${g ? 'glass-heavy' : ''}`}
            style={g ? {} : { backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center justify-between px-4 h-12 border-b" style={{ borderColor: g ? 'var(--glass-border)' : 'var(--color-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {sidePanel === 'skills' ? '技能管理' : sidePanel === 'agents' ? '智能体管理' : sidePanel === 'channels' ? '渠道管理' : '设置'}
              </span>
              <button
                onClick={() => setSidePanel('none')}
                className="toolbar-btn"
              >
                <X size={16} />
              </button>
            </div>
            {sidePanel === 'skills' && <SkillsPanel projectId={project.currentId} />}
            {sidePanel === 'agents' && <AgentsPanel projectId={project.currentId} />}
            {sidePanel === 'channels' && <ChannelsPanel projectId={project.currentId} />}
            {sidePanel === 'settings' && <SettingsPanel projectId={project.currentId} backgroundImage={backgroundImage} onBackgroundChange={setBackgroundImage} />}
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
    </div>
  )
}
