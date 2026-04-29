'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { ChatMessage, ChatAttachment, ToolCallItem, ToolSummary, ConversationStats, PermissionRequest, AskUserQuestionRequest, ActivityData, FileChangeEntry, ActivityTodoItem, StreamingBlock, ContentBlock } from '@/types/chat'

// ── Tauri 系统通知：窗口隐藏时推送 ──
let __tauri_notification_shown = false // 避免重复请求权限弹窗
async function sendDesktopNotification(title: string, body: string) {
  // 只在 Tauri 环境中生效
  const ti = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
    | { invoke?: (c: string, a?: unknown) => Promise<unknown> }
    | undefined
  if (!ti?.invoke) return

  // 窗口可见时不需要通知
  try {
    const visible = await ti.invoke('plugin:window|is_visible', { label: 'main' })
    if (visible) return
  } catch {
    return
  }

  // 发送通知 + 托盘图标闪烁
  try {
    if (!__tauri_notification_shown) {
      const permitted = await ti.invoke('plugin:notification|is_permission_granted') as boolean
      if (!permitted) {
        await ti.invoke('plugin:notification|request_permission')
      }
      __tauri_notification_shown = true
    }
    await ti.invoke('plugin:notification|notify', {
      options: { title, body },
    })
    ti.invoke('flash_tray_icon').catch(() => {})
  } catch {}
}

// 模块级常量，避免每次渲染重建
const NOISE_PATTERN = /^[\s()]*(?:no content[)\s]*)+$/i

// ============================================================
// 模块级 per-project 流状态缓冲
// 流数据写入 buffer，React state 只在 projectId 匹配时更新
// ============================================================

interface StreamBuffer {
  streamingBlocks: StreamingBlock[]    // 替代 content + toolSummary
  textBlockCounter: number             // text block ID 递增
  thinkingContent: string              // thinking 思考过程
  sending: boolean
  sessionId: string | null
  lastStats: ConversationStats | null
  permissionRequest: PermissionRequest | null
  askQuestion: AskUserQuestionRequest | null
  pendingMessages: ChatMessage[]       // 流结束后产生的消息（assistant/error）
  statusText: string | null            // 当前状态文本（如 'compacting'）
  planContent: string | null
  fileChanges: FileChangeEntry[]
  todos: ActivityTodoItem[]
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
      streamingBlocks: [],
      textBlockCounter: 0,
      thinkingContent: '',
      sending: false,
      sessionId: null,
      lastStats: null,
      permissionRequest: null,
      askQuestion: null,
      pendingMessages: [],
      statusText: null,
      planContent: null,
      fileChanges: [],
      todos: [],
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

function extractActivityFromTool(
  toolName: string,
  input: Record<string, unknown>,
  toolUseId: string,
  buf: StreamBuffer,
  startLine?: number,
  extra?: { fileExists?: boolean; oldContent?: string },
) {
  // ExitPlanMode -> planContent
  if (toolName === 'ExitPlanMode' && input.plan) {
    buf.planContent = input.plan as string
  }
  // Write/Edit/MultiEdit -> fileChanges
  if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
    const filePath = (input.file_path || input.path || '') as string
    if (filePath && !buf.fileChanges.find(c => c.toolUseId === toolUseId)) {
      // MultiEdit 使用 edits 数组，将多个编辑合并为 diff 文本
      let content: string | undefined
      let oldString: string | undefined
      let newString: string | undefined
      let changeType: 'write' | 'edit' | 'multiedit' = toolName.toLowerCase() as 'write' | 'edit' | 'multiedit'
      if (toolName === 'Write') {
        content = input.content as string
        // 文件已存在时，显示为"编辑"并展示 diff
        if (extra?.fileExists) {
          changeType = 'edit'
          oldString = extra.oldContent || ''
          newString = content
          content = undefined
        }
      } else if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
        const edits = input.edits as Array<Record<string, string>>
        oldString = edits.map(e => e.old_string).filter(Boolean).join('\n---\n')
        newString = edits.map(e => e.new_string).filter(Boolean).join('\n---\n')
      } else {
        oldString = input.old_string as string
        newString = input.new_string as string
      }
      buf.fileChanges.push({
        filePath,
        type: changeType,
        content,
        oldString,
        newString,
        startLine,
        timestamp: new Date().toISOString(),
        toolUseId,
        status: 'pending',
      })
      // 上限 100 条，超出移除最旧的
      if (buf.fileChanges.length > 100) {
        buf.fileChanges = buf.fileChanges.slice(-100)
      }
    }
  }
  // TodoWrite/todo_write -> todos
  if (['TodoWrite', 'todo_write'].includes(toolName) && input.todos) {
    buf.todos = input.todos as ActivityTodoItem[]
  }
}

