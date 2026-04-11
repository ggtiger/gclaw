import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

interface PromptLogEntry {
  timestamp: string
  projectId: string
  model?: string
  sessionId?: string | null
  systemPrompt: string
  userMessage: string
  attachments: Array<{ filename: string; mimeType: string; isImage: boolean; size?: number }>
  sdkOptions: { cwd: string; resume: boolean }
}

/** 读取提示词日志，按 projectId 过滤，支持 offset 分页 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const limit = parseInt(searchParams.get('limit') || '10', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  if (!projectId) {
    return Response.json({ error: '缺少 projectId' }, { status: 400 })
  }

  const logFile = path.join(DATA_DIR, 'ai-prompt-log.jsonl')

  if (!fs.existsSync(logFile)) {
    return Response.json({ success: true, logs: [], hasMore: false })
  }

  try {
    const content = fs.readFileSync(logFile, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)

    // 从后往前读取，跳过 offset 条，取 limit 条
    const logs: PromptLogEntry[] = []
    let skipped = 0
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry: PromptLogEntry = JSON.parse(lines[i])
        if (entry.projectId === projectId) {
          if (skipped < offset) {
            skipped++
            continue
          }
          logs.push(entry)
          if (logs.length >= limit + 1) break // 多取一条判断 hasMore
        }
      } catch {
        // 跳过解析失败的行
      }
    }

    const hasMore = logs.length > limit
    if (hasMore) logs.pop()

    return Response.json({ success: true, logs, hasMore })
  } catch {
    return Response.json({ success: true, logs: [], hasMore: false })
  }
}
