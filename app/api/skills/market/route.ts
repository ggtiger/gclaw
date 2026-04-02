import { NextRequest } from 'next/server'
import { searchMarketSkills } from '@/lib/services/skill-market'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q') || ''
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  try {
    const result = await searchMarketSkills(q || undefined, page, limit)
    return Response.json({ success: true, data: result })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : '搜索失败' },
      { status: 500 }
    )
  }
}
