import { NextRequest } from 'next/server'
import { executeChat } from '@/lib/claude/process-manager'
import { gclawEventBus } from '@/lib/claude/gclaw-events'
import { addMessage } from '@/lib/store/messages'
import { assertValidProjectId } from '@/lib/store/projects'
import type { ChatMessage, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { message, projectId = '' } = body

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 安全校验：验证 projectId 格式
  try {
    assertValidProjectId(projectId)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 持久化用户消息
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_user`,
    role: 'user',
    content: message,
    messageType: 'text',
    createdAt: new Date().toISOString(),
  }
  addMessage(projectId, userMsg)

  // 创建 SSE 流
  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      // 权限请求回调：直接通过 SSE 推送到前端
      const onPermissionRequest = (req: PermissionRequest) => {
        const sseData = `event: permission_request\ndata: ${JSON.stringify(req)}\n\n`
        controller.enqueue(encoder.encode(sseData))
      }

      // AskUserQuestion 回调：通过 SSE 推送问题到前端
      const onAskUserQuestion = (req: AskUserQuestionRequest) => {
        const sseData = `event: ask_user_question\ndata: ${JSON.stringify(req)}\n\n`
        controller.enqueue(encoder.encode(sseData))
      }

      // 订阅 GClaw 事件总线：将技能通知转发为 SSE
      const unsubscribe = gclawEventBus.subscribe(projectId, (event) => {
        try {
          const sseData = `event: skill_notify\ndata: ${JSON.stringify({
            type: event.type,
            source: event.source,
            message: event.data.message || '',
            data: event.data,
            timestamp: event.timestamp,
          })}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch {
          // controller 可能已关闭
        }
      })

      try {
        for await (const event of executeChat(message, { projectId, onAskUserQuestion }, onPermissionRequest)) {
          // 累积完整内容
          if (event.event === 'delta' && typeof event.data.content === 'string') {
            fullContent += event.data.content
          }

          // done 时持久化 AI 回复（仅当有文本内容时）
          if (event.event === 'done' && fullContent.trim()) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_assistant`,
              role: 'assistant',
              content: fullContent,
              messageType: 'text',
              createdAt: new Date().toISOString(),
              stats: event.data.usage
                ? {
                    costUsd: (event.data.costUsd as number) || 0,
                    inputTokens: (event.data.usage as Record<string, number>).inputTokens || 0,
                    outputTokens: (event.data.usage as Record<string, number>).outputTokens || 0,
                    cachedTokens: (event.data.usage as Record<string, number>).cachedTokens || 0,
                    model: (event.data.model as string) || '',
                  }
                : undefined,
            }
            addMessage(projectId, assistantMsg)
          }

          const sseData = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        }
      } catch (err) {
        const errorData = `event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`
        controller.enqueue(encoder.encode(errorData))
        const endData = `event: end\ndata: {}\n\n`
        controller.enqueue(encoder.encode(endData))
      } finally {
        unsubscribe()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
