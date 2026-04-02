'use client'

import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { User, Bot, AlertCircle, Star, Tag, X, Check } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallSummary } from './ToolCallSummary'
import type { ChatMessage } from '@/types/chat'

interface MessageBubbleProps {
  message: ChatMessage
  glass?: boolean
  projectId: string
  onMessageUpdate?: (message: ChatMessage) => void
  allTags?: string[]
}

export const MessageBubble = memo(function MessageBubble({ message, glass, projectId, onMessageUpdate, allTags = [] }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const [hovered, setHovered] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // 空内容或 SDK 占位文本的 assistant 消息不渲染
  const noisePattern = /^[\s()]*(?:no content[)\s]*)+$/i
  if (!isUser && !isSystem && (!message.content.trim() || noisePattern.test(message.content))) {
    return null
  }

  // ---- 标签输入自动完成 ----
  const filteredSuggestions = tagQuery.trim()
    ? allTags.filter(t =>
        t.toLowerCase().includes(tagQuery.toLowerCase()) &&
        !(message.tags || []).includes(t)
      )
    : allTags.filter(t => !(message.tags || []).includes(t))

  // 重置选中索引当过滤结果变化
  useEffect(() => {
    setSelectedIdx(0)
  }, [tagQuery])

  useEffect(() => {
    if (showTagInput && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [showTagInput])

  const handleToggleStar = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/chat/messages/tags?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleStar', messageId: message.id }),
      })
      const data = await res.json()
      if (data.message && onMessageUpdate) {
        onMessageUpdate(data.message)
      }
    } catch (err) {
      console.error('Toggle star failed:', err)
    }
  }, [projectId, message.id, onMessageUpdate])

  const handleAddTag = useCallback(async (tag: string) => {
    if (!tag.trim()) return
    try {
      const res = await fetch(`/api/chat/messages/tags?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addTag', messageId: message.id, tag: tag.trim() }),
      })
      const data = await res.json()
      if (data.message && onMessageUpdate) {
        onMessageUpdate(data.message)
      }
      setTagQuery('')
    } catch (err) {
      console.error('Add tag failed:', err)
    }
  }, [projectId, message.id, onMessageUpdate])

  const handleRemoveTag = useCallback(async (tag: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/chat/messages/tags?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'removeTag', messageId: message.id, tag }),
      })
      const data = await res.json()
      if (data.message && onMessageUpdate) {
        onMessageUpdate(data.message)
      }
    } catch (err) {
      console.error('Remove tag failed:', err)
    }
  }, [projectId, message.id, onMessageUpdate])

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredSuggestions[selectedIdx]) {
        handleAddTag(filteredSuggestions[selectedIdx])
      } else if (tagQuery.trim()) {
        handleAddTag(tagQuery.trim())
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, filteredSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Escape') {
      setShowTagInput(false)
      setTagQuery('')
    }
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
    <div
      className={`relative flex gap-3 px-4 py-3.5 group ${glass && !isUser ? 'mx-2 my-1 rounded-xl' : ''}`}
      style={{
        backgroundColor: isUser ? 'transparent' : (glass ? 'var(--glass-msg-assistant)' : 'var(--color-bg-secondary)'),
        backdropFilter: glass && !isUser ? 'blur(12px)' : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowTagInput(false); setTagQuery('') }}
    >
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

        {/* 标签显示 */}
        {message.tags && message.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[11px] font-medium cursor-default group/tag"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                  color: 'var(--color-primary)',
                }}
              >
                {tag}
                <button
                  onClick={(e) => handleRemoveTag(tag, e)}
                  className="opacity-0 group-hover/tag:opacity-100 transition-opacity cursor-pointer ml-0.5"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
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

      {/* 悬停操作按钮 */}
      {hovered && (
        <div
          className="absolute top-2 right-2 flex items-center gap-0.5 animate-fade-in"
          style={{ zIndex: 10 }}
        >
          {/* 收藏按钮 */}
          <button
            onClick={handleToggleStar}
            className="p-1 rounded-md cursor-pointer transition-colors"
            style={{
              backgroundColor: message.isStarred
                ? 'color-mix(in srgb, #FDE047 20%, transparent)'
                : 'color-mix(in srgb, var(--color-text-muted) 8%, transparent)',
              color: message.isStarred ? '#D97706' : 'var(--color-text-muted)',
            }}
            title={message.isStarred ? '取消收藏' : '收藏'}
          >
            <Star size={13} fill={message.isStarred ? 'currentColor' : 'none'} />
          </button>

          {/* 添加标签按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowTagInput(!showTagInput)}
              className="p-1 rounded-md cursor-pointer transition-colors"
              style={{
                backgroundColor: showTagInput
                  ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                  : 'color-mix(in srgb, var(--color-text-muted) 8%, transparent)',
                color: showTagInput ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
              title="添加标签"
            >
              <Tag size={13} />
            </button>

            {/* 标签输入弹窗 */}
            {showTagInput && (
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-lg overflow-hidden"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  zIndex: 20,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="p-1.5">
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagQuery}
                    onChange={e => setTagQuery(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="输入标签名..."
                    className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-[var(--color-primary)]"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>
                {filteredSuggestions.length > 0 && (
                  <div className="border-t max-h-32 overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
                    {filteredSuggestions.slice(0, 8).map((tag, idx) => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: idx === selectedIdx ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        <Tag size={10} style={{ color: 'var(--color-text-muted)' }} />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                {tagQuery.trim() && !filteredSuggestions.includes(tagQuery.trim()) && (
                  <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <button
                      onClick={() => handleAddTag(tagQuery.trim())}
                      className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <Check size={10} />
                      创建 &ldquo;{tagQuery.trim()}&rdquo;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
