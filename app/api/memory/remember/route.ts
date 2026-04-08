/**
 * POST /api/memory/remember
 * 写入记忆（情节/语义/程序）
 */

import { NextRequest } from 'next/server'
import type { RememberRequest, EpisodicEntry, SemanticEntry, ProceduralEntry } from '@/types/memory'
import { writeEpisodic } from '@/lib/memory/episodic-writer'
import { addSemantic } from '@/lib/memory/semantic-manager'
import { addProcedural } from '@/lib/memory/procedural-manager'
import { refreshOverviewAsync } from '@/lib/memory/injection'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json() as RememberRequest

  if (!body.userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  if (!body.level) {
    return Response.json({ error: 'level is required (episodic/semantic/procedural)' }, { status: 400 })
  }

  try {
    let entry: EpisodicEntry | SemanticEntry | ProceduralEntry

    switch (body.level) {
      case 'episodic': {
        if (!body.type || !body.summary) {
          return Response.json({ error: 'type and summary are required for episodic memory' }, { status: 400 })
        }
        entry = writeEpisodic(body.userId, {
          projectId: body.projectId || '',
          type: body.type,
          summary: body.summary,
          detail: body.detail,
          tags: body.tags || [],
          source: body.source || 'agent',
        }, body.projectId)
        break
      }

      case 'semantic': {
        if (!body.title || !body.content) {
          return Response.json({ error: 'title and content are required for semantic memory' }, { status: 400 })
        }
        entry = addSemantic(body.userId, {
          type: body.semanticType || 'preference',
          title: body.title,
          content: body.content,
          scope: body.scope || 'user',
          projectId: body.projectId,
          tags: body.tags || [],
          confidence: body.confidence,
        })
        break
      }

      case 'procedural': {
        if (!body.title || !body.content) {
          return Response.json({ error: 'title and content are required for procedural memory' }, { status: 400 })
        }
        entry = addProcedural(body.userId, {
          type: body.proceduralType || 'lesson',
          title: body.title,
          content: body.content,
          scope: body.scope || 'user',
          projectId: body.projectId,
          triggers: body.triggers || [],
          steps: body.steps,
          tags: body.tags || [],
          confidence: body.confidence,
        })
        break
      }

      default:
        return Response.json({ error: `Unknown level: ${body.level}` }, { status: 400 })
    }

    // 语义/程序记忆变更后刷新总纲
    if (body.level !== 'episodic') {
      refreshOverviewAsync(body.userId).catch(err => console.warn('[Memory] Overview refresh failed:', err))
    }

    return Response.json({ success: true, entry })
  } catch (err) {
    console.error('[Memory] Remember error:', err)
    return Response.json({ error: 'Failed to write memory' }, { status: 500 })
  }
}
