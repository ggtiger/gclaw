import { NextRequest } from 'next/server'
import {
  getAllPromptTemplates,
  getPromptOverrides,
  updatePromptTemplates,
  resetPromptTemplate,
  resetAllPromptTemplates,
} from '@/lib/store/prompt-templates'
import { PROMPT_DEFAULTS, PROMPT_CATEGORIES } from '@/lib/prompts/defaults'

export const dynamic = 'force-dynamic'

/** GET: 返回所有模板（按分类组织） */
export async function GET() {
  const allTemplates = getAllPromptTemplates()
  const overrides = getPromptOverrides()

  const categories = PROMPT_CATEGORIES.map(cat => ({
    key: cat.key,
    label: cat.label,
    description: cat.description,
    defaultCollapsed: cat.defaultCollapsed,
    items: cat.items.map(item => ({
      key: item.key,
      label: item.label,
      value: allTemplates[item.key] ?? PROMPT_DEFAULTS[item.key] ?? '',
      isCustomized: item.key in overrides,
    })),
  }))

  return Response.json({ categories })
}

/** PUT: 保存用户修改 */
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { templates } = body as { templates: Record<string, string> }

  if (!templates || typeof templates !== 'object') {
    return Response.json({ error: 'templates is required' }, { status: 400 })
  }

  // 只接受有效 key
  const validKeys = new Set(Object.keys(PROMPT_DEFAULTS))
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(templates)) {
    if (validKeys.has(key) && typeof value === 'string') {
      filtered[key] = value
    }
  }

  updatePromptTemplates(filtered)
  return Response.json({ success: true })
}

/** DELETE: 重置（?key=xxx 重置单个，无 key 重置全部） */
export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')

  if (key) {
    if (!(key in PROMPT_DEFAULTS)) {
      return Response.json({ error: 'Invalid key' }, { status: 400 })
    }
    resetPromptTemplate(key)
  } else {
    resetAllPromptTemplates()
  }

  return Response.json({ success: true })
}
