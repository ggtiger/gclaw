/**
 * POST /api/memory/consolidate
 * 触发记忆巩固
 */

import { NextRequest } from 'next/server'
import { runConsolidation } from '@/lib/memory/consolidation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    userId: string
    projectId?: string
  }

  if (!body.userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    const result = runConsolidation(body.userId, body.projectId)
    return Response.json({ success: true, result })
  } catch (err) {
    console.error('[Memory] Consolidate error:', err)
    return Response.json({ error: 'Failed to consolidate memory' }, { status: 500 })
  }
}
