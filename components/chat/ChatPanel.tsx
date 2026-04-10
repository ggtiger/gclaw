'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Bot, Brain, ChevronDown, ChevronUp, Link2, MoreHorizontal, PanelLeft, PanelRight, RefreshCw, Star, Tag, Trash2, X, Wifi, WifiOff } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageBubble } from './MessageBubble'
import { ToolCallSummary } from './ToolCallSummary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatInput } from './ChatInput'
import { PermissionDialog } from './PermissionDialog'
import { SearchBar } from './SearchBar'
import { ExportButton } from './ExportButton'
// BranchSwitcher 已隐藏
import type { ChatMessage, ChatAttachment, ToolSummary, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'
import appIcon from '@/public/icon.png'

interface ChatPanelProps {
  messages: ChatMessage[]
  initialLoading?: boolean
  streamingContent: string
  thinkingContent?: string
  toolSummary: ToolSummary | null
  sending: boolean
  permissionRequest: PermissionRequest | null
  askQuestion: AskUserQuestionRequest | null
  statusText?: string | null
  projectId: string
  hasMore?: boolean
  onLoadMore?: () => void
  onSend: (message: string, attachments?: ChatAttachment[]) => void
  onAbort: () => void
  onClearChat?: () => void
  onOpenChannels?: () => void
  onOpenSkills?: () => void
  onOpenAgents?: () => void
  sidebarHidden?: boolean
  onToggleSidebar?: () => void
  rightPanelHidden?: boolean
  onToggleRightPanel?: () => void
  onRespondPermission: (requestId: string, decision: 'allow' | 'deny') => void
  onRespondAskQuestion: (requestId: string, answers: Record<string, string>) => void
  onUpdateMessage?: (message: ChatMessage) => void
  projectName?: string
}

function EmptyState({ onSend }: { onSend: (msg: string, attachments?: ChatAttachment[]) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 animate-fade-in-up">
      <Image src={appIcon} alt="GClaw" width={64} height={64} className="w-16 h-16 rounded-2xl mb-5 shadow-lg" />
      <h2 className="text-xl font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
        GClaw
      </h2>
      <p className="text-sm text-center max-w-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
        基于 Claude Code SDK 的智能助手
      </p>
      <div className="grid grid-cols-2 gap-2.5 max-w-md w-full">
        {[
          { text: '帮我写一个 React 组件', icon: '⚛️' },
          { text: '解释一下 TypeScript 泛型', icon: '📘' },
          { text: '帮我调试这个 bug', icon: '🐛' },
          { text: '代码审查最佳实践', icon: '✅' },
        ].map(suggestion => (
          <button
            key={suggestion.text}
            onClick={() => onSend(suggestion.text)}
            className="text-left text-sm px-3.5 py-3 rounded-xl border transition-all duration-200 cursor-pointer hover:border-purple-500 hover:shadow-sm hover:-translate-y-0.5 bg-white/40 dark:bg-white/5 backdrop-blur-sm"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span className="mr-1.5">{suggestion.icon}</span>
            {suggestion.text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 筛选栏：按标签和收藏过滤消息 */
function FilterBar({
  tags,
  activeTag,
  activeStarred,
  onTagChange,
  onStarredChange,
  onClear,
}: {
  tags: { name: string; count: number }[]
  activeTag: string | null
  activeStarred: boolean
  onTagChange: (tag: string | null) => void
  onStarredChange: (v: boolean) => void
  onClear: () => void
}) {
  const hasFilter = activeTag !== null || activeStarred
  if (!hasFilter && tags.length === 0) return null

  return (
    <div
      className="px-3 py-1.5 flex items-center gap-1.5 flex-wrap animate-fade-in"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <span className="text-[11px] font-medium mr-1" style={{ color: 'var(--color-text-muted)' }}>
        筛选:
      </span>

      {/* 收藏筛选 */}
      <button
        onClick={() => onStarredChange(!activeStarred)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors"
        style={{
          backgroundColor: activeStarred
            ? 'color-mix(in srgb, #FDE047 20%, transparent)'
            : 'color-mix(in srgb, var(--color-text-muted) 8%, transparent)',
          color: activeStarred ? '#D97706' : 'var(--color-text-muted)',
        }}
      >
        <Star size={10} fill={activeStarred ? 'currentColor' : 'none'} />
        收藏
      </button>

      {/* 标签筛选 */}
      {tags.map(t => (
        <button
          key={t.name}
          onClick={() => onTagChange(activeTag === t.name ? null : t.name)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors"
          style={{
            backgroundColor: activeTag === t.name
              ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
              : 'color-mix(in srgb, var(--color-text-muted) 8%, transparent)',
            color: activeTag === t.name ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <Tag size={10} />
          {t.name}
          <span className="opacity-60">{t.count}</span>
        </button>
      ))}

      {/* 清除筛选 */}
      {hasFilter && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X size={10} />
          清除
        </button>
      )}
    </div>
  )
}

export function ChatPanel({ messages, initialLoading, streamingContent, thinkingContent, toolSummary, sending, permissionRequest, askQuestion, statusText, projectId, hasMore, onLoadMore, onSend, onAbort, onClearChat, onOpenChannels, onOpenSkills, onOpenAgents, sidebarHidden, onToggleSidebar, rightPanelHidden, onToggleRightPanel, onRespondPermission, onRespondAskQuestion, onUpdateMessage, projectName }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // ─── 渠道连接状态 ───
  const [activeChannels, setActiveChannels] = useState<{ type: string; name: string; connected: boolean }[] | null>(null)

  useEffect(() => {
    if (!projectId) { setActiveChannels([]); return }

    let cancelled = false
    let firstLoad = true
    const loadChannels = async () => {
      try {
        const res = await fetch(`/api/channels?projectId=${encodeURIComponent(projectId)}`)
        const data = await res.json()
        if (!data.success || cancelled) return

        const enabled = (data.channels || []).filter((c: { enabled: boolean }) => c.enabled)
        if (enabled.length === 0) { setActiveChannels([]); return }

        // 查询微信连接状态
        const results = await Promise.all(enabled.map(async (ch: { id: string; type: string; name: string; wechat?: { botToken: string } }) => {
          let connected = false
          if (ch.type === 'wechat' && ch.wechat?.botToken) {
            try {
              const sr = await fetch(`/api/channels/webhook/wechat/connect?projectId=${encodeURIComponent(projectId)}&channelId=${ch.id}`)
              const sd = await sr.json()
              connected = sd.status === 'connected'

              // 首次加载时，微信未连接则自动连接
              if (firstLoad && !connected) {
                fetch('/api/channels/webhook/wechat/connect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId, channelId: ch.id }),
                }).catch(() => {})
              }
            } catch {}
          } else if (ch.type === 'dingtalk' || ch.type === 'feishu') {
            connected = true // webhook 渠道配置即视为已链接
          }
          return { type: ch.type, name: ch.name, connected }
        }))

        if (!cancelled) setActiveChannels(results)
        firstLoad = false
      } catch {}
    }

    loadChannels()
    // 每 30 秒刷新微信连接状态
    const interval = setInterval(loadChannels, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [projectId])

  // 切换项目时重置自动滚动
  useEffect(() => {
    shouldAutoScroll.current = true
  }, [projectId])

  // 延迟显示骨架屏：加载快于 200ms 时跳过骨架屏，避免闪烁
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!initialLoading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [initialLoading])
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  // 加载更多历史消息
  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore || loadingMore) return
    const container = scrollContainerRef.current
    const prevHeight = container?.scrollHeight ?? 0
    setLoadingMore(true)
    await onLoadMore()
    // 加载后恢复滚动位置（不跳到顶部）
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight - prevHeight
      }
      setLoadingMore(false)
    })
  }, [onLoadMore, loadingMore])

  // 发送消息时强制自动滚动到底部
  const handleSend = useCallback((message: string, attachments?: ChatAttachment[]) => {
    shouldAutoScroll.current = true
    onSend(message, attachments)
  }, [onSend])

  // 筛选状态
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [filterStarred, setFilterStarred] = useState(false)
  const [allTags, setAllTags] = useState<{ name: string; count: number }[]>([])
  const [tagNameList, setTagNameList] = useState<string[]>([])

  // 分支状态
  // activeBranch removed (branch feature hidden)

  // 加载标签列表
  const loadTags = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/chat/messages/tags?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setAllTags(data.tags || [])
      setTagNameList((data.tags || []).map((t: { name: string }) => t.name))
    } catch {}
  }, [projectId])

  useEffect(() => {
    loadTags()
  }, [loadTags, messages])

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2')
      el.style.setProperty('--tw-ring-color', 'var(--color-primary)')
      setTimeout(() => {
        el.classList.remove('ring-2')
      }, 1500)
    }
  }

  // 消息更新回调（标签/收藏操作后）
  const handleMessageUpdate = useCallback((updated: ChatMessage) => {
    if (onUpdateMessage) {
      onUpdateMessage(updated)
    }
  }, [onUpdateMessage])

  // 根据筛选条件过滤消息（缓存避免每次渲染重算）
  const filteredMessages = useMemo(() => messages.filter(msg => {
    if (filterStarred && !msg.isStarred) return false
    if (filterTag && !(msg.tags || []).includes(filterTag)) return false
    return true
  }), [messages, filterStarred, filterTag])

  // 虚拟滚动（只渲染可见区域的消息，大幅减少 DOM 节点）
  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 3,
  })
  const totalSize = virtualizer.getTotalSize()

  // 自动滚动到底部（用 RAF 防抖，减少抖动）
  useEffect(() => {
    if (!shouldAutoScroll.current || !scrollContainerRef.current) return
    const raf = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [filteredMessages, streamingContent, toolSummary])

  // 检测用户是否手动向上滚动（节流，避免高频触发）
  const scrollRafRef = useRef<number>(0)
  const handleScroll = useCallback(() => {
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0
      const container = scrollContainerRef.current
      if (!container) return
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      shouldAutoScroll.current = distanceFromBottom < 100
    })
  }, [])

  const isEmpty = messages.length === 0 && !streamingContent

  return (
    <div className="relative flex flex-col h-full bg-white dark:bg-transparent">
      {/* 固定工具栏：项目名 + 搜索 + 导出 + 清空 */}
      {!initialLoading && (
        <div
          data-tauri-drag-region
          className="flex items-center flex-nowrap gap-2 px-3 lg:px-4 py-1.5 flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* 展开侧边栏按钮（项目名左侧） */}
          {sidebarHidden && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="展开项目侧边栏"
            >
              <PanelLeft size={14} />
            </button>
          )}
          {/* 项目名称 + 渠道状态 */}
          <span className="text-sm font-medium truncate max-w-[160px] text-slate-600 dark:text-slate-400">
            {projectName || projectId.slice(0, 8)}
          </span>
          {activeChannels && activeChannels.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {activeChannels.map(ch => (
                <button
                  key={ch.name}
                  onClick={() => onOpenChannels?.()}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: ch.connected
                      ? 'color-mix(in srgb, #22C55E 12%, transparent)'
                      : 'color-mix(in srgb, #94A3B8 10%, transparent)',
                    color: ch.connected ? '#16A34A' : 'var(--color-text-muted)',
                  }}
                >
                  {ch.connected ? <Wifi size={9} /> : <WifiOff size={9} />}
                  {ch.name}
                </button>
              ))}
            </div>
          )}
          {activeChannels && activeChannels.length === 0 && (
            <button
              onClick={() => onOpenChannels?.()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: 'color-mix(in srgb, #F59E0B 15%, transparent)',
                color: '#B45309',
              }}
            >
              <Link2 size={9} />
              去绑定微信
            </button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 flex-nowrap flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <SearchBar projectId={projectId} onJumpToMessage={handleJumpToMessage} />
            <div className="flex-shrink-0"><ExportButton projectId={projectId} /></div>
            <button
              onClick={() => onClearChat?.()}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 text-xs flex-shrink-0"
              title="清空对话"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline whitespace-nowrap">清空</span>
            </button>
            {rightPanelHidden && onToggleRightPanel && (
              <button
                onClick={onToggleRightPanel}
                className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                title="展开右侧面板"
              >
                <PanelRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {initialLoading ? (
        showSkeleton ? (
          <div className="flex-1 overflow-y-auto px-3 pt-4 pb-48 lg:px-4 lg:pt-6">
            <div className="w-full mx-auto flex flex-col gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                  <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-white/10 animate-pulse shrink-0" />
                  <div className={`max-w-[70%] flex flex-col gap-2 ${i % 2 === 0 ? '' : 'items-end'}`}>
                    <div className="h-3 w-16 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
                    <div className="rounded-2xl px-4 py-3 bg-gray-200/80 dark:bg-white/[0.06] animate-pulse">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-3 rounded bg-gray-300/60 dark:bg-white/[0.06]" style={{ width: `${60 + Math.random() * 40}%` }} />
                        <div className="h-3 rounded bg-gray-300/60 dark:bg-white/[0.06]" style={{ width: `${40 + Math.random() * 30}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )
      ) : isEmpty ? (
        <div className="flex-1 flex flex-col pb-48">
          <EmptyState onSend={handleSend} />
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 pt-4 pb-48 lg:px-4 lg:pt-6"
        >
          <div className="w-full mx-auto flex flex-col gap-4">
            {/* 筛选栏 */}
            <FilterBar
              tags={allTags}
              activeTag={filterTag}
              activeStarred={filterStarred}
              onTagChange={setFilterTag}
              onStarredChange={setFilterStarred}
              onClear={() => { setFilterTag(null); setFilterStarred(false) }}
            />

            {/* 加载更多历史消息 */}
            {hasMore && (
              <div className="flex justify-center py-1">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium px-4 py-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? '加载中...' : '加载更早的消息'}
                </button>
              </div>
            )}

            {/* 虚拟滚动消息列表 */}
            <div style={{ height: `${totalSize}px`, width: '100%', position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const msg = filteredMessages[virtualRow.index]
                return (
                  <div
                    key={msg.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    id={`msg-${msg.id}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <MessageBubble
                      message={msg}
                      projectId={projectId}
                      onMessageUpdate={handleMessageUpdate}
                      allTags={tagNameList}
                    />
                  </div>
                )
              })}
            </div>

            {/* 压缩状态指示器 */}
            {statusText && (
              <div className="flex items-center gap-2 px-4 py-2 mx-4 my-1 rounded-lg animate-fade-in bg-amber-500/10">
                <RefreshCw size={14} className="animate-spin text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {statusText === 'compacting' ? '正在压缩上下文...' : statusText}
                </span>
              </div>
            )}

            {/* Thinking 思考过程（可展开/收起） */}
            {thinkingContent && (
              <div className="mx-4 my-1 rounded-xl overflow-hidden border animate-fade-in border-purple-500/20 bg-purple-500/5">
                <button
                  onClick={() => setThinkingExpanded(!thinkingExpanded)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-purple-500/10 transition-colors text-purple-600 dark:text-purple-400"
                >
                  <Brain size={14} />
                  <span>思考过程</span>
                  <div className="flex-1" />
                  {thinkingExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {thinkingExpanded && (
                  <div className="px-3 pb-2 text-xs leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto text-slate-600 dark:text-slate-400">
                    {thinkingContent}
                  </div>
                )}
              </div>
            )}

            {/* 工具调用摘要 */}
            {toolSummary && (toolSummary.pendingTools.length > 0 || toolSummary.completedTools.length > 0) && (
              <div className="px-4 py-2">
                <ToolCallSummary summary={toolSummary} askQuestion={askQuestion} onRespondAskQuestion={onRespondAskQuestion} />
              </div>
            )}

            {/* 流式输出 */}
            {streamingContent && (
              <div className="flex gap-3 px-4 py-4 animate-fade-in rounded-2xl mx-2 my-1" style={{
                backgroundColor: 'var(--glass-msg-assistant)',
              }}>
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/10 dark:bg-purple-500/20">
                    <Bot size={16} className="text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-sm leading-relaxed">
                  <div className="text-xs font-medium mb-1 text-slate-500 dark:text-slate-400">
                    Claude
                  </div>
                  <MarkdownRenderer content={streamingContent} isStreaming />
                </div>
              </div>
            )}

            {/* 等待响应指示 */}
            {sending && !streamingContent && !toolSummary && (
              <div className="flex gap-3 px-4 py-4 animate-fade-in rounded-2xl mx-2 my-1" style={{
                backgroundColor: 'var(--glass-msg-assistant)',
              }}>
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/10 dark:bg-purple-500/20">
                    <Bot size={16} className="text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium mb-2 text-slate-500 dark:text-slate-400">
                    Claude
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-purple-500" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-purple-500" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-purple-500" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* 底部间距 */}
            <div className="h-4" />
          </div>
        </div>
      )}

      {/* 权限审批对话框 */}
      {permissionRequest && (
        <div className="absolute bottom-48 left-0 right-0 z-30 px-3 lg:px-4 flex justify-center">
          <div className="w-full">
            <PermissionDialog request={permissionRequest} onRespond={onRespondPermission} />
          </div>
        </div>
      )}

      {/* 浮动输入区域 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/70 via-white/40 to-transparent dark:from-[#1a1a2e]/90 dark:via-[#1a1a2e]/60 dark:to-transparent pt-6 pb-4 px-3 lg:px-4 flex justify-center z-20">
        <div className="w-full">
          <ChatInput
            onSend={handleSend}
            onAbort={onAbort}
            sending={sending}
            projectId={projectId}
            onTemplateSelect={(template) => {
              if (template.firstMessage) {
                handleSend(template.firstMessage)
              }
            }}
            onOpenSkills={onOpenSkills}
            onOpenAgents={onOpenAgents}
          />
        </div>
      </div>
    </div>
  )
}
