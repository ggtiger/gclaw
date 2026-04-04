import { abortProcess, abortCurrentProcess } from '@/lib/claude/process-manager'
import { isValidProjectId } from '@/lib/store/projects'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId')

  // 安全校验：验证 projectId 格式
  if (projectId && !isValidProjectId(projectId)) {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  }

  let success: boolean
  if (projectId) {
    success = abortProcess(projectId)
  } else {
    success = abortCurrentProcess()
  }

  return Response.json({
    success,
    message: success ? '已终止' : '没有正在运行的进程',
  })
}
