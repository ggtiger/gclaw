import { NextRequest } from 'next/server'
import { queryAuditLog } from '@/lib/store/audit-log'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const action = searchParams.get('action') || undefined
  const projectId = searchParams.get('projectId') || undefined

  const result = queryAuditLog({ limit, offset, action: action as any, projectId })
  return Response.json(result)
}
