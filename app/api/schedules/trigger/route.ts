/**
 * 手动触发定时任务
 * POST /api/schedules/trigger?id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTask } from '@/lib/store/schedules'
import { taskScheduler } from '@/lib/scheduler/scheduler'

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const task = getTask(id)
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // 异步执行，立即返回
  taskScheduler.runTask(task).catch(err => {
    console.error(`[Scheduler] Manual trigger failed for ${id}:`, err)
  })

  return NextResponse.json({ success: true, message: `Task "${task.name}" triggered` })
}
