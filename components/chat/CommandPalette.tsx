'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Search, CornerDownLeft, Hash, Palette, FolderOpen, Sun, Moon, Monitor, X } from 'lucide-react'

// ============================================================
// 命令面板：支持 /clear /project /theme 等 / 命令
// 支持模糊搜索、键盘导航、实时预览
// ============================================================

interface CommandItem {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  category: string
  keywords: string[]
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onClearChat: () => void
  onCycleTheme: () => void
  onSwitchProject?: (projectId: string) => void
  projects?: Array<{ id: string; name: string }>
  currentProjectId?: string
  onOpenModal?: (panel: 'skills' | 'agents' | 'channels' | 'settings') => void
}

/**
 * 简易模糊匹配：计算查询字符串与目标的匹配得分
 * 支持字符顺序匹配（类似 fzf）
 */
function fuzzyMatch(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  // 完全包含则高分
  if (t.includes(q)) {
    // 越靠前分数越高
    return 100 - t.indexOf(q)
  }

  // 逐字符顺序匹配
  let qi = 0
  let score = 0
  let lastMatchIdx = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10
      // 连续匹配加分
      if (lastMatchIdx >= 0 && ti === lastMatchIdx + 1) {
        score += 20
      }
      // 单词边界匹配加分
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '_' || t[ti - 1] === '-') {
        score += 15
      }
      lastMatchIdx = ti
      qi++
    }
  }

  // 必须所有查询字符都匹配上
  return qi === q.length ? score : 0
}

