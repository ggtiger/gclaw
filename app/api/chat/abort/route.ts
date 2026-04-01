import { abortCurrentProcess } from '@/lib/claude/process-manager'

export const dynamic = 'force-dynamic'

export async function POST() {
  const success = abortCurrentProcess()
  return Response.json({
    success,
    message: success ? '已终止' : '没有正在运行的进程',
  })
}
