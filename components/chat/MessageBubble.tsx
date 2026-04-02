'use client'

import { memo } from 'react'
import { User, Bot, AlertCircle } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallSummary } from './ToolCallSummary'
import type { ChatMessage } from '@/types/chat'

interface MessageBubbleProps {
  message: ChatMessage
  glass?: boolean
}

export const MessageBubble = memo(function MessageBubble({ message, glass }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // 空内容或 SDK 占位文本的 assistant 消息不渲染
  const noisePattern = /^[\s()]*(?:no content[)\s]*)+$/i
  if (!isUser && !isSystem && (!message.content.trim() || noisePattern.test(message.content))) {
    return null
  }

  if (isSystem) {
    return (
      <div className="flex items-start gap-2 px-4 py-3 mx-4 my-2 rounded-xl animate-fade-in" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
        <AlertCircle size={16} className="text-[var(--color-error)] mt-0.5 flex-shrink-0" />
        <div className="text-sm" style={{ color: 'var(--color-error)' }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 px-4 py-3.5 ${glass && !isUser ? 'mx-2 my-1 rounded-xl' : ''}`} style={{
      backgroundColor: isUser ? 'transparent' : (glass ? 'var(--glass-msg-assistant)' : 'var(--color-bg-secondary)'),
      backdropFilter: glass && !isUser ? 'blur(12px)' : undefined,
    }}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
          backgroundColor: isUser
            ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
            : 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
        }}>
          {isUser
            ? <User size={15} style={{ color: 'var(--color-primary)' }} />
            : <Bot size={15} style={{ color: 'var(--color-primary)' }} />
          }
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {isUser ? '你' : 'Claude'}
        </div>

        {isUser ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)' }}>
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
        )}

        {/* 消息级工具摘要（含 Todo 列表） */}
        {!isUser && message.toolSummary &&
          (message.toolSummary.pendingTools.length > 0 || message.toolSummary.completedTools.length > 0) && (
          <div className="mt-2">
            <ToolCallSummary summary={message.toolSummary} />
          </div>
        )}

        {/* Stats */}
        {message.stats && (
          <div className="mt-2.5 flex items-center gap-2 text-[11px] px-2 py-1 rounded-md w-fit" style={{
            color: 'var(--color-text-muted)',
            backgroundColor: 'color-mix(in srgb, var(--color-text-muted) 6%, transparent)',
          }}>
            <span>{message.stats.model}</span>
            <span className="opacity-40">&middot;</span>
            <span>输入 {message.stats.inputTokens.toLocaleString()}</span>
            <span className="opacity-40">&middot;</span>
            <span>输出 {message.stats.outputTokens.toLocaleString()}</span>
            {message.stats.costUsd > 0 && (
              <>
                <span className="opacity-40">&middot;</span>
                <span>${message.stats.costUsd.toFixed(4)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
