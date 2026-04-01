'use client'

import { memo } from 'react'
import { User, Bot, AlertCircle } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { ChatMessage } from '@/types/chat'

interface MessageBubbleProps {
  message: ChatMessage
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex items-start gap-2 px-4 py-3 mx-4 my-2 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)' }}>
        <AlertCircle size={16} className="text-[var(--color-error)] mt-0.5 flex-shrink-0" />
        <div className="text-sm" style={{ color: 'var(--color-error)' }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 px-4 py-4 ${isUser ? '' : ''}`} style={{
      backgroundColor: isUser ? 'transparent' : 'var(--color-bg-secondary)',
    }}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
          backgroundColor: isUser ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
        }}>
          {isUser
            ? <User size={16} className="text-white" />
            : <Bot size={16} style={{ color: 'var(--color-text-secondary)' }} />
          }
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {isUser ? '你' : 'Claude'}
        </div>

        {isUser ? (
          <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
        )}

        {/* Stats */}
        {message.stats && (
          <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>{message.stats.model}</span>
            <span>&middot;</span>
            <span>输入 {message.stats.inputTokens.toLocaleString()}</span>
            <span>&middot;</span>
            <span>输出 {message.stats.outputTokens.toLocaleString()}</span>
            {message.stats.costUsd > 0 && (
              <>
                <span>&middot;</span>
                <span>${message.stats.costUsd.toFixed(4)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
