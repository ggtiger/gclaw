import { NextRequest } from 'next/server'
import {
  getProjects,
  createProject,
  deleteProject,
  renameProject,
  ensureDefaultProject,
} from '@/lib/store/projects'

export const dynamic = 'force-dynamic'

export async function GET() {
  // 确保至少有一个项目
  ensureDefaultProject()
  const projects = getProjects()
  return Response.json({ projects })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const project = createProject(name.trim())
  return Response.json({ project })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, name } = body

  if (!id || !name) {
    return Response.json({ error: 'id and name are required' }, { status: 400 })
  }

  renameProject(id, name.trim())
  return Response.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  deleteProject(id)
  return Response.json({ success: true })
}
