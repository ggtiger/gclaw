import { NextRequest } from 'next/server'
import { resolveAskQuestion } from '@/lib/claude/process-manager'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { requestId, answers } = body

  if (!requestId || typeof requestId !== 'string') {
    return new Response(JSON.stringify({ error: 'requestId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!answers || typeof answers !== 'object') {
    return new Response(JSON.stringify({ error: 'answers is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  resolveAskQuestion(requestId, answers)

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
