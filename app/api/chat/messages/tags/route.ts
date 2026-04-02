import { NextRequest } from 'next/server'
import {
  getAllTags,
  getTagsWithCount,
  addTag,
  removeTag,
  toggleStar,
  getStarredMessages,
} from '@/lib/store/messages'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

/** 获取所有标签（含统计）或收藏消息 */
export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type === 'starred') {
    const messages = getStarredMessages(projectId)
    return Response.json({ messages })
  }

  // 默认返回标签列表（含统计）
  const tags = getTagsWithCount(projectId)
  return Response.json({ tags })
}

/** 添加/移除标签，或切换收藏 */
export async function POST(request: NextRequest) {
  const projectId = getProjectId(request)
  const body = await request.json()
  const { action, messageId, tag } = body as {
    action: 'addTag' | 'removeTag' | 'toggleStar'
    messageId: string
    tag?: string
  }

  if (!messageId) {
    return Response.json({ error: '缺少 messageId' }, { status: 400 })
  }

  switch (action) {
    case 'addTag': {
      if (!tag) return Response.json({ error: '缺少 tag' }, { status: 400 })
      const msg = addTag(projectId, messageId, tag)
      if (!msg) return Response.json({ error: '消息不存在' }, { status: 404 })
      return Response.json({ message: msg })
    }
    case 'removeTag': {
      if (!tag) return Response.json({ error: '缺少 tag' }, { status: 400 })
      const msg = removeTag(projectId, messageId, tag)
      if (!msg) return Response.json({ error: '消息不存在' }, { status: 404 })
      return Response.json({ message: msg })
    }
    case 'toggleStar': {
      const msg = toggleStar(projectId, messageId)
      if (!msg) return Response.json({ error: '消息不存在' }, { status: 404 })
      return Response.json({ message: msg })
    }
    default:
      return Response.json({ error: '未知操作' }, { status: 400 })
  }
}
