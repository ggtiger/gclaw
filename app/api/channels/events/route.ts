/**
 * 渠道消息 SSE 推送端点
 * 前端通过 EventSource 订阅，实时接收渠道消息和 Agent 回复
 */

import { NextRequest } from 'next/server'
import { channelEventBus } from '@/lib/channels/channel-events'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId') || ''

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 发送初始连接成功事件
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ projectId })}\n\n`))

      // 心跳保活（每 30 秒）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      // 订阅渠道事件
      const unsubscribe = channelEventBus.subscribe(projectId, (event) => {
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
