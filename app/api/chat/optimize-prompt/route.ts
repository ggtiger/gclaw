import { NextRequest } from 'next/server'
import { getGlobalSettings } from '@/lib/store/settings'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { prompt } = await request.json()

  if (!prompt || typeof prompt !== 'string') {
    return Response.json({ error: 'prompt is required' }, { status: 400 })
  }

  const settings = getGlobalSettings()
  const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: '未配置 API Key' }, { status: 500 })
  }

  const baseUrl = settings.apiBaseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250414',
        max_tokens: 1024,
        system: `你是一个提示词优化助手。用户给你一段输入文本，你需要将其优化为更清晰、更具体、更有效的 AI 提示词。

优化原则：
- 保持用户的原始意图不变
- 增加必要的上下文和约束条件
- 使指令更加明确和具体
- 如果用户用中文写，优化后也用中文
- 只返回优化后的提示词文本，不要加任何解释或前缀`,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[OptimizePrompt] API error:', resp.status, errText)
      return Response.json({ error: '优化失败' }, { status: 500 })
    }

    const result = await resp.json()
    const optimized = result.content?.[0]?.text?.trim() || prompt
    return Response.json({ optimized })
  } catch (err) {
    console.error('[OptimizePrompt] Error:', err)
    return Response.json({ error: '优化失败' }, { status: 500 })
  }
}
