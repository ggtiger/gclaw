/**
 * POST /api/memory/verify/[id]
 * 标记记忆条目为已验证
 */

import { NextRequest } from 'next/server'
import type { SemanticEntry, ProceduralEntry } from '@/types/memory'
import { updateSemantic } from '@/lib/memory/semantic-manager'
import { updateProcedural } from '@/lib/memory/procedural-manager'
import { refreshOverviewAsync } from '@/lib/memory/injection'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as {
    userId: string
    level: 'semantic' | 'procedural'
    projectId?: string
  }

  if (!body.userId || !body.level) {
    return Response.json({ error: 'userId and level are required' }, { status: 400 })
  }

  try {
    let result: SemanticEntry | ProceduralEntry | null = null

    if (body.level === 'semantic') {
      result = updateSemantic(body.userId, id, {
        lastVerifiedAt: new Date().toISOString(),
      }, body.projectId)
    } else if (body.level === 'procedural') {
      result = updateProcedural(body.userId, id, {
        verification: 'verified',
      }, body.projectId)
    }

    if (!result) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    refreshOverviewAsync(body.userId).catch(err => console.warn('[Memory] Overview refresh failed:', err))

    return Response.json({ success: true, entry: result })
  } catch (err) {
    console.error('[Memory] Verify error:', err)
    return Response.json({ error: 'Failed to verify entry' }, { status: 500 })
  }
}
