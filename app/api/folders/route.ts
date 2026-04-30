import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'
import { getUserFolders, createFolder, renameFolder, deleteFolder, getProjectFolderMap } from '@/lib/store/folders'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const folders = getUserFolders(user.userId)
  const projectFolderMap = getProjectFolderMap(user.userId)
  return Response.json({ folders, projectFolderMap })
}

export async function POST(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { name } = await request.json()
  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const folder = createFolder(user.userId, name.trim())
  return Response.json({ folder })
}

export async function PUT(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { id, name } = await request.json()
  if (!id || !name) {
    return Response.json({ error: 'id and name are required' }, { status: 400 })
  }

  const ok = renameFolder(user.userId, id, name.trim())
  if (!ok) return Response.json({ error: '文件夹不存在' }, { status: 404 })
  return Response.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) return Response.json({ error: '未登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const ok = deleteFolder(user.userId, id)
  if (!ok) return Response.json({ error: '文件夹不存在' }, { status: 404 })
  return Response.json({ success: true })
}
