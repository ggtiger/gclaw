import { NextRequest } from 'next/server'
import { getSettings, updateSettings } from '@/lib/store/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = getSettings()
  return Response.json(settings)
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const settings = updateSettings(body)
  return Response.json({ success: true, settings })
}
