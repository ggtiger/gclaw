import { NextRequest } from 'next/server'
import {
  getProjectById,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
} from '@/lib/store/projects'
import { getAllUsers } from '@/lib/store/users'
import { getAuthUser } from '@/lib/auth/helpers'
import type { ProjectRole } from '@/types/skills'

export const dynamic = 'force-dynamic'

// GET: 获取项目成员列表 + 可邀请用户
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const search = searchParams.get('search') || ''

  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  const project = getProjectById(projectId)
  if (!project) {
    return Response.json({ error: '项目不存在' }, { status: 404 })
  }

  const members = project.members || []

  // 如果有 search 参数，返回可邀请用户列表
  if (search) {
    const allUsers = getAllUsers()
    const memberIds = new Set(members.map(m => m.userId))
    const available = allUsers
      .filter(u =>
        !memberIds.has(u.id) &&
        u.username.toLowerCase().includes(search.toLowerCase()) &&
        !u.disabled
      )
      .map(u => ({ userId: u.id, username: u.username }))
      .slice(0, 10)

    return Response.json({ members, available })
  }

  return Response.json({ members })
}

// POST: 添加成员
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { projectId, userId, role } = body

  if (!projectId || !userId) {
    return Response.json({ error: 'projectId and userId are required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  const actorName = user?.username || 'system'

  const result = addProjectMember(projectId, userId, (role || 'viewer') as ProjectRole, actorName)

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return Response.json({ success: true })
}

// PUT: 更新成员角色
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { projectId, userId, role } = body

  if (!projectId || !userId || !role) {
    return Response.json({ error: 'projectId, userId and role are required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  const actorName = user?.username || 'system'

  const result = updateProjectMemberRole(projectId, userId, role as ProjectRole, actorName)

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return Response.json({ success: true })
}

// DELETE: 移除成员
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const userId = searchParams.get('userId') || ''

  if (!projectId || !userId) {
    return Response.json({ error: 'projectId and userId are required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  const actorName = user?.username || 'system'

  const result = removeProjectMember(projectId, userId, actorName)

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return Response.json({ success: true })
}
