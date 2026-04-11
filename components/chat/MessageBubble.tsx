'use client'

import { memo, useState, useCallback } from 'react'
import { User, Bot, AlertCircle, FileText, Download, ChevronDown, ThumbsUp, ThumbsDown, Copy, X } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallSummary } from './ToolCallSummary'
import type { ChatMessage, ChatAttachment } from '@/types/chat'

interface MessageBubbleProps {
  message: ChatMessage
  projectId: string
  onMessageUpdate?: (message: ChatMessage) => void
}

// 模块级常量，避免每次渲染重建
const NOISE_PATTERN = /^[\s()]*(?:no content[)\s]*)+$/i
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

// 长消息折叠阈值（字符数）— 超过此长度默认折叠，减少 DOM 点数量
const COLLAPSE_THRESHOLD = 2000

export const MessageBubble = memo(function MessageBubble({ message, projectId, onMessageUpdate }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // 长消息默认折叠，点击展开
  const [expanded, setExpanded] = useState(() => !message.isStreaming && message.content.length <= COLLAPSE_THRESHOLD)

  // 空内容或 SDK 占位文本的 assistant 消息不渲染
  if (!isUser && !isSystem && (!message.content.trim() || NOISE_PATTERN.test(message.content))) {
    return null
  }

  // 点赞/踩反馈
  const handleFeedback = useCallback(async (feedback: 'like' | 'dislike') => {
    try {
      const res = await fetch(`/api/chat/messages/feedback?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          feedback,
          content: message.content.slice(0, 500), // 截取前500字符用于记忆
        }),
      })
      const data = await res.json()
      if (data.message && onMessageUpdate) {
        onMessageUpdate(data.message)
      }
    } catch (err) {
      console.error('Feedback failed:', err)
    }
  }, [projectId, message.id, message.content, onMessageUpdate])

  // 复制消息内容
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }, [message.content])

  if (isSystem) {
    return (
      <div className="flex items-start gap-2 px-4 py-3 mx-4 my-2 rounded-xl animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
        <AlertCircle size={16} className="text-[var(--color-error)] mt-0.5 flex-shrink-0" />
        <div className="text-sm" style={{ color: 'var(--color-error)' }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 w-full ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
      {/* Avatar */}
      <div className="shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isUser ? 'bg-purple-500/15' : 'bg-purple-500/10 dark:bg-purple-500/20'}`}>
          {isUser
            ? <User size={15} className="text-purple-600 dark:text-purple-400" />
            : <Bot size={15} className="text-purple-600 dark:text-purple-400" />
          }
        </div>
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-baseline gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className={`text-xs font-medium ${isUser ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {isUser ? '你' : 'Claude'}
          </span>
          <span className="text-[10px] text-slate-400/50">
            {new Date(message.createdAt).toLocaleTimeString('zh-CN', TIME_FORMAT)}
          </span>
        </div>

        {isUser ? (
          <div className="p-4 text-sm leading-relaxed break-words max-w-full bg-purple-600/80 backdrop-blur-md text-white rounded-lg rounded-tr-sm shadow-lg shadow-purple-500/20 border border-purple-400/20">
            {message.content !== '(附件)' && message.content}
            {/* 附件预览 */}
            {message.attachments && message.attachments.length > 0 && (
              <div className={`flex flex-wrap gap-2 ${message.content !== '(附件)' ? 'mt-3 pt-3 border-t border-white/20' : ''}`}>
                {message.attachments.map(att => (
                  <AttachmentPreview key={att.id} attachment={att} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 text-sm leading-relaxed break-words max-w-full rounded-lg rounded-tl-sm border text-[var(--color-text)] shadow-sm glass-card">
            {/* 长消息折叠：只渲染前 COLLAPSE_THRESHOLD 字符，大幅减少 DOM 节点 */}
            <MarkdownRenderer
              content={expanded || message.isStreaming ? message.content : message.content.slice(0, COLLAPSE_THRESHOLD) + '\n\n...'}
              isStreaming={message.isStreaming}
            />
            {!expanded && !message.isStreaming && message.content.length > COLLAPSE_THRESHOLD && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-3 flex items-center gap-1 text-xs font-medium cursor-pointer text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              >
                <ChevronDown size={14} />
                展开完整内容（{Math.ceil(message.content.length / 1000)}k 字符）
              </button>
            )}
          </div>
        )}

        {/* 消息级工具摘要（含 Todo 列表） */}
        {!isUser && message.toolSummary &&
          (message.toolSummary.pendingTools.length > 0 || message.toolSummary.completedTools.length > 0) && (
          <div className="mt-1 w-full">
            <ToolCallSummary summary={message.toolSummary} />
          </div>
        )}

        {/* 底部操作按钮 + 模型用量（仅 assistant 消息显示） */}
        {!isUser && (
          <div className="mt-1.5 flex items-center gap-2">
            {/* 反馈按钮组 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleFeedback('like')}
                className={`p-1 rounded-md cursor-pointer transition-colors ${message.feedback === 'like' ? 'bg-green-500/15 text-green-600' : 'text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-500/10'}`}
                title="点赞"
              >
                <ThumbsUp size={14} />
              </button>
              <button
                onClick={() => handleFeedback('dislike')}
                className={`p-1 rounded-md cursor-pointer transition-colors ${message.feedback === 'dislike' ? 'bg-red-500/15 text-red-600' : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'}`}
                title="踩"
              >
                <ThumbsDown size={14} />
              </button>
              <button
                onClick={handleCopy}
                className="p-1 rounded-md cursor-pointer transition-colors text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                title="复制"
              >
                <Copy size={14} />
              </button>
            </div>

            {/* 模型用量 */}
            {message.stats && (
              <div className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded bg-slate-500/5 text-slate-500 dark:text-slate-400">
                <span>{message.stats.model}</span>
                <span className="opacity-40">·</span>
                <span>输入 {message.stats.inputTokens.toLocaleString()}</span>
                <span className="opacity-40">·</span>
                <span>输出 {message.stats.outputTokens.toLocaleString()}</span>
                {message.stats.costUsd > 0 && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>${message.stats.costUsd.toFixed(4)}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

// ── 附件预览组件 ──

function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const [expanded, setExpanded] = useState(false)

  if (attachment.type === 'image') {
    return (
      <>
        <div
          className="cursor-pointer rounded-lg overflow-hidden max-w-[200px] max-h-[150px] border border-white/20"
          onClick={() => setExpanded(true)}
        >
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="w-full h-full object-cover"
          />
        </div>
        {expanded && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]">
              <img
                src={attachment.url}
                alt={attachment.filename}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
              <button
                onClick={() => setExpanded(false)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  // 非图片附件
  return (
    <a
      href={attachment.url}
      download={attachment.filename}
      target="_blank"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors max-w-[220px]"
    >
      <FileText size={16} className="flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs truncate">{attachment.filename}</div>
        <div className="text-[10px] opacity-70">
          {(attachment.size / 1024).toFixed(attachment.size > 1024 * 1024 ? 1 : 0)}
          {attachment.size > 1024 * 1024 ? ' MB' : ' KB'}
        </div>
      </div>
      <Download size={12} className="flex-shrink-0 opacity-60" />
    </a>
  )
}