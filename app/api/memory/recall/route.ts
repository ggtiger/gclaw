/**
 * POST /api/memory/recall
 * 检索记忆（统一入口，使用带评分排序的检索引擎）
 */

import { NextRequest } from 'next/server'
import type { RecallRequest } from '@/types/memory'
import { retrieve } from '@/lib/memory/retrieval'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json() as RecallRequest

  if (!body.userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    const result = retrieve({
      userId: body.userId,
      projectId: body.projectId,
      query: body.query,
      level: body.level,
      scope: body.scope,
      tags: body.tags,
      limit: body.limit,
    })

    return Response.json({ success: true, result })
  } catch (err) {
    console.error('[Memory] Recall error:', err)
    return Response.json({ error: 'Failed to recall memory' }, { status: 500 })
  }
}
