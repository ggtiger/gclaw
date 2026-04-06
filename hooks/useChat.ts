'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage, ChatAttachment, ToolCallItem, ToolSummary, ConversationStats, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'

// ============================================================
// 模块级 per-project 流状态缓冲
// 流数据写入 buffer，React state 只在 projectId 匹配时更新
// ============================================================

interface StreamBuffer {
  content: string
  thinkingContent: string       // thinking 思考过程
  toolSummary: ToolSummary | null
  sending: boolean
  sessionId: string | null
  lastStats: ConversationStats | null
  permissionRequest: PermissionRequest | null
  askQuestion: AskUserQuestionRequest | null
  pendingMessages: ChatMessage[] // 流结束后产生的消息（assistant/error）
  statusText: string | null     // 当前状态文本（如 'compacting'）
}

const streamBuffers = new Map<string, StreamBuffer>()
// 当前正在执行的项目 ID 集合，供外部组件（如 ProjectSidebar）使用
const activeProjectIds = new Set<string>()
// 订阅者：activeProjectIds 变更时通知
const activeListeners = new Set<() => void>()

function getBuffer(projectId: string): StreamBuffer {
  let buf = streamBuffers.get(projectId)
  if (!buf) {
    buf = {
      content: '',
      thinkingContent: '',
      toolSummary: null,
      sending: false,
      sessionId: null,
      lastStats: null,
      permissionRequest: null,
      askQuestion: null,
      pendingMessages: [],
      statusText: null,
    }
    streamBuffers.set(projectId, buf)
  }
  return buf
}

function setActive(projectId: string, active: boolean) {
  if (active) {
    activeProjectIds.add(projectId)
  } else {
    activeProjectIds.delete(projectId)
  }
  activeListeners.forEach(fn => fn())
}

/**
 * 外部 hook：获取当前活跃的项目 ID 集合
 */
export function useActiveProjects(): Set<string> {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const listener = () => forceUpdate(n => n + 1)
    activeListeners.add(listener)
    return () => { activeListeners.delete(listener) }
  }, [])

  return activeProjectIds
}

// ============================================================
// useChat hook
// ============================================================

