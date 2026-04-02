'use client'

import { useRef, useEffect, useState } from 'react'
import { Bot, Brain, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ToolCallSummary } from './ToolCallSummary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatInput } from './ChatInput'
import { PermissionDialog } from './PermissionDialog'
import type { ChatMessage, ToolSummary, PermissionRequest } from '@/types/chat'

interface ChatPanelProps {
  messages: ChatMessage[]
  streamingContent: string
  thinkingContent?: string
  toolSummary: ToolSummary | null
  sending: boolean
  permissionRequest: PermissionRequest | null
  statusText?: string | null
  onSend: (message: string) => void
  onAbort: () => void
  onRespondPermission: (requestId: string, decision: 'allow' | 'deny') => void
  glass?: boolean
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

export function ChatPanel({ messages, streamingContent, thinkingContent, toolSummary, sending, permissionRequest, statusText, onSend, onAbort, onRespondPermission, glass }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  // 自动滚动到底部
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages, streamingContent, toolSummary])

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
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} glass={glass} />
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
