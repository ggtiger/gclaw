import { NextRequest } from 'next/server'
import {
  getProjects,
  getProjectsByOwner,
  createProject,
  deleteProject,
  renameProject,
  ensureDefaultProject,
} from '@/lib/store/projects'
import { addAuditLog } from '@/lib/store/audit-log'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // 确保至少有一个项目
  ensureDefaultProject()

  const user = getAuthUser(request)
  // admin 可看到所有项目，普通用户只看自己的
  const projects = user && user.role !== 'admin'
    ? getProjectsByOwner(user.userId)
    : getProjects()

  return Response.json({ projects })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  const project = createProject(name.trim(), user?.userId)
  addAuditLog('project:create', user?.username || 'system', { projectName: name.trim() }, project.id)
  return Response.json({ project })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, name } = body

  if (!id || !name) {
    return Response.json({ error: 'id and name are required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  renameProject(id, name.trim())
  addAuditLog('project:update', user?.username || 'system', { newName: name.trim() }, id)
  return Response.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  deleteProject(id)
  addAuditLog('project:delete', user?.username || 'system', { projectId: id })
  return Response.json({ success: true })
}
