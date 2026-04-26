'use client'

import { memo, useState, useCallback } from 'react'
import { User, AlertCircle, FileText, Download, ChevronDown, ThumbsUp, ThumbsDown, Copy, X, Settings, Monitor, Send, Bell, MessageCircle, Terminal, Clock, type LucideIcon } from 'lucide-react'
import { useAssistantIdentity } from '@/hooks/useAssistantIdentity'
import { CornerLeftUp } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { StreamingBlocksRenderer, adaptContentBlocks } from './StreamingBlocksRenderer'
import { ToolCallSummary } from './ToolCallSummary'
import type { ChatMessage, ChatAttachment, MessageSource } from '@/types/chat'

// 来源渠道配置：图标 + 标签 + 颜色
const SOURCE_CONFIG: Record<MessageSource, { icon: LucideIcon; label: string; color: string; bg: string }> = {
  web: { icon: Monitor, label: 'Web', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/15' },
  feishu: { icon: Send, label: '飞书', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/15' },
  dingtalk: { icon: Bell, label: '钉钉', color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/15' },
  wechat: { icon: MessageCircle, label: '微信', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/15' },
  api: { icon: Terminal, label: 'API', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/15' },
  schedule: { icon: Clock, label: '定时', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/15' },
}

interface MessageBubbleProps {
  message: ChatMessage
  projectId: string
  onMessageUpdate?: (message: ChatMessage) => void
  onOpenSettings?: () => void
  replyToMessage?: ChatMessage  // assistant 消息回复的 user 消息
  assistantName?: string
  assistantIcon?: string
  assistantAvatar?: string
}

// 模块级常量，避免每次渲染重建
const NOISE_PATTERN = /^[\s()]*(?:no content[)\s]*)+$/i
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

// 长消息折叠阈值（字符数）— 超过此长度默认折叠，减少 DOM 点数量
const COLLAPSE_THRESHOLD = 2000

export const MessageBubble = memo(function MessageBubble({ message, projectId, onMessageUpdate, onOpenSettings, replyToMessage, assistantName, assistantIcon, assistantAvatar }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const source = message.source || 'web'
  const sourceConfig = isUser ? SOURCE_CONFIG[source] : null
  const SourceIcon = sourceConfig?.icon
  const { name: assistantDisplayName, Icon: AssistantIcon, avatarUrl: assistantAvatarUrl } = useAssistantIdentity(
    assistantName || assistantIcon || assistantAvatar ? { assistantName, assistantIcon, assistantAvatar } : null,
    projectId
  )

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
    const needsSettings = message.content.includes('API Key') || message.content.includes('设置')
    return (
      <div className="flex items-start gap-2 px-4 py-3 mx-4 my-2 rounded-xl animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
        <AlertCircle size={16} className="text-[var(--color-error)] mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm" style={{ color: 'var(--color-error)' }}>
            {message.content}
          </div>
          {needsSettings && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/15 transition-colors font-medium"
              style={{ color: 'var(--color-error)' }}
            >
              <Settings size={12} />
              前往设置
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 w-full ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
      {/* Avatar */}
      <div className="shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isUser ? (sourceConfig?.bg || 'bg-purple-500/15') : assistantAvatarUrl ? '' : 'bg-purple-500/10 dark:bg-purple-500/20'}`}>
          {isUser
            ? SourceIcon
              ? <SourceIcon size={15} className={sourceConfig?.color || 'text-purple-600 dark:text-purple-400'} />
              : <User size={15} className="text-purple-600 dark:text-purple-400" />
            : assistantAvatarUrl
              ? <img src={assistantAvatarUrl} alt="" className="w-full h-full object-cover" />
              : <AssistantIcon size={15} className="text-purple-600 dark:text-purple-400" />
          }
        </div>
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className={`text-xs font-medium ${isUser ? (sourceConfig?.color || 'text-purple-600 dark:text-purple-400') : 'text-slate-500 dark:text-slate-400'}`}>
            {isUser ? (message.sourceName || sourceConfig?.label || '你') : assistantDisplayName}
          </span>
          {isUser && message.sourceName && sourceConfig && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sourceConfig.bg} ${sourceConfig.color}`}>
              {sourceConfig.label}
            </span>
          )}
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
          <>
          {/* 回复引用条：显示回复的 user 消息摘要 */}
          {replyToMessage && (() => {
            const src = replyToMessage.source || 'web'
            const cfg = SOURCE_CONFIG[src]
            const borderColors: Record<string, string> = {
              web: '#9333ea', feishu: '#2563eb', dingtalk: '#0284c7',
              wechat: '#16a34a', api: '#ea580c', schedule: '#d97706',
            }
            return (
              <button
                onClick={() => {
                  const el = document.getElementById(`msg-${replyToMessage.id}`)
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    el.classList.add('ring-2')
                    el.style.setProperty('--tw-ring-color', 'var(--color-primary)')
                    setTimeout(() => el.classList.remove('ring-2'), 1500)
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 mb-0.5 rounded-md text-[11px] cursor-pointer transition-colors hover:bg-slate-500/10 dark:hover:bg-slate-400/10 border-l-2 max-w-full"
                style={{ borderLeftColor: borderColors[src] || '#9333ea', color: 'var(--color-text-muted)' }}
              >
                <CornerLeftUp size={11} className="flex-shrink-0 opacity-50" />
                {cfg && <span className={`flex-shrink-0 ${cfg.color}`} style={{ fontSize: 10 }}>{cfg.label}</span>}
                <span className="truncate opacity-70">{replyToMessage.content.slice(0, 50) || '(附件)'}</span>
              </button>
            )
          })()}
          <div className="p-4 text-sm leading-relaxed break-words max-w-full rounded-lg rounded-tl-sm border text-[var(--color-text)] shadow-sm glass-card">
            {message.contentBlocks && message.contentBlocks.length > 0 ? (
              // 新模式：交错渲染文本和工具调用
              <StreamingBlocksRenderer
                blocks={adaptContentBlocks(message.contentBlocks)}
                isStreaming={message.isStreaming}
              />
            ) : (
              // 旧模式回退：纯文本渲染
              <>
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
              </>
            )}
          </div>
          </>
        )}

        {/* 旧消息 toolSummary（仅无 contentBlocks 时显示） */}
        {!isUser && !message.contentBlocks && message.toolSummary &&
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

  // 音频附件：可播放
  if (attachment.type === 'audio') {
    return (
      <div className="px-3 py-2 rounded-lg bg-white/15 max-w-[300px]">
        <audio
          controls
          preload="auto"
          src={attachment.url}
          style={{ width: '100%', height: 40 }}
        />
      </div>
    )
  }

  // 非图片/音频附件
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