import { NextRequest } from 'next/server'
import { getMessages, clearMessages } from '@/lib/store/messages'
import { updateSettings } from '@/lib/store/settings'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const before = searchParams.get('before') || undefined

  const result = getMessages(limit, before)
  return Response.json(result)
}

export async function DELETE() {
  clearMessages()
  updateSettings({ sessionId: '' })
  return Response.json({ success: true })
}
