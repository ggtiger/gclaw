/**
 * POST /api/chat/messages/feedback
 * 设置消息反馈（点赞/踩）并记录到记忆系统
 *
 * 记忆记录策略（反馈驱动）：
 * - 点赞 → 提取用户消息中的偏好/需求，记为正向记忆
 * - 踩   → 提取用户消息 + AI 回复的差异，记为反向/纠偏记忆
 * - 使用 LLM 提取有意义的语义内容，而非记录泛泛的"用户点了赞"
 */

import { NextRequest } from 'next/server'
import { setFeedback, getMessages, getMessageById } from '@/lib/store/messages'
import { extractWithLLM } from '@/lib/memory/llm-extractor'
import { writeEpisodic } from '@/lib/memory/episodic-writer'
import { runConsolidation } from '@/lib/memory/consolidation'

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

/**
 * 找到给定 assistant 消息之前的最近一条 user 消息
 */
function findPrecedingUserMessage(projectId: string, assistantMessageId: string): string {
  const { messages } = getMessages(projectId, 100)
  const idx = messages.findIndex(m => m.id === assistantMessageId)
  if (idx < 0) return ''
  // 从当前消息往前找第一条 user 消息
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content || ''
    }
  }
  return ''
}

/**
 * 从用户消息中提取有意义的标签
 */
function extractTags(text: string): string[] {
  const tags: string[] = []
  const techPatterns = /\b(?:React|Vue|Next\.?js|Node|Java|Python|Go|Rust|TypeScript|TS|Docker|K8s|Redis|MySQL|PostgreSQL|MongoDB|Tailwind|CSS|HTML|API|SDK|Git|CI|CD|Webpack|Vite|Tauri|Electron)\b/gi
  const matches = text.match(techPatterns)
  if (matches) {
    tags.push(...[...new Set(matches.map(m => m.toLowerCase()))].slice(0, 3))
  }
  const cnWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || []
  const stopWords = new Set(['不要', '使用', '可以', '需要', '应该', '已经', '这个', '那个', '什么', '怎么', '如何', '为什么', '帮我', '请问', '一下', '一些', '我们', '你们', '他们', '现在', '之前', '之后', '时候'])
  const meaningful = cnWords.filter(w => !stopWords.has(w))
  if (meaningful.length > 0) {
    tags.push(...meaningful.slice(0, 2))
  }
  return tags
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

    // 2. 反馈驱动的记忆记录
    const userId = getUserId()
    const isLike = feedback === 'like'

    // 获取用户原始消息和 AI 回复
    const userMsg = findPrecedingUserMessage(projectId, messageId)
    const aiReply = content || updatedMessage.content || ''
    const tags = extractTags(userMsg)

    // 异步写入记忆，不阻塞主流程
    ;(async () => {
      try {
        // 尝试 LLM 提取（带反馈信号引导）
        let entries = await extractFeedbackMemory(userMsg, aiReply, isLike, projectId, tags)

        if (entries.length === 0) {
          // LLM 没有提取到有意义的内容，用简洁的降级方案
          entries = [{
            projectId,
            type: isLike ? 'preference' : 'correction',
            summary: userMsg.slice(0, 150) || (isLike ? '用户对回复表示认可' : '用户对回复不满意'),
            detail: isLike
              ? `用户认可了以下回复的内容。用户提问: ${userMsg.slice(0, 100)}`
              : `用户对以下回复不满意。用户提问: ${userMsg.slice(0, 100)}`,
            tags: ['feedback', feedback, ...tags],
            source: 'user',
          }]
        }

        for (const entry of entries) {
          writeEpisodic(userId, entry)
          console.log(`[Feedback] Memory recorded: type=${entry.type} feedback=${feedback} summary="${entry.summary.slice(0, 60)}"`)
        }

        // 触发巩固（情节 → 语义/程序）+ 刷新总纲
        const result = runConsolidation(userId, projectId)
        if (result.semanticCreated > 0 || result.proceduralCreated > 0) {
          const { refreshOverviewAsync } = await import('@/lib/memory/injection')
          await refreshOverviewAsync(userId)
          console.log(`[Feedback] Consolidated: +${result.semanticCreated} semantic, +${result.proceduralCreated} procedural`)
        }
      } catch (memErr) {
        console.warn('[Feedback] Memory record error:', memErr)
      }
    })()

    return Response.json({ success: true, message: updatedMessage })
  } catch (err) {
    console.error('[Feedback] Error:', err)
    return Response.json({ error: 'Failed to set feedback' }, { status: 500 })
  }
}

/**
 * 使用 LLM 从反馈上下文中提取有意义的记忆
 * 与通用提取不同，这里带反馈信号（正向/反向），引导 LLM 提取更有价值的语义
 */
async function extractFeedbackMemory(
  userMessage: string,
  aiReply: string,
  isLike: boolean,
  projectId: string,
  fallbackTags: string[]
): Promise<Array<Omit<import('@/types/memory').EpisodicEntry, 'id' | 'timestamp'>>> {
  if (!userMessage && !aiReply) return []

  const truncatedUser = userMessage.slice(0, 500)
  const truncatedReply = aiReply.slice(0, 800)

  // 尝试复用 extractWithLLM，但带上反馈信号
  const entries = await extractWithLLM(
    truncatedUser,
    truncatedReply,
    projectId
  )

  if (!entries || entries.length === 0) return []

  // 根据反馈信号调整类型
  return entries.map(entry => ({
    ...entry,
    type: isLike ? 'preference' : 'correction',
    tags: ['feedback', isLike ? 'like' : 'dislike', ...(entry.tags || [])],
    source: 'user' as const,
  }))
}
