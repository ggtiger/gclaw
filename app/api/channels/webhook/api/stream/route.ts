/**
 * API 渠道 - SSE 流端点
 * GET /api/channels/webhook/api/stream
 * 认证后建立 SSE 长连接，推送 done/error 事件
 */

import { NextRequest } from 'next/server'
import { authenticateApiChannel } from '@/lib/channels/api-service'
import { apiEventBus } from '@/lib/channels/api-events'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // 认证
  const authHeader = request.headers.get('authorization')
  const result = authenticateApiChannel(authHeader)
  if (!result) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel } = result
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 发送连接成功事件
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ channelId: channel.id })}\n\n`))

      // 心跳保活（每 30 秒）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      // 订阅 API 事件（按 channelId 精确推送）
      const unsubscribe = apiEventBus.subscribe(channel.id, (event) => {
        try {
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch {
          // 连接已关闭
        }
      })

      // 客户端断开时清理
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
