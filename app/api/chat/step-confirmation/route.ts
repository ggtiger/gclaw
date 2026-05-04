import { NextRequest } from 'next/server'
import { resolveStepConfirmation } from '@/lib/commands/executor'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { requestId, action, modifiedContent } = body

    if (!requestId || typeof requestId !== 'string') {
      return new Response(JSON.stringify({ error: 'requestId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!action || !['continue', 'modify', 'abort'].includes(action)) {
      return new Response(JSON.stringify({ error: 'action must be continue, modify, or abort' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[StepConfirmation API] Received: requestId=${requestId}, action=${action}`)
    resolveStepConfirmation(requestId, { action, modifiedContent })

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
