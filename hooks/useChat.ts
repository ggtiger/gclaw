'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage, ToolCallItem, ToolSummary, ConversationStats } from '@/types/chat'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [toolSummary, setToolSummary] = useState<ToolSummary | null>(null)
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lastStats, setLastStats] = useState<ConversationStats | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [initialized, setInitialized] = useState(false)

  // 加载历史消息
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/messages?limit=100')
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }, [])

  useEffect(() => {
    if (!initialized) {
      loadHistory()
      setInitialized(true)
    }
  }, [initialized, loadHistory])

  // 发送消息
  const sendMessage = useCallback(async (text: string) => {
    if (sending || !text.trim()) return

    // 添加用户消息到本地状态
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: text.trim(),
      messageType: 'text',
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setSending(true)
    setStreamingContent('')
    setToolSummary(null)
    setLastStats(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
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

        // 按 \n\n 分割 SSE 事件
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (!part.trim()) continue

          let eventType = ''
          let eventData = ''

          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7)
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6)
            }
          }

          if (!eventType || !eventData) continue

          let data: Record<string, unknown>
          try {
            data = JSON.parse(eventData)
          } catch {
            continue
          }

          switch (eventType) {
            case 'init':
              setSessionId(data.sessionId as string)
              break

            case 'delta':
              accContent += data.content as string
              setStreamingContent(accContent)
              break

            case 'tool_use': {
              const tool: ToolCallItem = {
                toolUseId: data.toolUseId as string,
                toolName: data.toolName as string,
                input: data.input as Record<string, unknown>,
                status: 'pending',
              }
              setToolSummary(prev => ({
                pendingTools: [...(prev?.pendingTools || []), tool],
                completedTools: prev?.completedTools || [],
              }))
              break
            }

            case 'tool_result': {
              const resultId = data.toolUseId as string
              const resultContent = data.content as string
              const isError = data.isError as boolean
              setToolSummary(prev => {
                if (!prev) return null
                const pending = prev.pendingTools.filter(t => t.toolUseId !== resultId)
                const completedTool = prev.pendingTools.find(t => t.toolUseId === resultId)
                const completed = [
                  ...prev.completedTools,
                  ...(completedTool
                    ? [{ ...completedTool, status: isError ? 'error' as const : 'completed' as const, output: resultContent, isError }]
                    : []),
                ]
                return { pendingTools: pending, completedTools: completed }
              })
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

              const assistantMsg: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: 'assistant',
                content: accContent || (data.fullContent as string) || '',
                messageType: 'text',
                createdAt: new Date().toISOString(),
                stats: stats || undefined,
              }
              setMessages(prev => [...prev, assistantMsg])
              setStreamingContent('')
              setLastStats(stats)
              break
            }

            case 'error':
              console.error('Stream error:', data.message)
              // 添加错误消息
              setMessages(prev => [
                ...prev,
                {
                  id: `msg_${Date.now()}_system`,
                  role: 'system',
                  content: data.message as string,
                  messageType: 'text',
                  createdAt: new Date().toISOString(),
                },
              ])
              break

            case 'end':
              break
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Chat error:', err)
        setMessages(prev => [
          ...prev,
          {
            id: `msg_${Date.now()}_system`,
            role: 'system',
            content: `发送失败: ${err}`,
            messageType: 'text',
            createdAt: new Date().toISOString(),
          },
        ])
      }
    } finally {
      setSending(false)
      setStreamingContent('')
      abortControllerRef.current = null
    }
  }, [sending])

  // 中止
  const abortChat = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    try {
      await fetch('/api/chat/abort', { method: 'POST' })
    } catch {}
    setSending(false)
    setStreamingContent('')
  }, [])

  // 清空对话
  const clearChat = useCallback(async () => {
    try {
      await fetch('/api/chat/messages', { method: 'DELETE' })
      setMessages([])
      setSessionId(null)
      setToolSummary(null)
      setLastStats(null)
    } catch (err) {
      console.error('Failed to clear chat:', err)
    }
  }, [])

  return {
    messages,
    streamingContent,
    toolSummary,
    sending,
    sessionId,
    lastStats,
    sendMessage,
    abortChat,
    clearChat,
    loadHistory,
  }
}
