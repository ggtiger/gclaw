'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Bot, Brain, ChevronDown, ChevronUp, RefreshCw, Star, Tag, X } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ToolCallSummary } from './ToolCallSummary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatInput } from './ChatInput'
import { PermissionDialog } from './PermissionDialog'
import { SearchBar } from './SearchBar'
import { ExportButton } from './ExportButton'
import type { ChatMessage, ToolSummary, PermissionRequest } from '@/types/chat'

interface ChatPanelProps {
  messages: ChatMessage[]
  streamingContent: string
  thinkingContent?: string
  toolSummary: ToolSummary | null
  sending: boolean
  permissionRequest: PermissionRequest | null
  statusText?: string | null
  projectId: string
  onSend: (message: string) => void
  onAbort: () => void
  onRespondPermission: (requestId: string, decision: 'allow' | 'deny') => void
  glass?: boolean
  onUpdateMessage?: (message: ChatMessage) => void
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 animate-fade-in-up">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 15%, transparent), color-mix(in srgb, var(--color-primary) 5%, transparent))',
      }}>
        <Bot size={30} style={{ color: 'var(--color-primary)' }} />
      </div>
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
            className="text-left text-sm px-3.5 py-3 rounded-xl border transition-all cursor-pointer hover:border-[var(--color-primary)] hover:shadow-sm hover:-translate-y-0.5"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-surface)',
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

export function ChatPanel({ messages, streamingContent, thinkingContent, toolSummary, sending, permissionRequest, statusText, projectId, onSend, onAbort, onRespondPermission, glass, onUpdateMessage }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  // 筛选状态
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [filterStarred, setFilterStarred] = useState(false)
  const [allTags, setAllTags] = useState<{ name: string; count: number }[]>([])
  const [tagNameList, setTagNameList] = useState<string[]>([])

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

  // 根据筛选条件过滤消息
  const filteredMessages = messages.filter(msg => {
    if (filterStarred && !msg.isStarred) return false
    if (filterTag && !(msg.tags || []).includes(filterTag)) return false
    return true
  })

  // 自动滚动到底部
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [filteredMessages, streamingContent, toolSummary])

  // 检测用户是否手动向上滚动
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScroll.current = distanceFromBottom < 100
  }

  const isEmpty = messages.length === 0 && !streamingContent

  return (
    <div className="flex flex-col h-full">
      {isEmpty ? (
        <EmptyState onSend={onSend} />
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchBar projectId={projectId} onJumpToMessage={handleJumpToMessage} />
              </div>
              <ExportButton projectId={projectId} />
            </div>

            {/* 筛选栏 */}
            <FilterBar
              tags={allTags}
              activeTag={filterTag}
              activeStarred={filterStarred}
              onTagChange={setFilterTag}
              onStarredChange={setFilterStarred}
              onClear={() => { setFilterTag(null); setFilterStarred(false) }}
            />

            {filteredMessages.map(msg => (
              <div key={msg.id} id={`msg-${msg.id}`} className="transition-all duration-300 rounded-lg">
                <MessageBubble
                  message={msg}
                  glass={glass}
                  projectId={projectId}
                  onMessageUpdate={handleMessageUpdate}
                  allTags={tagNameList}
                />
              </div>
            ))}

            {/* 压缩状态指示器 */}
            {statusText && (
              <div className="flex items-center gap-2 px-4 py-2 mx-4 my-1 rounded-lg animate-fade-in" style={{
                backgroundColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)',
              }}>
                <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--color-warning, #f59e0b)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                  {statusText === 'compacting' ? '正在压缩上下文...' : statusText}
                </span>
              </div>
            )}

            {/* Thinking 思考过程（可展开/收起） */}
            {thinkingContent && (
              <div className="mx-4 my-1 rounded-lg overflow-hidden border animate-fade-in" style={{
                borderColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 5%, transparent)',
              }}>
                <button
                  onClick={() => setThinkingExpanded(!thinkingExpanded)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <Brain size={14} />
                  <span>思考过程</span>
                  <div className="flex-1" />
                  {thinkingExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {thinkingExpanded && (
                  <div className="px-3 pb-2 text-xs leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto" style={{
                    color: 'var(--color-text-secondary)',
                  }}>
                    {thinkingContent}
                  </div>
                )}
              </div>
            )}

            {/* 工具调用摘要 */}
            {toolSummary && (toolSummary.pendingTools.length > 0 || toolSummary.completedTools.length > 0) && (
              <div className="px-4 py-2">
                <ToolCallSummary summary={toolSummary} />
              </div>
            )}

            {/* 流式输出 */}
            {streamingContent && (
              <div className={`flex gap-3 px-4 py-4 animate-fade-in ${glass ? 'mx-2 my-1 rounded-xl' : ''}`} style={{
                backgroundColor: glass ? 'var(--glass-msg-assistant)' : 'var(--color-bg-secondary)',
                backdropFilter: glass ? 'blur(12px)' : undefined,
              }}>
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                  }}>
                    <Bot size={16} style={{ color: 'var(--color-primary)' }} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    Claude
                  </div>
                  <MarkdownRenderer content={streamingContent} isStreaming />
                </div>
              </div>
            )}

            {/* 等待响应指示 */}
            {sending && !streamingContent && !toolSummary && (
              <div className={`flex gap-3 px-4 py-4 animate-fade-in ${glass ? 'mx-2 my-1 rounded-xl' : ''}`} style={{
                backgroundColor: glass ? 'var(--glass-msg-assistant)' : 'var(--color-bg-secondary)',
                backdropFilter: glass ? 'blur(12px)' : undefined,
              }}>
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                  }}>
                    <Bot size={16} style={{ color: 'var(--color-primary)' }} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Claude
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)', animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)', animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)', animationDelay: '300ms' }} />
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
        <div className="max-w-3xl mx-auto w-full">
          <PermissionDialog request={permissionRequest} onRespond={onRespondPermission} />
        </div>
      )}

      {/* 输入区域 */}
      <div className="max-w-3xl mx-auto w-full">
        <ChatInput onSend={onSend} onAbort={onAbort} sending={sending} glass={glass} />
      </div>
    </div>
  )
}
