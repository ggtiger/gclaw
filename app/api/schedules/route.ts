/**
 * 定时任务 CRUD API
 * GET:   列出任务 ?projectId=xxx
 * POST:  创建任务
 * PUT:   更新任务 ?id=xxx
 * DELETE: 删除任务 ?id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAllTasks, getTask, createTask, updateTask, deleteTask } from '@/lib/store/schedules'
import { taskScheduler } from '@/lib/scheduler/scheduler'
import type { ScheduledTask, TaskType, TaskSchedule } from '@/types/schedules'
import { gclawEventBus } from '@/lib/claude/gclaw-events'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('projectId') || undefined
  const tasks = getAllTasks(projectId)

  // 刷新 nextRunAt
  const enriched = tasks.map(t => {
    if (t.enabled && !t.nextRunAt) {
      const nextRun = taskScheduler.refreshNextRun(t)
      return { ...t, nextRunAt: nextRun?.toISOString() }
    }
    return t
  })

  return NextResponse.json({ tasks: enriched })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, type, schedule, config, projectId, enabled, createdBy } = body as {
      name: string
      type: TaskType
      schedule: TaskSchedule
      config: Record<string, unknown>
      projectId?: string
      enabled?: boolean
      createdBy?: string
    }

    if (!name || !type || !schedule?.mode) {
      return NextResponse.json({ error: 'Missing required fields: name, type, schedule.mode' }, { status: 400 })
    }

    const task = createTask({
      name,
      type,
      schedule,
      config: config || {},
      projectId: projectId || undefined,
      enabled: enabled !== false,
      status: 'idle',
      createdBy,
    })

    // 刷新 nextRunAt
    taskScheduler.refreshNextRun(task)

    const pid = task.projectId || ''
    gclawEventBus.notify(pid, 'task:created', 'scheduler', {
      taskId: task.id,
      taskName: task.name,
    })

    return NextResponse.json({ task })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const body = await req.json()
    const task = updateTask(id, body as Partial<ScheduledTask>)
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // 刷新 nextRunAt
    if (task.enabled) {
      taskScheduler.refreshNextRun(task)
    }

    const pid = task.projectId || ''
    gclawEventBus.notify(pid, 'task:updated', 'scheduler', {
      taskId: task.id,
      taskName: task.name,
    })

    return NextResponse.json({ task })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const task = getTask(id)
  const ok = deleteTask(id)
  if (!ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const pid = task?.projectId || ''
  gclawEventBus.notify(pid, 'task:deleted', 'scheduler', {
    taskId: id,
    taskName: task?.name,
  })

  return NextResponse.json({ success: true })
}
