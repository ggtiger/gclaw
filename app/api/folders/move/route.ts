import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'
import { setProjectFolder } from '@/lib/store/folders'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { projectId, folderId } = await request.json()
  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  setProjectFolder(user.userId, projectId, folderId ?? null)
  return Response.json({ success: true })
}
