import { NextRequest } from 'next/server'
import { checkForUpdate, pullAndUpdate } from '@/lib/dev-mode/ota'
import { getDevModeStatus } from '@/lib/dev-mode/manager'

export const dynamic = 'force-dynamic'

// GET /api/dev-mode/update → 检查远程更新
export async function GET() {
  const status = await checkForUpdate()
  return Response.json(status)
}

// POST /api/dev-mode/update → 拉取并应用更新
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const buildAfterPull = body.build !== false // 默认构建

  const result = await pullAndUpdate()

  if (result.success) {
    return Response.json({
      ...result,
      message: '更新成功，请重启应用以应用变更',
      needsRestart: true,
    })
  }

  return Response.json(result, { status: 500 })
}
