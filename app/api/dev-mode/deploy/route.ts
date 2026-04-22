import { NextRequest } from 'next/server'
import { getDevModeStatus, getWorktreePath } from '@/lib/dev-mode/manager'
import { buildAndDeploy, syncChanges, cleanupBackup } from '@/lib/dev-mode/deploy'

export const dynamic = 'force-dynamic'

// POST /api/dev-mode/deploy → 构建并部署
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const mode = body.mode as string || 'build' // 'build' | 'sync'

  const status = getDevModeStatus()
  const worktreePath = getWorktreePath()

  if (status.state !== 'active' || !worktreePath) {
    return Response.json({ error: '开发模式未启用' }, { status: 400 })
  }

  if (mode === 'sync') {
    // 直接同步修改（不构建，适合 dev 模式）
    const result = await syncChanges(worktreePath)
    return Response.json(result)
  }

  // 完整构建并部署
  const result = await buildAndDeploy(worktreePath)

  if (result.success) {
    // 部署成功后清理备份
    setTimeout(cleanupBackup, 5000)
  }

  return Response.json(result)
}
