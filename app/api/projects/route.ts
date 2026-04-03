import { NextRequest } from 'next/server'
import {
  getProjects,
  getProjectsForUser,
  createProject,
  deleteProject,
  renameProject,
  ensureDefaultProject,
  enrichWithOwnerName,
} from '@/lib/store/projects'
import { addAuditLog } from '@/lib/store/audit-log'
import { getAuthUser } from '@/lib/auth/helpers'
import type { ProjectType } from '@/types/skills'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = getAuthUser(request)

  // admin 可看到所有项目；普通用户只看自己的和参与的
  // 仅普通用户在无项目时自动创建默认项目
  let projects = user
    ? (user.role === 'admin'
        ? getProjects()
        : (() => {
            const list = getProjectsForUser(user.userId)
            if (list.length === 0) {
              ensureDefaultProject(user.userId)
              return getProjectsForUser(user.userId)
            }
            return list
          })())
    : getProjects()

  // admin 视角附加 ownerName
  if (user?.role === 'admin') {
    projects = enrichWithOwnerName(projects)
  }

  return Response.json({ projects })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type } = body

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  // 验证 type 是否为有效值，如果未提供默认为 'development'
  const validTypes: ProjectType[] = ['secretary', 'development', 'office']
  const projectType: ProjectType = validTypes.includes(type) ? type : 'development'

  const user = getAuthUser(request)
  const project = createProject(name.trim(), user?.userId, projectType)
  addAuditLog('project:create', user?.username || 'system', { projectName: name.trim(), type: projectType }, project.id)
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
