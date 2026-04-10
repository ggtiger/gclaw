/**
 * POST /api/chat/messages/feedback
 * 设置消息反馈（点赞/踩）并记录到记忆系统
 */

import { NextRequest } from 'next/server'
import { setFeedback } from '@/lib/store/messages'

// 获取全局设置中的用户ID
function getUserId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const globalSettings = require('@/lib/store/settings').getGlobalSettings()
    return globalSettings.userId || 'default'
  } catch {
    return 'default'
  }
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  const body = await request.json()
  const { messageId, feedback, content } = body

  if (!messageId || !feedback) {
    return Response.json({ error: 'messageId and feedback are required' }, { status: 400 })
  }

  if (feedback !== 'like' && feedback !== 'dislike') {
    return Response.json({ error: 'feedback must be "like" or "dislike"' }, { status: 400 })
  }

  try {
    // 1. 保存反馈到消息记录
    const updatedMessage = setFeedback(projectId, messageId, feedback)

    if (!updatedMessage) {
      return Response.json({ error: 'Message not found' }, { status: 404 })
    }

    // 2. 写入记忆系统（用户偏好）
    const userId = getUserId()
    const feedbackText = feedback === 'like' ? '点赞' : '踩'
    const contentPreview = content ? content.slice(0, 100) : ''

    try {
      // 内部调用记忆 API
      const memoryBody = {
        level: 'episodic',
        userId,
        projectId,
        type: 'preference',
        summary: `用户对AI回复进行了${feedbackText}反馈`,
        detail: `消息ID: ${messageId}\n反馈类型: ${feedbackText}\n回复内容预览: ${contentPreview}`,
        tags: ['feedback', feedback],
        source: 'user',
      }

      // 异步写入记忆，不阻塞主流程
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/memory/remember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memoryBody),
      }).catch(err => console.warn('[Feedback] Memory write failed:', err))
    } catch (memErr) {
      console.warn('[Feedback] Memory write error:', memErr)
    }

    return Response.json({ success: true, message: updatedMessage })
  } catch (err) {
    console.error('[Feedback] Error:', err)
    return Response.json({ error: 'Failed to set feedback' }, { status: 500 })
  }
}