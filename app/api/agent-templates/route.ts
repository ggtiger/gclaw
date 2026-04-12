import { NextRequest } from 'next/server'
import {
  getAgentTemplates,
  createAgentTemplate,
  updateAgentTemplate,
  deleteAgentTemplate,
} from '@/lib/store/agent-templates'

export const dynamic = 'force-dynamic'

export async function GET() {
  const templates = getAgentTemplates()
  return Response.json({ templates })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, description, prompt, model, tools, disallowedTools, category } = body

  if (!name || !prompt) {
    return Response.json({ error: 'name and prompt are required' }, { status: 400 })
  }

  const template = createAgentTemplate({
    name,
    description: description || '',
    prompt,
    model: model || 'inherit',
    tools: tools || [],
    disallowedTools: disallowedTools || [],
    category: category || '',
  })

  return Response.json({ template })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  const template = updateAgentTemplate(id, updates)
  if (!template) {
    return Response.json({ error: 'Template not found or is built-in' }, { status: 404 })
  }

  return Response.json({ template })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  const success = deleteAgentTemplate(id)
  if (!success) {
    return Response.json({ error: 'Template not found or is built-in' }, { status: 404 })
  }

  return Response.json({ success: true })
}
