import { NextRequest } from 'next/server'
import { getBranches, createBranch, getBranchMessages, deleteBranch } from '@/lib/store/messages'
import { isValidProjectId } from '@/lib/store/projects'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

// GET: 获取分支列表或分支消息
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const branchId = searchParams.get('branchId') || 'main'

  if (!projectId || !isValidProjectId(projectId)) {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  }

  if (branchId !== 'main') {
    const messages = getBranchMessages(projectId, branchId)
    return Response.json({ messages })
  }

  const branches = getBranches(projectId)
  return Response.json({ branches })
}

// POST: 创建分支
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { projectId, fromMessageId, name } = body

  if (!projectId || !isValidProjectId(projectId) || !fromMessageId) {
    return Response.json({ error: 'projectId and fromMessageId are required' }, { status: 400 })
  }

  const result = createBranch(projectId, fromMessageId, name)

  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return Response.json({ branch: result.branch }, { status: 201 })
}

// DELETE: 删除分支
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const branchId = searchParams.get('branchId') || ''

  if (!projectId || !isValidProjectId(projectId) || !branchId) {
    return Response.json({ error: 'Invalid projectId or branchId' }, { status: 400 })
  }

  const success = deleteBranch(projectId, branchId)

  if (!success) {
    return Response.json({ error: '无法删除该分支' }, { status: 400 })
  }

  return Response.json({ success: true })
}
