import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'
import { callLLM } from '@/lib/llm'

export const dynamic = 'force-dynamic'

/**
 * POST /api/llm
 * 轻量 LLM 调用，不经过 chat stream，不污染会话。
 *
 * Body: { system: string, user: string, maxTokens?: number, projectId?: string }
 * Response: { text: string | null }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { system, user: userPrompt, maxTokens, projectId } = await request.json()
  if (!system || !userPrompt) {
    return NextResponse.json({ error: '缺少 system 或 user 参数' }, { status: 400 })
  }

  const text = await callLLM({ system, user: userPrompt, maxTokens, projectId })
  return NextResponse.json({ text })
}
