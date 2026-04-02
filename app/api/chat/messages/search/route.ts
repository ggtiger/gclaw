import { NextRequest } from 'next/server'
import { searchMessages } from '@/lib/store/messages'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const keyword = searchParams.get('keyword') || ''

  if (!keyword) {
    return Response.json({ results: [], total: 0 })
  }

  const roleParam = searchParams.get('role')
  const timeRange = searchParams.get('timeRange') as 'today' | '7d' | '30d' | 'all' | null
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  const results = searchMessages(projectId, {
    keyword,
    role: (roleParam as 'user' | 'assistant' | 'system') || undefined,
    timeRange: timeRange || 'all',
    limit,
  })

  return Response.json({ results, total: results.length })
}
