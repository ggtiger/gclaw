import { NextRequest } from 'next/server'
import { getAgents, saveAgents } from '@/lib/store/agents'
import { getProjectById, getProjects } from '@/lib/store/projects'
import type { AgentInfo } from '@/types/skills'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const agents = getAgents(projectId)

  // 秘书项目：返回子项目列表（含协调人信息），供 @-mention 使用
  let subProjects = undefined
  const project = getProjectById(projectId)
  if (project?.type === 'secretary') {
    const allProjects = getProjects()
    subProjects = allProjects
      .filter(p => p.id !== projectId && p.type !== 'secretary')
      .map(p => {
        const pAgents = getAgents(p.id).filter(a => a.enabled)
        const coordinator = pAgents.find(a => a.isCoordinator)
        const members = pAgents.filter(a => !a.isCoordinator)
        return {
          id: p.id,
          name: p.name,
          mode: p.mode,
          coordinator: coordinator?.name,
          memberNames: members.map(m => m.name),
        }
      })
  }

  return Response.json({ agents, subProjects })
}

export async function POST(request: NextRequest) {
  const projectId = getProjectId(request)
  const body = await request.json()
  const { name, description, prompt, model, tools, disallowedTools } = body

  if (!name || !prompt) {
    return Response.json({ error: 'name and prompt are required' }, { status: 400 })
  }

  const agents = getAgents(projectId)
  if (agents.some(a => a.name === name)) {
    return Response.json({ error: 'Agent name already exists' }, { status: 409 })
  }

  const newAgent: AgentInfo = {
    name,
    description: description || '',
    prompt,
    model: model || 'inherit',
    tools: Array.isArray(tools) ? tools : [],
    disallowedTools: Array.isArray(disallowedTools) ? disallowedTools : [],
    enabled: true,
  }

  agents.push(newAgent)
  saveAgents(projectId, agents)
  return Response.json({ agent: newAgent })
}

export async function PUT(request: NextRequest) {
  const projectId = getProjectId(request)
  const body = await request.json()
  const { name } = body

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const agents = getAgents(projectId)
  const idx = agents.findIndex(a => a.name === name)
  if (idx < 0) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  agents[idx] = { ...agents[idx], ...body }
  saveAgents(projectId, agents)
  return Response.json({ agent: agents[idx] })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId') || ''
  const name = searchParams.get('name')

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const agents = getAgents(projectId)
  const filtered = agents.filter(a => a.name !== name)

  if (filtered.length === agents.length) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  saveAgents(projectId, filtered)
  return Response.json({ success: true })
}
