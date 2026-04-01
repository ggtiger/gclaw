'use client'

import { useRef, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ToolCallSummary } from './ToolCallSummary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatInput } from './ChatInput'
import type { ChatMessage, ToolSummary } from '@/types/chat'

interface ChatPanelProps {
  messages: ChatMessage[]
  streamingContent: string
  toolSummary: ToolSummary | null
  sending: boolean
  onSend: (message: string) => void
  onAbort: () => void
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{
        backgroundColor: 'var(--color-bg-secondary)',
      }}>
        <Bot size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
      <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
        GClaw
      </h2>
      <p className="text-sm text-center max-w-md" style={{ color: 'var(--color-text-muted)' }}>
        基于 Claude Code SDK 的 AI 对话助手。输入消息开始对话。
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2 max-w-md w-full">
        {[
          '帮我写一个 React 组件',
          '解释一下 TypeScript 泛型',
          '帮我调试这个 bug',
          '代码审查最佳实践',
        ].map(suggestion => (
          <button
            key={suggestion}
            onClick={() => onSend(suggestion)}
            className="text-left text-sm px-3 py-2.5 rounded-lg border transition-colors cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatPanel({ messages, streamingContent, toolSummary, sending, onSend, onAbort }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

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
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* 工具调用摘要 */}
            {toolSummary && (toolSummary.pendingTools.length > 0 || toolSummary.completedTools.length > 0) && (
              <div className="px-4 py-2">
                <ToolCallSummary summary={toolSummary} />
              </div>
            )}

            {/* 流式输出 */}
            {streamingContent && (
              <div className="flex gap-3 px-4 py-4" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                  }}>
                    <Bot size={16} style={{ color: 'var(--color-text-secondary)' }} />
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
              <div className="flex gap-3 px-4 py-4" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                  }}>
                    <Bot size={16} style={{ color: 'var(--color-text-secondary)' }} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Claude
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)', animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)', animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)', animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* 底部间距 */}
            <div className="h-4" />
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="max-w-3xl mx-auto w-full">
        <ChatInput onSend={onSend} onAbort={onAbort} sending={sending} />
      </div>
    </div>
  )
}
