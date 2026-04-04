'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Bot, Brain, ChevronDown, ChevronUp, Link2, RefreshCw, Star, Tag, Trash2, X } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ToolCallSummary } from './ToolCallSummary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatInput } from './ChatInput'
import { PermissionDialog } from './PermissionDialog'
import { SearchBar } from './SearchBar'
import { ExportButton } from './ExportButton'
// BranchSwitcher 已隐藏
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
  onClearChat?: () => void
  onOpenChannels?: () => void
  onOpenSkills?: () => void
  onOpenAgents?: () => void
  onRespondPermission: (requestId: string, decision: 'allow' | 'deny') => void
  onUpdateMessage?: (message: ChatMessage) => void
  projectName?: string
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 animate-fade-in-up">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-gradient-to-br from-purple-500/20 to-purple-600/10">
        <Bot size={30} className="text-purple-600 dark:text-purple-400" />
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

export function ChatPanel({ messages, streamingContent, thinkingContent, toolSummary, sending, permissionRequest, statusText, projectId, onSend, onAbort, onClearChat, onOpenChannels, onOpenSkills, onOpenAgents, onRespondPermission, onUpdateMessage, projectName }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

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

  // 根据筛选条件过滤消息
  const filteredMessages = messages.filter(msg => {
    if (filterStarred && !msg.isStarred) return false
    if (filterTag && !(msg.tags || []).includes(filterTag)) return false
    return true
  })

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

  // 检测用户是否手动向上滚动
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScroll.current = distanceFromBottom < 100
  }

  const isEmpty = messages.length === 0 && !streamingContent

  return (
    <div className="relative flex flex-col h-full">
      {/* 顶部拖拽区域 */}
      <div data-tauri-drag-region className="h-1 flex-shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      {/* 固定工具栏：分支 + 搜索 + 导出 + 清空 */}
      {!isEmpty && (
        <div className="flex items-center pt-0 gap-2 px-3 lg:px-4 py-2 border-b border-white/10 dark:border-white/[0.06] flex-shrink-0">
          {/* 项目名称 */}
          <span className="text-sm font-medium truncate max-w-[160px] text-slate-600 dark:text-slate-400">
            {projectName || projectId.slice(0, 8)}
          </span>
          <div className="flex-1" data-tauri-drag-region style={{ WebkitAppRegion: 'drag', minHeight: '100%' } as React.CSSProperties} />
          <SearchBar projectId={projectId} onJumpToMessage={handleJumpToMessage} />
          <ExportButton projectId={projectId} />
          <button
            onClick={() => onOpenChannels?.()}
            className="p-1.5 rounded-lg transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400"
            title="渠道管理"
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={() => onClearChat?.()}
            className="p-1.5 rounded-lg transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400"
            title="清空对话"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="flex-1 flex flex-col pb-48">
          <EmptyState onSend={onSend} />
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

            {filteredMessages.map(msg => (
              <div key={msg.id} id={`msg-${msg.id}`} className="transition-all duration-300 rounded-lg">
                <MessageBubble
                  message={msg}
                  projectId={projectId}
                  onMessageUpdate={handleMessageUpdate}
                  allTags={tagNameList}
                />
              </div>
            ))}

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
                <ToolCallSummary summary={toolSummary} />
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
            onSend={onSend}
            onAbort={onAbort}
            sending={sending}
            projectId={projectId}
            onTemplateSelect={(template) => {
              if (template.firstMessage) {
                onSend(template.firstMessage)
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
