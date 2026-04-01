'use client'

import { useState } from 'react'
import {
  MessageCircle, Settings, Trash2, Sun, Moon, Monitor,
  Menu, X, Zap
} from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { useChat } from '@/hooks/useChat'
import { useTheme } from '@/hooks/useTheme'

type SidePanel = 'none' | 'skills' | 'settings'

export function ChatLayout() {
  const chat = useChat()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [sidePanel, setSidePanel] = useState<SidePanel>('none')
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Top Bar */}
      <header
        className="flex items-center h-12 px-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        {/* 左侧: 移动端菜单 + Logo */}
        <div className="flex items-center gap-2">
          <button
            className="lg:hidden p-1.5 rounded-lg cursor-pointer"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <MessageCircle size={20} style={{ color: 'var(--color-primary)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
              GClaw
            </span>
          </div>
        </div>

        {/* Session 指示 */}
        {chat.sessionId && (
          <div className="hidden sm:flex items-center gap-1.5 ml-4 px-2 py-1 rounded text-xs" style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-muted)',
          }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
            <span className="font-mono">{chat.sessionId.slice(0, 8)}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* 右侧操作按钮 */}
        <div className="flex items-center gap-1">
          {/* Stats */}
          {chat.lastStats && (
            <div className="hidden md:flex items-center text-xs mr-2" style={{ color: 'var(--color-text-muted)' }}>
              <span>{chat.lastStats.model}</span>
              {chat.lastStats.costUsd > 0 && (
                <span className="ml-2">${chat.lastStats.costUsd.toFixed(4)}</span>
              )}
            </div>
          )}

          <button
            onClick={() => toggleSidePanel('skills')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${sidePanel === 'skills' ? 'bg-[var(--color-bg-secondary)]' : ''}`}
            style={{ color: sidePanel === 'skills' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            title="技能管理"
          >
            <Zap size={18} />
          </button>

          <button
            onClick={() => toggleSidePanel('settings')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${sidePanel === 'settings' ? 'bg-[var(--color-bg-secondary)]' : ''}`}
            style={{ color: sidePanel === 'settings' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            title="设置"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={cycleTheme}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
            title={`主题: ${theme}`}
          >
            {themeIcon()}
          </button>

          <button
            onClick={chat.clearChat}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
            title="清空对话"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* 聊天区域 */}
        <main className="flex-1 flex flex-col min-w-0">
          <ChatPanel
            messages={chat.messages}
            streamingContent={chat.streamingContent}
            toolSummary={chat.toolSummary}
            sending={chat.sending}
            onSend={chat.sendMessage}
            onAbort={chat.abortChat}
          />
        </main>

        {/* 侧面板 */}
        {sidePanel !== 'none' && (
          <aside
            className="w-80 border-l flex-shrink-0 overflow-y-auto hidden lg:block"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {sidePanel === 'skills' ? '技能管理' : '设置'}
              </span>
              <button
                onClick={() => setSidePanel('none')}
                className="p-1 rounded cursor-pointer transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
            {sidePanel === 'skills' && <SkillsPanel />}
            {sidePanel === 'settings' && <SettingsPanel />}
          </aside>
        )}
      </div>

      {/* 移动端侧面板 Overlay */}
      {sidePanel !== 'none' && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidePanel('none')} />
          <div
            className="absolute right-0 top-0 bottom-0 w-80 overflow-y-auto"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {sidePanel === 'skills' ? '技能管理' : '设置'}
              </span>
              <button
                onClick={() => setSidePanel('none')}
                className="p-1 rounded cursor-pointer transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
            {sidePanel === 'skills' && <SkillsPanel />}
            {sidePanel === 'settings' && <SettingsPanel />}
          </div>
        </div>
      )}
    </div>
  )
}