export function CommandPalette({
  open,
  onClose,
  onClearChat,
  onCycleTheme,
  onSwitchProject,
  projects = [],
  currentProjectId,
  onOpenModal,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ---- 构建命令列表 ----
  const commands: CommandItem[] = useMemo(() => {
    const cmds: CommandItem[] = [
      {
        id: 'clear',
        label: '/clear',
        description: '清空当前对话的所有消息',
        icon: <Hash size={16} />,
        category: '对话',
        keywords: ['clear', '清空', '清除', '删除', '清理'],
        action: () => { onClearChat(); onClose() },
      },
      {
        id: 'theme-light',
        label: '/theme light',
        description: '切换到浅色主题',
        icon: <Sun size={16} />,
        category: '主题',
        keywords: ['theme', '主题', '浅色', 'light', '亮色', '白色'],
        action: () => { onCycleTheme(); onClose() },
      },
      {
        id: 'theme-dark',
        label: '/theme dark',
        description: '切换到深色主题',
        icon: <Moon size={16} />,
        category: '主题',
        keywords: ['theme', '主题', '深色', 'dark', '暗色', '黑色'],
        action: () => { onCycleTheme(); onClose() },
      },
      {
        id: 'theme-system',
        label: '/theme system',
        description: '跟随系统主题设置',
        icon: <Monitor size={16} />,
        category: '主题',
        keywords: ['theme', '主题', '系统', 'system', '自动', '跟随'],
        action: () => { onCycleTheme(); onClose() },
      },
      {
        id: 'theme-cycle',
        label: '/theme',
        description: '循环切换主题（浅色 → 深色 → 跟随系统）',
        icon: <Palette size={16} />,
        category: '主题',
        keywords: ['theme', '主题', '切换', 'cycle', '更换'],
        action: () => { onCycleTheme(); onClose() },
      },
      {
        id: 'skills',
        label: '/skills',
        description: '打开技能管理面板',
        icon: <Hash size={16} />,
        category: '面板',
        keywords: ['skills', '技能', '管理', '面板'],
        action: () => { onOpenModal?.('skills'); onClose() },
      },
      {
        id: 'agents',
        label: '/agents',
        description: '打开智能体管理面板',
        icon: <Hash size={16} />,
        category: '面板',
        keywords: ['agents', '智能体', '管理', '面板', 'agent'],
        action: () => { onOpenModal?.('agents'); onClose() },
      },
      {
        id: 'channels',
        label: '/channels',
        description: '打开渠道管理面板',
        icon: <Hash size={16} />,
        category: '面板',
        keywords: ['channels', '渠道', '管理', '面板', '钉钉', '飞书', '微信'],
        action: () => { onOpenModal?.('channels'); onClose() },
      },
      {
        id: 'settings',
        label: '/settings',
        description: '打开设置面板',
        icon: <Hash size={16} />,
        category: '面板',
        keywords: ['settings', '设置', '配置', '面板'],
        action: () => { onOpenModal?.('settings'); onClose() },
      },
    ]

    // 动态添加项目切换命令
    for (const p of projects) {
      cmds.push({
        id: `project-${p.id}`,
        label: `/project ${p.name}`,
        description: p.id === currentProjectId ? '当前项目' : `切换到项目「${p.name}」`,
        icon: <FolderOpen size={16} />,
        category: '项目',
        keywords: ['project', '项目', '切换', p.name.toLowerCase()],
        action: () => { onSwitchProject?.(p.id); onClose() },
      })
    }

    return cmds
  }, [onClearChat, onCycleTheme, onSwitchProject, onOpenModal, onClose, projects, currentProjectId])

  // ---- 模糊过滤 ----
  const filtered = useMemo(() => {
    const q = query.trim().replace(/^\//, '') // 去掉前导 /
    if (!q) return commands

    const scored = commands
      .map(cmd => {
        const matchText = [cmd.label, cmd.description, ...cmd.keywords].join(' ')
        const score = fuzzyMatch(q, matchText)
        return { cmd, score }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map(item => item.cmd)
  }, [query, commands])

  // 重置选中索引
  useEffect(() => {
    setSelectedIdx(0)
  }, [filtered.length])

  // 打开时自动聚焦输入框
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      // 延迟聚焦以确保 DOM 已渲染
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  // 滚动到选中项
  useEffect(() => {
    const listEl = listRef.current
    if (!listEl) return
    const selectedEl = listEl.children[selectedIdx] as HTMLElement
    if (!selectedEl) return
    selectedEl.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  // ---- 键盘导航 ----
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIdx(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedIdx]) {
          filtered[selectedIdx].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filtered, selectedIdx, onClose])

  if (!open) return null

  // ---- 按类别分组 ----
  const grouped = new Map<string, CommandItem[]>()
  for (const cmd of filtered) {
    const list = grouped.get(cmd.category) || []
    list.push(cmd)
    grouped.set(cmd.category, list)
  }

  // 扁平化索引映射（分组标题不计入索引）
  let flatIdx = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden animate-fade-in-up"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* 搜索头部 */}
        <div className="flex items-center gap-2 px-4 h-12 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="输入命令或搜索..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
            style={{ color: 'var(--color-text)' }}
          />
          <kbd
            className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono border"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="sm:hidden p-1 rounded cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* 命令列表 */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              未找到匹配的命令
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, cmds]) => (
              <div key={category}>
                {/* 分类标题 */}
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  {category}
                </div>
                {cmds.map(cmd => {
                  const idx = flatIdx++
                  const isSelected = idx === selectedIdx
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer"
                      style={{
                        backgroundColor: isSelected ? 'var(--color-bg-secondary)' : 'transparent',
                        color: 'var(--color-text)',
                      }}
                    >
                      <span
                        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
                        style={{
                          backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-secondary)',
                          color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        }}
                      >
                        {cmd.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                          {cmd.label}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {cmd.description}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="shrink-0 flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          <CornerDownLeft size={12} />
                          <span className="hidden sm:inline">确认</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between px-4 h-9 border-t text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>↑↓</kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>↵</kbd>
              执行
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>esc</kbd>
              关闭
            </span>
          </div>
          <span className="hidden sm:inline">
            <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>⌘K</kbd>
            切换
          </span>
        </div>
      </div>
    </div>
  )
}
