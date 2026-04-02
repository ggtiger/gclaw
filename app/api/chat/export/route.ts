import { NextRequest } from 'next/server'
import { getMessages } from '@/lib/store/messages'
import type { ChatMessage } from '@/types/chat'

export const dynamic = 'force-dynamic'

/** 导出对话为 Markdown 或 JSON */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const format = searchParams.get('format') || 'markdown'
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!projectId) {
    return Response.json({ error: '缺少 projectId' }, { status: 400 })
  }

  // 获取所有消息（不限制 limit）
  const { messages } = getMessages(projectId, Number.MAX_SAFE_INTEGER)

  let filtered: ChatMessage[] = messages

  // 时间范围过滤
  if (from || to) {
    const fromMs = from ? new Date(from).getTime() : 0
    const toMs = to ? new Date(to).getTime() : Infinity
    filtered = filtered.filter(m => {
      const t = new Date(m.createdAt).getTime()
      return t >= fromMs && t <= toMs
    })
  }

  const projectName = projectId
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${projectName}_${date}`

  if (format === 'json') {
    const data = filtered.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      tags: m.tags,
      isStarred: m.isStarred,
      stats: m.stats,
    }))
    return new Response(JSON.stringify({ projectName, exportedAt: new Date().toISOString(), messages: data }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}.json"`,
      },
    })
  }

  // Markdown 格式
  const lines: string[] = [
    `# ${projectName} 对话导出`,
    '',
    `> 导出时间: ${new Date().toISOString()}`,
    `> 消息数量: ${filtered.length}`,
    '',
    '---',
    '',
  ]

  for (const msg of filtered) {
    const time = new Date(msg.createdAt).toLocaleString('zh-CN')
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'Claude' : '系统'
    lines.push(`## ${role} (${time})`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')
    if (msg.stats) {
      lines.push(`> 模型: ${msg.stats.model} | 输入: ${msg.stats.inputTokens} | 输出: ${msg.stats.outputTokens}${msg.stats.costUsd > 0 ? ` | 费用: $${msg.stats.costUsd.toFixed(4)}` : ''}`)
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.md"`,
    },
  })
}

