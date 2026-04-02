import { NextRequest } from 'next/server'
import { getGlobalSettings, updateGlobalSettings } from '@/lib/store/settings'
import { requireAdmin } from '@/lib/auth/helpers'
import { getMessages } from '@/lib/store/messages'
import { getProjectDir } from '@/lib/store/projects'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/** 检测文本中的敏感词 */
export async function POST(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const body = await request.json()
  const { text } = body as { text: string }

  if (!text) {
    return Response.json({ error: '缺少 text' }, { status: 400 })
  }

  const settings = getGlobalSettings()
  const words = settings.security?.sensitiveWords || []

  const matches: { word: string; position: number }[] = []

  for (const pattern of words) {
    try {
      const regex = new RegExp(pattern, 'gi')
      const match = regex.exec(text)
      if (match) {
        matches.push({ word: match[0], position: match.index })
      }
    } catch {
      // 无效正则，跳过
    }
  }

  return Response.json({ hasSensitiveContent: matches.length > 0, matches })
}

/** 获取安全配置 */
export async function GET() {
  const settings = getGlobalSettings()
  return Response.json({
    security: settings.security || { sensitiveWords: [], retentionDays: 0 },
  })
}

/** 更新安全配置或执行过期清理 */
export async function PUT(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const body = await request.json()
  const { sensitiveWords, retentionDays, executeCleanup, projectId } = body as {
    sensitiveWords?: string[]
    retentionDays?: number
    executeCleanup?: boolean
    projectId?: string
  }

  const updated = updateGlobalSettings({
    security: {
      sensitiveWords: sensitiveWords ?? [],
      retentionDays: retentionDays ?? 0,
    },
  })

  // 执行过期清理
  if (executeCleanup && retentionDays && retentionDays > 0 && projectId) {
    const { messages: allMessages } = getMessages(projectId, Number.MAX_SAFE_INTEGER)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const before = allMessages.filter(m => new Date(m.createdAt).getTime() >= cutoff)



    if (before.length < allMessages.length) {
      const dir = getProjectDir(projectId)
      const file = path.join(dir, 'messages.json')
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8')
        const data = JSON.parse(raw)
        data.messages = before
        if (data.branches && Array.isArray(data.branches)) {
          data.branches = data.branches.map(
            (b: Record<string, unknown>) => ({
              ...b,
              messages: Array.isArray((b as Record<string, unknown>).messages)
                ? ((b as Record<string, unknown>).messages as Record<string, unknown>[]).filter(
                    (m: Record<string, unknown>) => new Date((m as Record<string, unknown>).createdAt as string).getTime() >= cutoff
                  )
                : [],
            })
          )
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
      }
    }

    return Response.json({
      cleaned: allMessages.length - before.length,
      kept: before.length,
    })
  }

  return Response.json({ security: updated.security })
}
