import { NextRequest } from 'next/server'
import { getAllTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from '@/lib/store/templates'

export const dynamic = 'force-dynamic'

/** 获取所有模板或单个模板 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const template = getTemplate(id)
    if (!template) return Response.json({ error: '模板不存在' }, { status: 404 })
    return Response.json({ template })
  }

  return Response.json({ templates: getAllTemplates() })
}

/** 创建模板 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, description, systemPrompt, firstMessage } = body as {
    name?: string
    description?: string
    systemPrompt?: string
    firstMessage?: string
  }

  if (!name?.trim()) {
    return Response.json({ error: '缺少模板名称' }, { status: 400 })
  }

  const template = createTemplate({
    name: name.trim(),
    description: description || '',
    systemPrompt: systemPrompt || '',
    firstMessage: firstMessage || '',
    isBuiltIn: false,
  })

  return Response.json({ template })
}

/** 更新模板 */
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, ...partial } = body as { id: string; [key: string]: unknown }

  if (!id) return Response.json({ error: '缺少 id' }, { status: 400 })

  const template = updateTemplate(id, partial)
  if (!template) return Response.json({ error: '模板不存在' }, { status: 404 })

  return Response.json({ template })
}

/** 删除模板 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return Response.json({ error: '缺少 id' }, { status: 400 })

  const ok = deleteTemplate(id)
  if (!ok) return Response.json({ error: '删除失败（内置模板不可删除）' }, { status: 400 })

  return Response.json({ success: true })
}
