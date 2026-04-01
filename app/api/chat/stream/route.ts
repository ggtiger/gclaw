import { NextRequest } from 'next/server'
import { executeChat } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import type { ChatMessage } from '@/types/chat'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { message } = body

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
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
  addMessage(userMsg)

  // 创建 SSE 流
  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of executeChat(message)) {
          // 累积完整内容
          if (event.event === 'delta' && typeof event.data.content === 'string') {
            fullContent += event.data.content
          }

          // done 时持久化 AI 回复
          if (event.event === 'done') {
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
            addMessage(assistantMsg)
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