// ── 将 streamingBlocks 构造为 contentBlocks 和 fullContent ──

function buildContentFromBlocks(streamingBlocks: StreamingBlock[]): {
  contentBlocks: ContentBlock[]
  fullContent: string
} {
  const contentBlocks: ContentBlock[] = []
  let fullContent = ''
  for (const block of streamingBlocks) {
    if (block.type === 'text') {
      const trimmed = block.content.trim()
      if (trimmed && !NOISE_PATTERN.test(trimmed)) {
        contentBlocks.push({ type: 'text', content: block.content })
        fullContent += block.content
      }
    } else {
      // block.type === 'tool'
      contentBlocks.push({
        type: 'tool',
        toolUseId: block.toolUseId,
        toolName: block.toolName,
        input: block.input,
        status: block.status === 'pending' ? 'completed' : block.status,
        output: block.output,
        isError: block.isError,
      })
    }
  }
  return { contentBlocks, fullContent }
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

export function useChat(projectId: string, onSettingsRequired?: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingBlocks, setStreamingBlocks] = useState<StreamingBlock[]>([])
  const [thinkingContent, setThinkingContent] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lastStats, setLastStats] = useState<ConversationStats | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null)
  const [askQuestion, setAskQuestion] = useState<AskUserQuestionRequest | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [activityData, setActivityData] = useState<ActivityData>({ planContent: null, fileChanges: [], todos: [] })

  // 当前 projectId 的 ref，供闭包内判断
  const currentProjectIdRef = useRef(projectId)
  currentProjectIdRef.current = projectId

  // 加载历史消息
  const loadHistory = useCallback(async () => {
    if (!projectId) return
    setInitialLoading(true)
    try {
      const res = await fetch(`/api/chat/messages?limit=20&projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      // 防止切换后旧请求覆盖
      if (currentProjectIdRef.current !== projectId) return
      setMessages(data.messages || [])
      setHasMore(!!data.hasMore)
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      if (currentProjectIdRef.current === projectId) {
        setInitialLoading(false)
      }
    }
  }, [projectId])

  // 加载更多历史消息（向上翻页）
  const loadMoreMessages = useCallback(async () => {
    if (!projectId || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    try {
      const before = messages[0].id
      const res = await fetch(`/api/chat/messages?limit=20&before=${before}&projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      const older = data.messages || []
      if (older.length > 0) {
        setMessages(prev => [...older, ...prev])
      }
      setHasMore(!!data.hasMore)
    } catch (err) {
      console.error('Failed to load more messages:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [projectId, loadingMore, hasMore, messages])

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

      // 立即清空消息并标记加载中，避免显示旧项目的消息导致抖动
      setMessages([])
      setInitialLoading(true)

      // 从 buffer 恢复新项目的流状态
      const buf = getBuffer(projectId)
      setStreamingBlocks([...buf.streamingBlocks])
      setThinkingContent(buf.thinkingContent)
      setSending(buf.sending)
      setSessionId(buf.sessionId)
      setLastStats(buf.lastStats)
      setPermissionRequest(buf.permissionRequest)
      setAskQuestion(buf.askQuestion)
      setStatusText(buf.statusText)
      setActivityData({ planContent: buf.planContent, fileChanges: buf.fileChanges, todos: buf.todos })

      // 捕获 pendingMessages（流结束但用户不在该项目时产生的消息）
      const pendingMsgs = buf.pendingMessages
      buf.pendingMessages = []

      // 重新加载历史，加载完成后合并 pendingMessages（去重，避免磁盘已持久化的消息重复）
      loadHistory().then(() => {
        if (pendingMsgs.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            const deduped = pendingMsgs.filter(m => !existingIds.has(m.id))
            return deduped.length > 0 ? [...prev, ...deduped] : prev
          })
        }
      })
    }
  }, [projectId, loadHistory])

  // ---- 状态更新辅助：同时写入 React state 和 buffer，用 RAF 批处理避免高频重渲染 ----
  const rafRef = useRef<number>(0)
  const updateState = useCallback((forProjectId: string, updater: (buf: StreamBuffer) => void) => {
    const buf = getBuffer(forProjectId)
    updater(buf)

    // 只在当前显示的项目匹配时更新 React state，用 RAF 批处理
    if (currentProjectIdRef.current === forProjectId && !rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const b = getBuffer(forProjectId)
        if (currentProjectIdRef.current !== forProjectId) return
        setStreamingBlocks([...b.streamingBlocks])
        setThinkingContent(b.thinkingContent)
        setSending(b.sending)
        setSessionId(b.sessionId)
        setLastStats(b.lastStats)
        setPermissionRequest(b.permissionRequest)
        setAskQuestion(b.askQuestion)
        setStatusText(b.statusText)
        setActivityData({ planContent: b.planContent, fileChanges: [...b.fileChanges], todos: b.todos })
      })
    }
  }, [])

  // ---- 订阅渠道消息 SSE（全局，接收所有项目的渠道事件） ----
  useEffect(() => {
    const channelEvtSource = new EventSource('/api/channels/events?global=1')

    channelEvtSource.addEventListener('channel_user_message', (e) => {
      try {
        const data = JSON.parse(e.data)
        const pid = data._projectId as string
        if (data.message) {
          if (pid === projectId) {
            setMessages(prev => [...prev, data.message])
          }
          const source = data.message.source
          const sourceName = data.message.sourceName
          if (source && source !== 'web') {
            const label = sourceName || source
            sendDesktopNotification(`${label} 发来消息`, data.message.content?.slice(0, 80) || '')
          }
        }
      } catch {}
    })

    channelEvtSource.addEventListener('channel_start', (e) => {
      try {
        const data = JSON.parse(e.data)
        const pid = (data._projectId as string) || projectId
        updateState(pid, b => {
          b.sending = true
          b.streamingBlocks = []
          b.textBlockCounter = 0
        })
        setActive(pid, true)
      } catch {}
    })

    channelEvtSource.addEventListener('channel_delta', (e) => {
      try {
        const data = JSON.parse(e.data)
        const pid = (data._projectId as string) || projectId
        const content = data.content || ''
        if (!content) return
        updateState(pid, b => {
          const last = b.streamingBlocks[b.streamingBlocks.length - 1]
          if (last?.type === 'text') {
            last.content += content
          } else {
            b.streamingBlocks.push({
              type: 'text',
              id: `text_${b.textBlockCounter++}`,
              content,
            })
          }
        })
      } catch {}
    })

    channelEvtSource.addEventListener('channel_tool_use', (e) => {
      try {
        const data = JSON.parse(e.data)
        const pid = (data._projectId as string) || projectId
        const toolUseId = data.toolUseId as string
        updateState(pid, b => {
          const idx = b.streamingBlocks.findIndex(
            bl => bl.type === 'tool' && bl.toolUseId === toolUseId
          )
          if (idx >= 0) {
            const existing = b.streamingBlocks[idx]
            if (existing.type === 'tool') {
              b.streamingBlocks[idx] = { ...existing, input: data.input as Record<string, unknown> }
            }
          } else {
            b.streamingBlocks.push({
              type: 'tool',
              id: toolUseId,
              toolUseId,
              toolName: data.toolName as string,
              input: data.input as Record<string, unknown>,
              status: 'pending',
            })
          }
          extractActivityFromTool(
            data.toolName as string,
            data.input as Record<string, unknown>,
            toolUseId,
            b,
            data.startLine as number | undefined,
            data.fileExists != null ? { fileExists: data.fileExists as boolean, oldContent: data.oldContent as string | undefined } : undefined,
          )
        })
      } catch {}
    })

    channelEvtSource.addEventListener('channel_tool_result', (e) => {
      try {
        const data = JSON.parse(e.data)
        const pid = (data._projectId as string) || projectId
        const resultId = data.toolUseId as string
        updateState(pid, b => {
          const idx = b.streamingBlocks.findIndex(
            bl => bl.type === 'tool' && bl.toolUseId === resultId
          )
          if (idx >= 0) {
            const tool = b.streamingBlocks[idx]
            if (tool.type === 'tool') {
              b.streamingBlocks[idx] = {
                ...tool,
                status: data.isError ? 'error' : 'completed',
                output: data.content as string,
                isError: data.isError as boolean,
              }
            }
          }
          const fc = b.fileChanges.find(c => c.toolUseId === resultId)
          if (fc) fc.status = data.isError ? 'error' : 'completed'
        })
      } catch {}
    })

    channelEvtSource.addEventListener('channel_done', (e) => {
      try {
        const data = JSON.parse(e.data)
        const pid = (data._projectId as string) || projectId
        if (data.message) {
          if (pid === projectId) {
            setMessages(prev => [...prev, data.message])
          }
          const preview = data.message.content?.slice(0, 80) || '任务已完成'
          sendDesktopNotification('AI助理 回复完成', preview)
        }
      } catch {}
      const data2 = JSON.parse((e as MessageEvent).data)
      const pid2 = (data2._projectId as string) || projectId
      updateState(pid2, b => {
        b.sending = false
        b.streamingBlocks = []
        b.textBlockCounter = 0
      })
      setActive(pid2, false)
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

  // ── SSE 事件处理辅助：delta/tool_use/tool_result/tool_progress 的统一处理 ──

  function handleDeltaEvent(pid: string, content: string) {
    updateState(pid, b => {
      const last = b.streamingBlocks[b.streamingBlocks.length - 1]
      if (last?.type === 'text') {
        last.content += content
      } else {
        b.streamingBlocks.push({
          type: 'text',
          id: `text_${b.textBlockCounter++}`,
          content,
        })
      }
    })
  }

  function handleToolUseEvent(pid: string, data: Record<string, unknown>) {
    const toolUseId = data.toolUseId as string
    const toolName = data.toolName as string
    const input = data.input as Record<string, unknown>
    updateState(pid, b => {
      const idx = b.streamingBlocks.findIndex(
        bl => bl.type === 'tool' && bl.toolUseId === toolUseId
      )
      if (idx >= 0) {
        const existing = b.streamingBlocks[idx]
        if (existing.type === 'tool') {
          b.streamingBlocks[idx] = { ...existing, input }
        }
      } else {
        b.streamingBlocks.push({
          type: 'tool',
          id: toolUseId,
          toolUseId,
          toolName,
          input,
          status: 'pending',
        })
      }
      extractActivityFromTool(toolName, input, toolUseId, b, data.startLine as number | undefined,
        data.fileExists != null ? { fileExists: data.fileExists as boolean, oldContent: data.oldContent as string | undefined } : undefined)
    })
  }

  function handleToolResultEvent(pid: string, data: Record<string, unknown>) {
    const resultId = data.toolUseId as string
    const resultContent = data.content as string
    const isError = data.isError as boolean
    updateState(pid, b => {
      const idx = b.streamingBlocks.findIndex(
        bl => bl.type === 'tool' && bl.toolUseId === resultId
      )
      if (idx >= 0) {
        const tool = b.streamingBlocks[idx]
        if (tool.type === 'tool') {
          // AskUserQuestion 被前端拦截后 SDK 返回 isError=true，
          // 但实际是用户回答而非错误，前端不显示为错误
          const isAskQuestion = tool.toolName === 'AskUserQuestion'
          const effectiveIsError = isAskQuestion ? false : isError
          b.streamingBlocks[idx] = {
            ...tool,
            status: effectiveIsError ? 'error' : 'completed',
            output: resultContent,
            isError: effectiveIsError,
          }
        }
      }
      // 更新 fileChanges 状态
      const fc = b.fileChanges.find(c => c.toolUseId === resultId)
      if (fc) {
        const toolAtIdx = b.streamingBlocks.find(bl => bl.type === 'tool' && bl.toolUseId === resultId)
        const isAskQuestion = toolAtIdx?.type === 'tool' && toolAtIdx.toolName === 'AskUserQuestion'
        fc.status = (isAskQuestion ? false : isError) ? 'error' : 'completed'
      }
    })
  }

  function handleToolProgressEvent(pid: string, data: Record<string, unknown>) {
    const progressId = data.toolUseId as string
    const elapsed = data.elapsedSeconds as number
    updateState(pid, b => {
      const idx = b.streamingBlocks.findIndex(
        bl => bl.type === 'tool' && bl.toolUseId === progressId
      )
      if (idx >= 0) {
        const tool = b.streamingBlocks[idx]
        if (tool.type === 'tool') {
          b.streamingBlocks[idx] = { ...tool, elapsedSeconds: elapsed }
        }
      }
    })
  }

  function handleDoneEvent(
    pid: string,
    data: Record<string, unknown>,
    accContent: string,
  ) {
    const stats: ConversationStats | null = data.usage
      ? {
          costUsd: (data.costUsd as number) || 0,
          inputTokens: (data.usage as Record<string, number>).inputTokens || 0,
          outputTokens: (data.usage as Record<string, number>).outputTokens || 0,
          cachedTokens: (data.usage as Record<string, number>).cachedTokens || 0,
          model: (data.model as string) || '',
        }
      : null

    // 从 streamingBlocks 构造 contentBlocks 和 fullContent
    const buf = getBuffer(pid)
    const { contentBlocks, fullContent } = buildContentFromBlocks(buf.streamingBlocks)
    // 如果 streamingBlocks 为空，回退到 accContent 或 fullContent
    let finalContent = fullContent || accContent || (data.fullContent as string) || ''
    if (NOISE_PATTERN.test(finalContent)) finalContent = ''

    // 立即清理 buffer（同步），防止切换项目时读到旧状态
    buf.streamingBlocks = []
    buf.textBlockCounter = 0
    buf.thinkingContent = ''
    buf.lastStats = stats
    buf.sending = false
    setActive(pid, false)

    if (contentBlocks.length > 0 || (finalContent.trim() && !NOISE_PATTERN.test(finalContent))) {
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: finalContent,
        messageType: 'text',
        createdAt: new Date().toISOString(),
        stats: stats || undefined,
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      }
      // 窗口隐藏时推送桌面通知
      const preview = finalContent.slice(0, 80) || '任务已完成'
      sendDesktopNotification('AI助理 回复完成', preview)
      // 不再推入 pendingMessages：后端已持久化，切换回来时 loadHistory 会取到
      // 延迟一帧更新 React state，确保流式内容先渲染出来
      requestAnimationFrame(() => {
        if (currentProjectIdRef.current === pid) {
          setMessages(prev => [...prev, assistantMsg])
          // 同步 React 状态
          setStreamingBlocks([])
          setThinkingContent('')
          setSending(false)
          setLastStats(stats)
        }
      })
    } else {
      // 无内容，直接同步 React state
      if (currentProjectIdRef.current === pid) {
        setStreamingBlocks([])
        setThinkingContent('')
        setSending(false)
        setLastStats(stats)
      }
    }
  }

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
      buf.streamingBlocks = []
      buf.textBlockCounter = 0
      buf.thinkingContent = ''
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

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`
        let errorCode = ''
        try {
          const errData = JSON.parse(await res.text())
          errorMsg = errData.error || errorMsg
          errorCode = errData.code || ''
        } catch {}

        if (errorCode === 'NO_API_KEY') {
          const sysMsg: ChatMessage = {
            id: `msg_${Date.now()}_system`,
            role: 'system',
            content: errorMsg,
            messageType: 'text',
            createdAt: new Date().toISOString(),
          }
          setMessages(prev => [...prev, sysMsg])
          onSettingsRequired?.()
          return
        }

        throw new Error(errorMsg)
      }

      if (!res.body) {
        throw new Error('No response body')
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

            case 'delta': {
              const content = data.content as string
              accContent += content
              if (!NOISE_PATTERN.test(accContent)) {
                handleDeltaEvent(sendProjectId, content)
              }
              break
            }

            case 'thinking':
              updateState(sendProjectId, b => {
                b.thinkingContent += (data.content as string)
              })
              break

            case 'tool_use':
              handleToolUseEvent(sendProjectId, data)
              break

            case 'tool_result':
              handleToolResultEvent(sendProjectId, data)
              break

            case 'tool_progress':
              handleToolProgressEvent(sendProjectId, data)
              break

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

            case 'done':
              handleDoneEvent(sendProjectId, data, accContent)
              break

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
      // 同步清理 buffer（防止切换项目时读到旧状态）
      const b = getBuffer(sendProjectId)
      b.sending = false
      b.streamingBlocks = []
      delete (b as StreamBuffer & { _controller?: AbortController })._controller
      setActive(sendProjectId, false)
      // 延迟一帧同步 React state，确保流式内容先渲染出来
      requestAnimationFrame(() => {
        if (currentProjectIdRef.current === sendProjectId) {
          setSending(false)
          setStreamingBlocks([])
        }
      })
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
      b.streamingBlocks = []
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

  // 会话上下文统计
  const sessionStats = useMemo(() => {
    // 从最近一条带 stats 的消息获取当前上下文信息
    const lastMsgWithStats = [...messages].reverse().find(m => m.stats)
    const stats = lastMsgWithStats?.stats || lastStats
    const inputTokens = stats?.inputTokens || 0
    const outputTokens = stats?.outputTokens || 0
    const cachedTokens = stats?.cachedTokens || 0
    const costUsd = stats?.costUsd || 0
    const model = stats?.model || ''
    // 根据模型推断最大上下文窗口
    let maxContext = 200_000
    if (model.includes('haiku')) maxContext = 200_000
    else if (model.includes('opus')) maxContext = 200_000
    else if (model.includes('sonnet')) maxContext = 200_000
    const contextUsage = maxContext > 0 ? Math.min(inputTokens / maxContext, 1) : 0
    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      costUsd,
      model,
      maxContext,
      contextUsage,
      messageCount: messages.length,
    }
  }, [messages, lastStats])

  // 清空对话
  const clearChat = useCallback(async () => {
    try {
      await fetch(`/api/chat/messages?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      setMessages([])
      setSessionId(null)
      setStreamingBlocks([])
      setLastStats(null)
    } catch (err) {
      console.error('Failed to clear chat:', err)
    }
  }, [projectId])

  // 更新单条消息（标签/收藏操作后）
  const updateMessage = useCallback((updated: ChatMessage) => {
    setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
  }, [])

  /** 添加本地消息（不经过 API，仅前端状态） */
  const addLocalMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  /**
   * 转发消息到子项目：调用 relay API 并读取 SSE 流
   * 子项目的 StreamBuffer 会被更新，切换过去时能看到实时执行效果
   */
  const sendToProject = useCallback(async (
    targetProjectId: string,
    message: string,
    fromProjectName?: string,
    fromProjectId?: string,
  ) => {
    const targetBuf = getBuffer(targetProjectId)
    if (targetBuf.sending) return

    // 初始化目标项目的 buffer
    updateState(targetProjectId, buf => {
      buf.sending = true
      buf.streamingBlocks = []
      buf.textBlockCounter = 0
      buf.thinkingContent = ''
      buf.lastStats = null
      buf.permissionRequest = null
      buf.askQuestion = null
      buf.pendingMessages = []
      buf.statusText = null
    })
    setActive(targetProjectId, true)

    const controller = new AbortController()
    ;(getBuffer(targetProjectId) as StreamBuffer & { _controller?: AbortController })._controller = controller

    try {
      const res = await fetch('/api/chat/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toProjectId: targetProjectId,
          message,
          fromProjectName,
          fromProjectId,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let accContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })

        const parts = sseBuffer.split('\n\n')
        sseBuffer = parts.pop() || ''

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
              updateState(targetProjectId, b => { b.sessionId = data.sessionId as string })
              break

            case 'delta': {
              const content = data.content as string
              accContent += content
              if (!NOISE_PATTERN.test(accContent)) {
                handleDeltaEvent(targetProjectId, content)
              }
              break
            }

            case 'thinking':
              updateState(targetProjectId, b => {
                b.thinkingContent += (data.content as string)
              })
              break

            case 'tool_use':
              handleToolUseEvent(targetProjectId, data)
              break

            case 'tool_result':
              handleToolResultEvent(targetProjectId, data)
              break

            case 'tool_progress':
              handleToolProgressEvent(targetProjectId, data)
              break

            case 'status':
              updateState(targetProjectId, b => {
                b.statusText = (data.status as string) || null
              })
              break

            case 'done':
              handleDoneEvent(targetProjectId, data, accContent)
              break

            case 'error': {
              const errorMsg: ChatMessage = {
                id: `msg_${Date.now()}_system`,
                role: 'system',
                content: data.message as string,
                messageType: 'text',
                createdAt: new Date().toISOString(),
              }
              if (currentProjectIdRef.current === targetProjectId) {
                setMessages(prev => [...prev, errorMsg])
              } else {
                getBuffer(targetProjectId).pendingMessages.push(errorMsg)
              }
              break
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[Relay] Error:', err)
      }
    } finally {
      const b = getBuffer(targetProjectId)
      b.sending = false
      b.streamingBlocks = []
      delete (b as StreamBuffer & { _controller?: AbortController })._controller
      setActive(targetProjectId, false)
      requestAnimationFrame(() => {
        if (currentProjectIdRef.current === targetProjectId) {
          setSending(false)
          setStreamingBlocks([])
        }
      })
    }
  }, [updateState])

  return {
    messages,
    initialLoading,
    streamingBlocks,
    thinkingContent,
    sending,
    sessionId,
    lastStats,
    permissionRequest,
    askQuestion,
    statusText,
    activityData,
    sessionStats,
    sendMessage,
    abortChat,
    clearChat,
    loadHistory,
    hasMore,
    loadMoreMessages,
    respondPermission,
    respondAskQuestion,
    updateMessage,
    addLocalMessage,
    sendToProject,
  }
}
