import { NextRequest } from 'next/server'
import { executeChat } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import { getProjectById, assertValidProjectId } from '@/lib/store/projects'
import { gclawEventBus } from '@/lib/claude/gclaw-events'
import type { ChatMessage, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/relay
 * 跨项目消息转发：秘书项目 @子项目 时，将消息转发到子项目并返回 SSE 流
 * 前端可以读取此流来实时显示子项目的执行状态
 *
 * Body: { toProjectId, message, fromProjectName, fromProjectId }
 * Response: SSE stream (同 /api/chat/stream 格式)
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { toProjectId, message, fromProjectName, fromProjectId }: {
    toProjectId: string
    message: string
    fromProjectName?: string
    fromProjectId?: string
  } = body

  if (!toProjectId || !message || typeof message !== 'string') {
    return Response.json({ error: 'toProjectId and message are required' }, { status: 400 })
  }

  try {
    assertValidProjectId(toProjectId)
  } catch {
    return Response.json({ error: 'Invalid toProjectId' }, { status: 400 })
  }

  const targetProject = getProjectById(toProjectId)
  if (!targetProject) {
    return Response.json({ error: 'Target project not found' }, { status: 404 })
  }

  const prefix = fromProjectName ? `[来自 ${fromProjectName}] ` : '[转发消息] '
  const relayMessage = prefix + message.trim()

  // 保存用户消息到子项目
  addMessage(toProjectId, {
    id: `msg_${Date.now()}_relay_user`,
    role: 'user',
    content: relayMessage,
    messageType: 'text',
    createdAt: new Date().toISOString(),
  })

  // 保存调度记录到秘书项目
  if (fromProjectId) {
    try {
      assertValidProjectId(fromProjectId)
      addMessage(fromProjectId, {
        id: `msg_${Date.now()}_relay_dispatch_user`,
        role: 'user',
        content: message.trim(),
        messageType: 'text',
        createdAt: new Date().toISOString(),
      })
      addMessage(fromProjectId, {
        id: `msg_${Date.now()}_relay_dispatch_sys`,
        role: 'system',
        content: `已转发到「${targetProject.name}」`,
        messageType: 'text',
        createdAt: new Date().toISOString(),
      })
    } catch {
      // fromProjectId 无效则忽略
    }
  }

  // 返回 SSE 流（同 /api/chat/stream 格式）
  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      const onPermissionRequest = (req: PermissionRequest) => {
        const sseData = `event: permission_request\ndata: ${JSON.stringify(req)}\n\n`
        controller.enqueue(encoder.encode(sseData))
      }

      const onAskUserQuestion = (req: AskUserQuestionRequest) => {
        const sseData = `event: ask_user_question\ndata: ${JSON.stringify(req)}\n\n`
        controller.enqueue(encoder.encode(sseData))
      }

      const unsubscribe = gclawEventBus.subscribe(toProjectId, (event) => {
        try {
          const sseData = `event: skill_notify\ndata: ${JSON.stringify({
            type: event.type,
            source: event.source,
            message: event.data.message || '',
            data: event.data,
            timestamp: event.timestamp,
          })}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch { /* controller 可能已关闭 */ }
      })

      try {
        for await (const event of executeChat(relayMessage, {
          projectId: toProjectId,
          dangerouslySkipPermissions: true,
          onAskUserQuestion,
        }, onPermissionRequest)) {
          if (event.event === 'delta' && typeof event.data.content === 'string') {
            fullContent += event.data.content
          }

          if (event.event === 'done' && fullContent.trim()) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_relay_assistant`,
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
            addMessage(toProjectId, assistantMsg)
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
