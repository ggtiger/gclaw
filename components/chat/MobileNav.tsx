'use client'

import { MessageCircle, Zap, Bot, Settings, Link2 } from 'lucide-react'

type Tab = 'chat' | 'skills' | 'agents' | 'channels' | 'settings'

interface MobileNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs: { id: Tab; icon: typeof MessageCircle; label: string }[] = [
  { id: 'chat', icon: MessageCircle, label: '对话' },
  { id: 'skills', icon: Zap, label: '技能' },
  { id: 'agents', icon: Bot, label: '智能体' },
  { id: 'channels', icon: Link2, label: '渠道' },
  { id: 'settings', icon: Settings, label: '设置' },
]

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav
      className="flex items-center justify-around h-14 border-t flex-shrink-0 md:hidden"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full cursor-pointer transition-colors"
          style={{
            color: activeTab === id ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <Icon size={18} strokeWidth={activeTab === id ? 2.2 : 1.5} />
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export type { Tab }
