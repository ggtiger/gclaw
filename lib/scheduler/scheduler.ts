/**
 * 定时任务调度器核心
 * globalThis 单例 + setInterval 每秒扫描到期任务
 */

import type { ScheduledTask, TaskSchedule } from '../../types/schedules'
import { getAllTasks, updateTask, createTask, deleteTask } from '../store/schedules'
import { getNextRun } from './cron-parser'
import { executeTask } from './executors'
import { gclawEventBus } from '../claude/gclaw-events'
import { logger } from '@/lib/logger'

const GLOBAL_KEY = '__gclaw_scheduler__'
const CHECK_INTERVAL = 1000 // 每秒扫描

class TaskScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private runningTasks = new Set<string>()

  start() {
    if (this.timer) return
    logger.info('[Scheduler] Starting task scheduler...')
    this.timer = setInterval(() => this.checkPendingTasks(), CHECK_INTERVAL)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('[Scheduler] Stopped')
    }
  }

  private async checkPendingTasks() {
    const now = Date.now()
    const tasks = getAllTasks()

    for (const task of tasks) {
      if (!task.enabled || task.status === 'running') continue
      if (this.runningTasks.has(task.id)) continue

      const nextRun = this.computeNextRun(task.schedule, task.lastRunAt)
      if (!nextRun) continue

      if (nextRun.getTime() <= now) {
        await this.runTask(task)
      }
    }
  }

  private computeNextRun(schedule: TaskSchedule, lastRunAt?: string): Date | null {
    switch (schedule.mode) {
      case 'once':
        if (!schedule.runAt) return null
        return new Date(schedule.runAt)

      case 'interval': {
        if (!schedule.intervalMs) return null
        // 从未执行过 → 立即触发（返回当前时间）
        if (!lastRunAt) return new Date()
        // 已执行过 → 上次执行时间 + 间隔
        return new Date(new Date(lastRunAt).getTime() + schedule.intervalMs)
      }

      case 'cron':
        if (!schedule.cron) return null
        return getNextRun(schedule.cron, lastRunAt ? new Date(lastRunAt) : undefined)

      default:
        return null
    }
  }

  /** 计算并更新任务的 nextRunAt */
  refreshNextRun(task: ScheduledTask): Date | null {
    const nextRun = this.computeNextRun(task.schedule, task.lastRunAt)
    updateTask(task.id, { nextRunAt: nextRun?.toISOString() })
    return nextRun
  }

  async runTask(task: ScheduledTask): Promise<void> {
    if (this.runningTasks.has(task.id)) return
    this.runningTasks.add(task.id)

    const now = new Date().toISOString()
    updateTask(task.id, { status: 'running' })

    const projectId = task.projectId || ''
    gclawEventBus.notify(projectId, 'task:started', 'scheduler', {
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
    })

    try {
      const result = await executeTask(task)
      const finishedAt = new Date().toISOString()

      // 一次性任务执行后自动禁用
      const updates: Partial<ScheduledTask> = {
        status: 'idle',
        lastRunAt: now,
        lastResult: { ...result, startedAt: now, finishedAt },
        runCount: task.runCount + 1,
        updatedAt: finishedAt,
      }

      if (task.schedule.mode === 'once') {
        updates.enabled = false
      }

      updateTask(task.id, updates)

      // 刷新 nextRunAt
      const updated = { ...task, ...updates, lastRunAt: now }
      this.refreshNextRun(updated as ScheduledTask)

      gclawEventBus.notify(projectId, 'task:completed', 'scheduler', {
        taskId: task.id,
        taskName: task.name,
        success: result.success,
      })
    } catch (err) {
      const finishedAt = new Date().toISOString()
      const errorMsg = err instanceof Error ? err.message : String(err)

      updateTask(task.id, {
        status: 'error',
        lastRunAt: now,
        lastResult: {
          success: false,
          startedAt: now,
          finishedAt,
          error: errorMsg,
        },
        runCount: task.runCount + 1,
        updatedAt: finishedAt,
      })

      gclawEventBus.notify(projectId, 'task:failed', 'scheduler', {
        taskId: task.id,
        taskName: task.name,
        error: errorMsg,
      })
    } finally {
      this.runningTasks.delete(task.id)
    }
  }
}

/** 全局单例（创建后自动启动） */
let _scheduler: TaskScheduler | undefined

export function getScheduler(): TaskScheduler {
  if (!_scheduler) {
    _scheduler = (globalThis as unknown as Record<string, TaskScheduler>)[GLOBAL_KEY]
    if (!_scheduler) {
      _scheduler = new TaskScheduler()
      ;(globalThis as unknown as Record<string, TaskScheduler>)[GLOBAL_KEY] = _scheduler
    }
    // 自动启动
    _scheduler.start()
  }
  return _scheduler
}

/** 兼容：直接导出时 lazy 初始化 */
export const taskScheduler = new Proxy({} as TaskScheduler, {
  get(_target, prop: string) {
    return (getScheduler() as unknown as Record<string, unknown>)[prop]
  },
})
