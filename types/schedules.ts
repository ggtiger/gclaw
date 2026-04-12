/**
 * 定时任务调度类型定义
 */

export type TaskType = 'chat-message' | 'execute-skill' | 'webhook' | 'script' | 'custom'

export interface TaskSchedule {
  mode: 'once' | 'interval' | 'cron'
  runAt?: string           // once: ISO 时间戳
  intervalMs?: number      // interval: 间隔毫秒
  cron?: string            // cron: 5 位标准表达式
}

export interface TaskResult {
  success: boolean
  startedAt: string
  finishedAt: string
  error?: string
  data?: Record<string, unknown>
}

export interface ScheduledTask {
  id: string               // task_{uuid8}
  name: string
  type: TaskType
  schedule: TaskSchedule
  config: Record<string, unknown>  // 由 executor 解析
  projectId?: string
  enabled: boolean
  status: 'idle' | 'running' | 'error'
  lastRunAt?: string
  lastResult?: TaskResult
  nextRunAt?: string
  runCount: number
  createdAt: string
  updatedAt: string
  createdBy?: string       // userId 或 'skill:xxx'
}

/** Skill gclaw-hooks.json 中的 schedules 声明 */
export interface SkillScheduleEntry {
  name: string
  type: TaskType
  schedule: TaskSchedule
  config: Record<string, unknown>
  enabled?: boolean
}
