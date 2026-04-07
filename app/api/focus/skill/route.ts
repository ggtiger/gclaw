// app/api/focus/skill/route.ts
// 直接从指定 Skill 获取 Focus 数据（不经过 FocusSettings 中间层）

import { NextRequest } from 'next/server'
import { getFocusDataFromSkill, getSkillHooksInfo } from '@/lib/focus/providers/skill-provider'
import { isValidProjectId } from '@/lib/store/projects'
import type { FocusDataType } from '@/types/focus'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId') || ''
  const dataType = (url.searchParams.get('type') || '') as FocusDataType
  const skillName = url.searchParams.get('skillName') || ''

  if (!isValidProjectId(projectId)) {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  }

  // 如果只请求 hooks 信息（不请求数据）
  if (skillName && url.searchParams.get('info') === 'hooks') {
    const hooksInfo = getSkillHooksInfo(skillName)
    if (!hooksInfo) {
      return Response.json({ error: 'Skill not found or no hooks configured' }, { status: 404 })
    }
    return Response.json(hooksInfo)
  }

  // 请求技能数据
  if (!skillName) {
    return Response.json({ error: 'Missing skillName' }, { status: 400 })
  }

  const VALID_TYPES: FocusDataType[] = ['todos', 'notes', 'events']
  if (!VALID_TYPES.includes(dataType)) {
    return Response.json({ error: 'Invalid type' }, { status: 400 })
  }

  // 解析额外的参数
  const params: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('param_')) {
      params[key.slice(6)] = value
    }
  }

  try {
    const result = await getFocusDataFromSkill(skillName, dataType, params)
    return Response.json({
      data: result.data,
      hooksSummary: result.hooksSummary,
    })
  } catch (err) {
    console.error(`[FocusSkillAPI] Error fetching data from skill "${skillName}":`, err)
    return Response.json({ error: 'Failed to fetch data from skill' }, { status: 500 })
  }
}
