/**
 * 微信 ClawBot 扫码登录 API
 * POST /api/channels/webhook/wechat/login
 * body: { action: 'start' | 'poll' | 'save', ... }
 */

import { NextRequest } from 'next/server'
import { getLoginQRCode, pollLoginStatus } from '@/lib/channels/wechat'
import { updateChannel, getChannels } from '@/lib/store/channels'
import { wechatPoller } from '@/lib/channels/wechat-poller'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body

  switch (action) {
    case 'start': {
      try {
        const result = await getLoginQRCode()
        return Response.json(result)
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : '获取 QR 码失败' },
          { status: 500 }
        )
      }
    }

    case 'poll': {
      const { qrcode } = body
      if (!qrcode) {
        return Response.json({ error: 'qrcode required' }, { status: 400 })
      }
      try {
        const result = await pollLoginStatus(qrcode)
        return Response.json(result)
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : '轮询失败' },
          { status: 500 }
        )
      }
    }

    case 'save': {
      const { botToken, accountId, projectId, channelId } = body
      if (!botToken || !projectId || !channelId) {
        return Response.json({ error: 'botToken, projectId, channelId required' }, { status: 400 })
      }

      try {
        // 保存 botToken 到渠道配置
        const result = updateChannel(projectId, channelId, {
          wechat: { botToken, accountId: accountId || '' },
        })
        if (!result) {
          return Response.json({ error: 'channel not found' }, { status: 404 })
        }

        // 重新读取完整渠道配置，启动长轮询
        const channels = getChannels(projectId)
        const channel = channels.find(c => c.id === channelId)
        if (channel) {
          await wechatPoller.connect(projectId, channel)
        }

        return Response.json({ success: true })
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : '保存失败' },
          { status: 500 }
        )
      }
    }

    default:
      return Response.json({ error: `unknown action: ${action}` }, { status: 400 })
  }
}
