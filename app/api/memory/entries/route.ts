/**
 * GET  /api/memory/entries  — 列出条目（分页+筛选）
 * PUT  /api/memory/entries  — 更新条目
 * DELETE /api/memory/entries — 归档/删除条目
 */

import { NextRequest } from 'next/server'
import type { SemanticEntry, ProceduralEntry, EpisodicEntry } from '@/types/memory'
import { store } from '@/lib/memory/store'
import { listSemantic } from '@/lib/memory/semantic-manager'
import { listProcedural } from '@/lib/memory/procedural-manager'
import { refreshOverviewAsync } from '@/lib/memory/injection'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  const projectId = url.searchParams.get('projectId') || undefined
  const level = url.searchParams.get('level') || 'all'
  const scope = (url.searchParams.get('scope') as 'user' | 'project' | 'all') || 'all'
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)))

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    const result: {
      semantic?: PaginatedResult<SemanticEntry>
      procedural?: PaginatedResult<ProceduralEntry>
      episodic?: PaginatedResult<EpisodicEntry>
    } = {}

    if (level === 'all' || level === 'semantic') {
      const all = listSemantic(userId, projectId, scope)
      result.semantic = paginate(all, page, pageSize)
    }

    if (level === 'all' || level === 'procedural') {
      const all = listProcedural(userId, projectId, scope)
      result.procedural = paginate(all, page, pageSize)
    }

    if (level === 'all' || level === 'episodic') {
      const dirs = store.getMemoryBaseDirs(userId, projectId)
      const entries: EpisodicEntry[] = []
      for (const dir of dirs) {
        entries.push(...store.readRecentEpisodic(dir, 30))
      }
      const sorted = entries.sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      )
      result.episodic = paginate(sorted, page, pageSize)
    }

    return Response.json({ success: true, ...result })
  } catch (err) {
    console.error('[Memory] List error:', err)
    return Response.json({ error: 'Failed to list entries' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as {
    userId: string
    id: string
    level: 'semantic' | 'procedural'
    projectId?: string
    updates: Partial<SemanticEntry> | Partial<ProceduralEntry>
  }

  if (!body.userId || !body.id || !body.level) {
    return Response.json({ error: 'userId, id, and level are required' }, { status: 400 })
  }

  if (body.level !== 'semantic' && body.level !== 'procedural') {
    return Response.json({ error: 'level must be semantic or procedural' }, { status: 400 })
  }

  try {
    let result: SemanticEntry | ProceduralEntry | null = null

    if (body.level === 'semantic') {
      const { updateSemantic } = await import('@/lib/memory/semantic-manager')
      result = updateSemantic(body.userId, body.id, body.updates as Partial<SemanticEntry>, body.projectId)
    } else if (body.level === 'procedural') {
      const { updateProcedural } = await import('@/lib/memory/procedural-manager')
      result = updateProcedural(body.userId, body.id, body.updates as Partial<ProceduralEntry>, body.projectId)
    }

    if (!result) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    refreshOverviewAsync(body.userId).catch(err => console.warn('[Memory] Overview refresh failed:', err))

    return Response.json({ success: true, entry: result })
  } catch (err) {
    console.error('[Memory] Update error:', err)
    return Response.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  const id = url.searchParams.get('id')
  const level = url.searchParams.get('level') as 'semantic' | 'procedural'
  const projectId = url.searchParams.get('projectId') || undefined

  if (!userId || !id || !level) {
    return Response.json({ error: 'userId, id, and level are required' }, { status: 400 })
  }

  if (level !== 'semantic' && level !== 'procedural') {
    return Response.json({ error: 'level must be semantic or procedural' }, { status: 400 })
  }

  try {
    // 归档而非删除（标记 status = archived）
    const updates = { status: 'archived' as const }
    let result: SemanticEntry | ProceduralEntry | null = null

    if (level === 'semantic') {
      const { updateSemantic } = await import('@/lib/memory/semantic-manager')
      result = updateSemantic(userId, id, updates, projectId)
    } else if (level === 'procedural') {
      const { updateProcedural } = await import('@/lib/memory/procedural-manager')
      result = updateProcedural(userId, id, updates, projectId)
    }

    if (!result) {
      return Response.json({ error: 'Entry not found' }, { status: 404 })
    }

    refreshOverviewAsync(userId).catch(err => console.warn('[Memory] Overview refresh failed:', err))

    return Response.json({ success: true })
  } catch (err) {
    console.error('[Memory] Archive error:', err)
    return Response.json({ error: 'Failed to archive entry' }, { status: 500 })
  }
}