export function useChat(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [thinkingContent, setThinkingContent] = useState('')
  const [toolSummary, setToolSummary] = useState<ToolSummary | null>(null)
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lastStats, setLastStats] = useState<ConversationStats | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null)
  const [askQuestion, setAskQuestion] = useState<AskUserQuestionRequest | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  // 当前 projectId 的 ref，供闭包内判断
  const currentProjectIdRef = useRef(projectId)
  currentProjectIdRef.current = projectId

  // 加载历史消息
  const loadHistory = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/chat/messages?limit=100&projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }, [projectId])

  useEffect(() => {
    if (!initialized && projectId) {
      loadHistory()
      setInitialized(true)
    }
  }, [initialized, loadHistory, projectId])

  // projectId 变更时：从 buffer 恢复状态（不中断后台流）
  const prevProjectIdRef = useRef(projectId)
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId && projectId) {
      prevProjectIdRef.current = projectId

      // 从 buffer 恢复新项目的流状态
      const buf = getBuffer(projectId)
      setStreamingContent(buf.content)
      setThinkingContent(buf.thinkingContent)
      setToolSummary(buf.toolSummary)
      setSending(buf.sending)
      setSessionId(buf.sessionId)
      setLastStats(buf.lastStats)
      setPermissionRequest(buf.permissionRequest)
      setAskQuestion(buf.askQuestion)
      setStatusText(buf.statusText)

      // 如果 buffer 中有待合并的消息
      if (buf.pendingMessages.length > 0) {
        setMessages(prev => [...prev, ...buf.pendingMessages])
        buf.pendingMessages = []
      }

      // 重新加载历史
      loadHistory()
    }
  }, [projectId, loadHistory])

  // ---- 状态更新辅助：同时写入 React state 和 buffer ----
  const updateState = useCallback((forProjectId: string, updater: (buf: StreamBuffer) => void) => {
    const buf = getBuffer(forProjectId)
    updater(buf)

    // 只在当前显示的项目匹配时更新 React state
    if (currentProjectIdRef.current === forProjectId) {
      setStreamingContent(buf.content)
      setThinkingContent(buf.thinkingContent)
      setToolSummary(buf.toolSummary)
      setSending(buf.sending)
      setSessionId(buf.sessionId)
      setLastStats(buf.lastStats)
      setPermissionRequest(buf.permissionRequest)
      setAskQuestion(buf.askQuestion)
      setStatusText(buf.statusText)
    }
  }, [])

  // ---- 订阅渠道消息 SSE（微信等渠道的消息实时推送到对话框） ----
  useEffect(() => {
    if (!projectId) return

    const channelEvtSource = new EventSource(
      `/api/channels/events?projectId=${encodeURIComponent(projectId)}`
    )

    // 渠道缓冲：累积渠道 Agent 的流式内容
    let channelAccContent = ''

    channelEvtSource.addEventListener('channel_user_message', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.message) {
          setMessages(prev => [...prev, data.message])
        }
      } catch {}
    })

    channelEvtSource.addEventListener('channel_start', () => {
      channelAccContent = ''
      updateState(projectId, b => {
        b.sending = true
        b.content = ''
        b.toolSummary = null
      })
      setActive(projectId, true)
    })

    channelEvtSource.addEventListener('channel_delta', (e) => {
      try {
        const data = JSON.parse(e.data)
        channelAccContent += data.content || ''
        updateState(projectId, b => { b.content = channelAccContent })
      } catch {}
    })

    channelEvtSource.addEventListener('channel_tool_use', (e) => {
      try {
        const data = JSON.parse(e.data)
        const tool = {
          toolUseId: data.toolUseId as string,
          toolName: data.toolName as string,
          input: data.input as Record<string, unknown>,
          status: 'pending' as const,
        }
        updateState(projectId, b => {
          const prev = b.toolSummary
          const pending = prev?.pendingTools || []
          const completed = prev?.completedTools || []
          b.toolSummary = { pendingTools: [...pending, tool], completedTools: completed }
        })
      } catch {}
    })

    channelEvtSource.addEventListener('channel_tool_result', (e) => {
      try {
        const data = JSON.parse(e.data)
        const resultId = data.toolUseId as string
        updateState(projectId, b => {
          if (!b.toolSummary) return
          const pending = b.toolSummary.pendingTools.filter(t => t.toolUseId !== resultId)
          const completedTool = b.toolSummary.pendingTools.find(t => t.toolUseId === resultId)
          const completed = [
            ...b.toolSummary.completedTools,
            ...(completedTool
              ? [{ ...completedTool, status: (data.isError ? 'error' : 'completed') as 'error' | 'completed', output: data.content as string, isError: data.isError as boolean }]
              : []),
          ]
          b.toolSummary = { pendingTools: pending, completedTools: completed }
        })
      } catch {}
    })

    channelEvtSource.addEventListener('channel_done', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.message) {
          setMessages(prev => [...prev, data.message])
        }
      } catch {}
      channelAccContent = ''
      updateState(projectId, b => {
        b.sending = false
        b.content = ''
        b.toolSummary = null
      })
      setActive(projectId, false)
    })

    channelEvtSource.addEventListener('channel_error', (e) => {
      try {
        const data = JSON.parse(e.data)
        console.error('[Channel SSE] error:', data.message)
      } catch {}
    })

    return () => {
      channelEvtSource.close()
    }
  }, [projectId, updateState])

  // 发送消息
  const sendMessage = useCallback(async (text: string, attachments?: ChatAttachment[]) => {
    if (!text.trim() && (!attachments || attachments.length === 0)) return

    // 捕获发送时的 projectId（闭包绑定）
    const sendProjectId = currentProjectIdRef.current

    // 检查该项目是否已在发送
    const existingBuf = getBuffer(sendProjectId)
    if (existingBuf.sending) return

    // 添加用户消息到本地状态
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: text.trim() || '(附件)',
      messageType: 'text',
      createdAt: new Date().toISOString(),
      attachments: attachments || undefined,
    }
    setMessages(prev => [...prev, userMsg])

    // 初始化 buffer
    updateState(sendProjectId, buf => {
      buf.sending = true
      buf.content = ''
      buf.thinkingContent = ''
      buf.toolSummary = null
      buf.lastStats = null
      buf.permissionRequest = null
      buf.askQuestion = null
      buf.pendingMessages = []
      buf.statusText = null
    })
    setActive(sendProjectId, true)

    const controller = new AbortController()
    // 把 controller 存到 buffer，方便 abort
    const buf = getBuffer(sendProjectId)
    ;(buf as StreamBuffer & { _controller?: AbortController })._controller = controller

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim() || '(附件)',
          projectId: sendProjectId,
          attachments: attachments || undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (!part.trim()) continue

          let eventType = ''
          let eventData = ''

          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }

          if (!eventType || !eventData) continue

          let data: Record<string, unknown>
          try { data = JSON.parse(eventData) } catch { continue }

          switch (eventType) {
            case 'init':
              updateState(sendProjectId, b => { b.sessionId = data.sessionId as string })
              break

            case 'delta':
              accContent += data.content as string
              if (!/^[\s()]*(?:no content[)\s]*)+$/i.test(accContent)) {
                updateState(sendProjectId, b => { b.content = accContent })
              }
              break

            case 'thinking':
              updateState(sendProjectId, b => {
                b.thinkingContent += (data.content as string)
              })
              break

            case 'tool_use': {
              const tool: ToolCallItem = {
                toolUseId: data.toolUseId as string,
                toolName: data.toolName as string,
                input: data.input as Record<string, unknown>,
                status: 'pending',
              }
              updateState(sendProjectId, b => {
                const prev = b.toolSummary
                const pending = prev?.pendingTools || []
                const completed = prev?.completedTools || []
                const existingIdx = pending.findIndex(t => t.toolUseId === tool.toolUseId)
                if (existingIdx >= 0) {
                  const updated = [...pending]
                  updated[existingIdx] = { ...updated[existingIdx], input: tool.input }
                  b.toolSummary = { pendingTools: updated, completedTools: completed }
                } else {
                  b.toolSummary = { pendingTools: [...pending, tool], completedTools: completed }
                }
              })
              break
            }

            case 'tool_result': {
              const resultId = data.toolUseId as string
              const resultContent = data.content as string
              const isError = data.isError as boolean
              updateState(sendProjectId, b => {
                if (!b.toolSummary) return
                const pending = b.toolSummary.pendingTools.filter(t => t.toolUseId !== resultId)
                const completedTool = b.toolSummary.pendingTools.find(t => t.toolUseId === resultId)
                // AskUserQuestion 被前端拦截后 SDK 返回 isError=true，
                // 但实际是用户回答而非错误，前端不显示为错误
                const isAskQuestion = completedTool?.toolName === 'AskUserQuestion'
                const effectiveIsError = isAskQuestion ? false : isError
                const completed = [
                  ...b.toolSummary.completedTools,
                  ...(completedTool
                    ? [{ ...completedTool, status: effectiveIsError ? 'error' as const : 'completed' as const, output: resultContent, isError: effectiveIsError }]
                    : []),
                ]
                b.toolSummary = { pendingTools: pending, completedTools: completed }
              })
              break
            }

            case 'tool_progress': {
              const progressId = data.toolUseId as string
              const elapsed = data.elapsedSeconds as number
              updateState(sendProjectId, b => {
                if (!b.toolSummary) return
                const idx = b.toolSummary.pendingTools.findIndex(t => t.toolUseId === progressId)
                if (idx >= 0) {
                  const updated = [...b.toolSummary.pendingTools]
                  updated[idx] = { ...updated[idx], elapsedSeconds: elapsed }
                  b.toolSummary = { ...b.toolSummary, pendingTools: updated }
                }
              })
              break
            }

            case 'status':
              updateState(sendProjectId, b => {
                b.statusText = (data.status as string) || null
              })
              break

            case 'permission_request':
              updateState(sendProjectId, b => {
                b.permissionRequest = {
                  requestId: data.requestId as string,
                  toolName: data.toolName as string,
                  toolInput: (data.toolInput as Record<string, unknown>) || {},
                  description: data.description as string,
                }
              })
              break

            case 'ask_user_question':
              updateState(sendProjectId, b => {
                b.askQuestion = {
                  requestId: data.requestId as string,
                  questions: data.questions as AskUserQuestionRequest['questions'],
                }
              })
              break

            case 'skill_notify': {
              // 技能通知：显示为系统消息
              const notifyMsg: ChatMessage = {
                id: `msg_${Date.now()}_skill_notify`,
                role: 'system',
                content: (data.message as string) || `[${data.source}] ${data.type}`,
                messageType: 'text',
                createdAt: (data.timestamp as string) || new Date().toISOString(),
              }
              if (currentProjectIdRef.current === sendProjectId) {
                setMessages(prev => [...prev, notifyMsg])
              } else {
                getBuffer(sendProjectId).pendingMessages.push(notifyMsg)
              }
              break
            }

            case 'done': {
              const stats: ConversationStats | null = data.usage
                ? {
                    costUsd: (data.costUsd as number) || 0,
                    inputTokens: (data.usage as Record<string, number>).inputTokens || 0,
                    outputTokens: (data.usage as Record<string, number>).outputTokens || 0,
                    cachedTokens: (data.usage as Record<string, number>).cachedTokens || 0,
                    model: (data.model as string) || '',
                  }
                : null

              let finalContent = accContent || (data.fullContent as string) || ''
              const noisePattern = /^[\s()]*(?:no content[)\s]*)+$/i
              if (noisePattern.test(finalContent)) finalContent = ''

              // 快照当前 toolSummary 到消息中，确保 todo 列表随消息持久化
              const buf = getBuffer(sendProjectId)
              const snapshotSummary = buf.toolSummary &&
                (buf.toolSummary.pendingTools.length > 0 || buf.toolSummary.completedTools.length > 0)
                ? { ...buf.toolSummary }
                : undefined

              if (finalContent.trim() && !noisePattern.test(finalContent)) {
                const assistantMsg: ChatMessage = {
                  id: `msg_${Date.now()}_assistant`,
                  role: 'assistant',
                  content: finalContent,
                  messageType: 'text',
                  createdAt: new Date().toISOString(),
                  stats: stats || undefined,
                  toolSummary: snapshotSummary,
                }
                // 如果当前显示的是该项目，直接更新 messages
                if (currentProjectIdRef.current === sendProjectId) {
                  setMessages(prev => [...prev, assistantMsg])
                } else {
                  // 否则存入 buffer 待切回时合并
                  getBuffer(sendProjectId).pendingMessages.push(assistantMsg)
                }
              }

              updateState(sendProjectId, b => {
                b.content = ''
                b.lastStats = stats
                b.toolSummary = null  // 已快照到消息中，清空全局状态
              })
              break
            }

            case 'error': {
              console.error('Stream error:', data.message)
              const errorMsg: ChatMessage = {
                id: `msg_${Date.now()}_system`,
                role: 'system',
                content: data.message as string,
                messageType: 'text',
                createdAt: new Date().toISOString(),
              }
              if (currentProjectIdRef.current === sendProjectId) {
                setMessages(prev => [...prev, errorMsg])
              } else {
                getBuffer(sendProjectId).pendingMessages.push(errorMsg)
              }
              break
            }

            case 'end':
              break
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Chat error:', err)
        const errorMsg: ChatMessage = {
          id: `msg_${Date.now()}_system`,
          role: 'system',
          content: `发送失败: ${err}`,
          messageType: 'text',
          createdAt: new Date().toISOString(),
        }
        if (currentProjectIdRef.current === sendProjectId) {
          setMessages(prev => [...prev, errorMsg])
        } else {
          getBuffer(sendProjectId).pendingMessages.push(errorMsg)
        }
      }
    } finally {
      updateState(sendProjectId, b => {
        b.sending = false
        b.content = ''
      })
      setActive(sendProjectId, false)
      const b = getBuffer(sendProjectId)
      delete (b as StreamBuffer & { _controller?: AbortController })._controller
    }
  }, [updateState])

  // 中止
  const abortChat = useCallback(async () => {
    const abortProjectId = currentProjectIdRef.current
    // 中止 fetch
    const buf = getBuffer(abortProjectId) as StreamBuffer & { _controller?: AbortController }
    if (buf._controller) {
      buf._controller.abort()
    }
    // 通知后端
    try {
      await fetch(`/api/chat/abort?projectId=${encodeURIComponent(abortProjectId)}`, { method: 'POST' })
    } catch {}
    updateState(abortProjectId, b => {
      b.sending = false
      b.content = ''
    })
    setActive(abortProjectId, false)
  }, [updateState])

  // 回复权限请求
  const respondPermission = useCallback(async (requestId: string, decision: 'allow' | 'deny') => {
    try {
      await fetch('/api/chat/permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, decision }),
      })
    } catch (err) {
      console.error('Failed to respond permission:', err)
    }
    updateState(currentProjectIdRef.current, b => { b.permissionRequest = null })
  }, [updateState])

  // 回复 AskUserQuestion
  const respondAskQuestion = useCallback(async (requestId: string, answers: Record<string, string>) => {
    try {
      await fetch('/api/chat/ask-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, answers }),
      })
    } catch (err) {
      console.error('Failed to respond ask question:', err)
    }
    updateState(currentProjectIdRef.current, b => { b.askQuestion = null })
  }, [updateState])

  // 清空对话
  const clearChat = useCallback(async () => {
    try {
      await fetch(`/api/chat/messages?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      setMessages([])
      setSessionId(null)
      setToolSummary(null)
      setLastStats(null)
    } catch (err) {
      console.error('Failed to clear chat:', err)
    }
  }, [projectId])

  // 更新单条消息（标签/收藏操作后）
  const updateMessage = useCallback((updated: ChatMessage) => {
    setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
  }, [])

  return {
    messages,
    streamingContent,
    thinkingContent,
    toolSummary,
    sending,
    sessionId,
    lastStats,
    permissionRequest,
    askQuestion,
    statusText,
    sendMessage,
    abortChat,
    clearChat,
    loadHistory,
    respondPermission,
    respondAskQuestion,
    updateMessage,
  }
}
