'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Bot, Brain, ChevronDown, ChevronUp, FileText, Link2, Menu, MoreHorizontal, PanelLeft, PanelRight, RefreshCw, Trash2, X, Wifi, WifiOff } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ToolCallSummary } from './ToolCallSummary'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ChatInput } from './ChatInput'
import { PermissionDialog } from './PermissionDialog'
import { SearchBar } from './SearchBar'
import { ExportButton } from './ExportButton'
import Modal from '@/components/ui/Modal'
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
  onOpenMobileSidebar?: () => void
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
      <Image src={appIcon} alt="GClaw" width={64} height={64} className="w-16 h-16 rounded-lg mb-5 shadow-lg" />
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
            className="text-left text-sm px-3.5 py-3 rounded-xl border transition-all duration-200 cursor-pointer hover:border-purple-500 hover:shadow-sm hover:-translate-y-0.5 bg-white dark:bg-slate-800"
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

export function ChatPanel({ messages, initialLoading, streamingContent, thinkingContent, toolSummary, sending, permissionRequest, askQuestion, statusText, projectId, hasMore, onLoadMore, onSend, onAbort, onClearChat, onOpenChannels, onOpenSkills, onOpenAgents, sidebarHidden, onToggleSidebar, onOpenMobileSidebar, rightPanelHidden, onToggleRightPanel, onRespondPermission, onRespondAskQuestion, onUpdateMessage, projectName }: ChatPanelProps) {
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

  // 分支状态
  // activeBranch removed (branch feature hidden)

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

  // 自动滚动到底部（用 RAF 防抖，减少抖动）
  useEffect(() => {
    if (!shouldAutoScroll.current || !scrollContainerRef.current) return
    const raf = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [messages, streamingContent, toolSummary])

  // 检测用户是否手动向上滚动 — 使用原生 passive 监听器，不阻塞滚动合成
  const scrollRafRef = useRef<number>(0)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const onScroll = () => {
      if (scrollRafRef.current) return
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
        shouldAutoScroll.current = distanceFromBottom < 100
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  const isEmpty = messages.length === 0 && !streamingContent

  // ─── 提示词日志 ───
  const [showPromptLog, setShowPromptLog] = useState(false)
  const [promptLogs, setPromptLogs] = useState<Array<{
    timestamp: string
    model?: string
    systemPrompt: string
    userMessage: string
    attachments: Array<{ filename: string; mimeType: string; isImage: boolean; size?: number }>
    sdkOptions: { cwd: string; resume: boolean }
  }> | null>(null)
  const [expandedLog, setExpandedLog] = useState<number | null>(null)
  const [promptLogHasMore, setPromptLogHasMore] = useState(false)
  const [promptLogLoading, setPromptLogLoading] = useState(false)

  const loadPromptLogs = useCallback(async (append = false) => {
    if (promptLogLoading) return
    setPromptLogLoading(true)
    try {
      const offset = append ? (promptLogs?.length || 0) : 0
      const res = await fetch(`/api/chat/prompt-log?projectId=${encodeURIComponent(projectId)}&limit=10&offset=${offset}`)
      const data = await res.json()
      if (append) {
        setPromptLogs(prev => [...(prev || []), ...(data.logs || [])])
      } else {
        setPromptLogs(data.logs || [])
        setExpandedLog(null)
      }
      setPromptLogHasMore(data.hasMore || false)
      setShowPromptLog(true)
    } catch {
      if (!append) {
        setPromptLogs([])
        setShowPromptLog(true)
      }
    } finally {
      setPromptLogLoading(false)
    }
  }, [projectId, promptLogs?.length, promptLogLoading])

  return (
    <div className="relative flex flex-col h-full">
      {/* 固定工具栏：项目名 + 搜索 + 导出 + 清空 */}
      {!initialLoading && (
        <div
          data-tauri-drag-region
          className="flex items-center flex-nowrap gap-2 px-3 lg:px-4 py-1.5 flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* 移动端菜单按钮（屏幕 < 960px） */}
          {onOpenMobileSidebar && (
            <button
              onClick={onOpenMobileSidebar}
              className="[@media(min-width:960px)]:hidden p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="打开侧边栏"
            >
              <Menu size={16} />
            </button>
          )}
          {/* 展开侧边栏按钮（桌面端侧边栏隐藏时） */}
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
                      ? 'rgba(34, 197, 94, 0.12)'
                      : 'rgba(148, 163, 184, 0.10)',
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
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
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
              onClick={() => loadPromptLogs()}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 text-xs flex-shrink-0"
              title="查看提示词日志"
            >
              <FileText size={14} />
              <span className="hidden sm:inline whitespace-nowrap">日志</span>
            </button>
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
          <div className="flex-1 overflow-y-auto px-3 pt-4 pb-6 lg:px-4 lg:pt-6">
            <div className="w-full mx-auto flex flex-col gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                  <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-white/10 animate-pulse shrink-0" />
                  <div className={`max-w-[70%] flex flex-col gap-2 ${i % 2 === 0 ? '' : 'items-end'}`}>
                    <div className="h-3 w-16 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
                    <div className="rounded-lg px-4 py-3 bg-gray-200/80 dark:bg-white/[0.06] animate-pulse">
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
        <div className="flex-1 flex flex-col">
          <EmptyState onSend={handleSend} />
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
            <div className="px-3 pt-4 pb-6 lg:px-4 lg:pt-6">
              <div className="w-full mx-auto flex flex-col gap-4">
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

            {/* 消息列表 */}
            {messages.map(msg => (
              <div key={msg.id} id={`msg-${msg.id}`}>
                <MessageBubble
                  message={msg}
                  projectId={projectId}
                  onMessageUpdate={handleMessageUpdate}
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
                <ToolCallSummary summary={toolSummary} askQuestion={askQuestion} onRespondAskQuestion={onRespondAskQuestion} />
              </div>
            )}

            {/* 流式输出 */}
            {streamingContent && (
              <div className="flex gap-3 px-4 py-4 animate-fade-in rounded-lg mx-2 my-1 glass-card">
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
              <div className="flex gap-3 px-4 py-4 animate-fade-in rounded-lg mx-2 my-1 glass-card">
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

            {/* 底部间距：为固定输入框留白 */}
            <div className="h-32" />
              </div>
            </div>
          </div>
      )}

      {/* 权限审批对话框 */}
      {permissionRequest && (
        <div className="flex-shrink-0 px-3 lg:px-4 pb-2">
          <PermissionDialog request={permissionRequest} onRespond={onRespondPermission} />
        </div>
      )}

      {/* 输入区域 - 固定在底部，四周透明 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 lg:px-4 pb-3">
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

      {/* 提示词日志弹窗 */}
      <Modal open={showPromptLog} onClose={() => setShowPromptLog(false)} title="提示词日志" wide>
        <div className="px-6 py-4 space-y-3">
          {promptLogs === null ? (
            <div className="text-center text-sm text-slate-400 py-8">加载中...</div>
          ) : promptLogs.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-8">暂无记录</div>
          ) : (
            promptLogs.map((log, idx) => (
              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedLog(expandedLog === idx ? null : idx)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('zh-CN')}
                  </span>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate flex-1">
                    {log.userMessage.substring(0, 60)}{log.userMessage.length > 60 ? '...' : ''}
                  </span>
                  {log.attachments.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 whitespace-nowrap">
                      {log.attachments.length} 附件
                    </span>
                  )}
                  {log.model && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {log.model.split('-').slice(0, 2).join('-')}
                    </span>
                  )}
                  {expandedLog === idx ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                </button>
                {expandedLog === idx && (
                  <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-3">
                    {/* 用户消息 */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">用户消息</div>
                      <pre className="text-xs whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-800/50 rounded p-2 text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">{log.userMessage}</pre>
                    </div>
                    {/* 附件 */}
                    {log.attachments.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">附件 ({log.attachments.length})</div>
                        <div className="space-y-1">
                          {log.attachments.map((att, i) => (
                            <div key={i} className="text-xs bg-slate-50 dark:bg-slate-800/50 rounded px-2 py-1 flex items-center gap-2">
                              <span className="text-slate-600 dark:text-slate-300">{att.filename}</span>
                              <span className="text-slate-400 dark:text-slate-500">{att.mimeType}</span>
                              {att.size && <span className="text-slate-400 dark:text-slate-500">{(att.size / 1024).toFixed(1)}KB</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 系统提示词 */}
                    {log.systemPrompt && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">系统提示词 (CLAUDE.md) — {(log.systemPrompt.length / 1024).toFixed(1)}KB</div>
                        <pre className="text-xs whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-800/50 rounded p-2 text-slate-700 dark:text-slate-300 max-h-60 overflow-y-auto">{log.systemPrompt}</pre>
                      </div>
                    )}
                    {/* SDK 配置 */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">SDK 配置</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                        {log.model && <div>Model: {log.model}</div>}
                        <div>CWD: {log.sdkOptions.cwd}</div>
                        <div>Resume: {log.sdkOptions.resume ? '是' : '否'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {/* 加载更多 */}
          {promptLogHasMore && (
            <div className="flex justify-center pt-2 pb-1">
              <button
                onClick={() => loadPromptLogs(true)}
                disabled={promptLogLoading}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium px-4 py-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors disabled:opacity-50"
              >
                {promptLogLoading ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
