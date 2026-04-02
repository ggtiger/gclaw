import { NextRequest } from 'next/server'
import { getSettings, updateSettings } from '@/lib/store/settings'
import { maskApiKey } from '@/lib/crypto'
import { addAuditLog } from '@/lib/store/audit-log'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const settings = getSettings(projectId)
  // 脱敏：API Key 仅返回掩码
  const safe = { ...settings, apiKey: maskApiKey(settings.apiKey) }
  return Response.json(safe)
}

export async function PUT(request: NextRequest) {
  const projectId = getProjectId(request)
  const body = await request.json()
  // 如果前端传的是掩码（****开头），说明用户没有修改 apiKey，不更新
  if (body.apiKey && body.apiKey.startsWith('****')) {
    delete body.apiKey
  }
  // 审计：记录设置变更（脱敏后记录）
  const user = getAuthUser(request)
  const changedKeys = Object.keys(body).filter(k => k !== 'apiKey')
  const auditDetails: Record<string, unknown> = { changedKeys }
  if (body.apiKey) {
    auditDetails.apiKeyUpdated = true
  }
  addAuditLog('settings:update', user?.username || 'system', auditDetails, projectId || undefined)

  const settings = updateSettings(projectId, body)
  // 返回脱敏后的设置
  const safe = { ...settings, apiKey: maskApiKey(settings.apiKey) }
  return Response.json({ success: true, settings: safe })
}
