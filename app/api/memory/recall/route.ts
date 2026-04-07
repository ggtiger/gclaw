/**
 * POST /api/memory/recall
 * 检索记忆（统一入口）
 */

import { NextRequest } from 'next/server'
import type { RecallRequest, RecallResult, EpisodicEntry } from '@/types/memory'
import { store } from '@/lib/memory/store'
import { searchSemantic } from '@/lib/memory/semantic-manager'
import { searchProcedural } from '@/lib/memory/procedural-manager'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json() as RecallRequest

  if (!body.userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    const level = body.level || 'all'
    const result: RecallResult = {
      episodic: [],
      semantic: [],
      procedural: [],
    }

    const searchQuery = {
      projectId: body.projectId,
      query: body.query,
      tags: body.tags,
      scope: body.scope || 'all',
      limit: body.limit || 20,
    }

    if (level === 'all' || level === 'episodic') {
      result.episodic = searchEpisodic(body.userId, searchQuery)
    }

    if (level === 'all' || level === 'semantic') {
      result.semantic = searchSemantic(body.userId, {
        ...searchQuery,
        type: body.type,
      })
    }

    if (level === 'all' || level === 'procedural') {
      result.procedural = searchProcedural(body.userId, {
        ...searchQuery,
        type: body.type,
      })
    }

    return Response.json({ success: true, result })
  } catch (err) {
    console.error('[Memory] Recall error:', err)
    return Response.json({ error: 'Failed to recall memory' }, { status: 500 })
  }
}

function searchEpisodic(
  userId: string,
  query: {
    projectId?: string
    query?: string
    tags?: string[]
    limit?: number
    scope?: string
  }
): EpisodicEntry[] {
  const dirs = store.getMemoryBaseDirs(userId, query.projectId)
  const allEntries: EpisodicEntry[] = []

  for (const dir of dirs) {
    const entries = store.readRecentEpisodic(dir, 30)
    allEntries.push(...entries)
  }

  let filtered = allEntries

  if (query.tags && query.tags.length > 0) {
    filtered = filtered.filter((e: EpisodicEntry) =>
      query.tags!.some(t => e.tags.includes(t))
    )
  }

  if (query.query) {
    const q = query.query.toLowerCase()
    filtered = filtered.filter((e: EpisodicEntry) =>
      e.summary.toLowerCase().includes(q) ||
      (e.detail && e.detail.toLowerCase().includes(q)) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  // 按时间倒序
  filtered.sort((a: EpisodicEntry, b: EpisodicEntry) => b.timestamp.localeCompare(a.timestamp))

  const limit = query.limit || 20
  return filtered.slice(0, limit)
}
