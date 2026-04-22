import { NextRequest } from 'next/server'
import {
  getDevModeStatus,
  enableDevMode,
  disableDevMode,
  initCleanup,
} from '@/lib/dev-mode/manager'

export const dynamic = 'force-dynamic'

// 首次访问时清理残留的 worktree
let cleanupDone = false
async function ensureCleanup() {
  if (!cleanupDone) {
    cleanupDone = true
    await initCleanup()
  }
}

// GET /api/dev-mode → 获取开发模式状态
export async function GET() {
  await ensureCleanup()
  const status = getDevModeStatus()
  return Response.json(status)
}

// POST /api/dev-mode → 启用/禁用开发模式
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = body.action as string

  if (action === 'enable') {
    const status = await enableDevMode()
    return Response.json(status)
  }

  if (action === 'disable') {
    const status = await disableDevMode({ keepWorktree: body.keepWorktree })
    return Response.json(status)
  }

  return Response.json({ error: 'Invalid action. Use "enable" or "disable"' }, { status: 400 })
}
