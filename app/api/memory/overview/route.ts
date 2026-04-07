/**
 * GET /api/memory/overview
 * 获取用户记忆总纲
 */

import { NextRequest } from 'next/server'
import { getOverviewForInjection } from '@/lib/memory/injection'
import { generateAndSaveOverview } from '@/lib/memory/overview-generator'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  const refresh = url.searchParams.get('refresh') === 'true'

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    let content: string

    if (refresh) {
      content = generateAndSaveOverview(userId)
    } else {
      content = getOverviewForInjection(userId)
    }

    return Response.json({ success: true, content })
  } catch (err) {
    console.error('[Memory] Overview error:', err)
    return Response.json({ error: 'Failed to get overview' }, { status: 500 })
  }
}
