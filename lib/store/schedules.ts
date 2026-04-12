/**
 * 定时任务持久化
 * 全局任务: data/schedules.json
 * 项目级任务: data/projects/{id}/.data/schedules.json
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ScheduledTask } from '@/types/schedules'
import { DATA_DIR, getProjectDataDir, isValidProjectId } from './projects'

const GLOBAL_FILE = path.join(DATA_DIR, 'schedules.json')

function getProjectFile(projectId: string): string {
  return path.join(getProjectDataDir(projectId), 'schedules.json')
}

function readGlobalTasks(): ScheduledTask[] {
  try {
    if (!fs.existsSync(GLOBAL_FILE)) return []
    const raw = fs.readFileSync(GLOBAL_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.tasks) ? data.tasks : []
  } catch {
    return []
  }
}

function writeGlobalTasks(tasks: ScheduledTask[]) {
  const dir = path.dirname(GLOBAL_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(GLOBAL_FILE, JSON.stringify({ tasks }, null, 2), 'utf-8')
}

function readProjectTasks(projectId: string): ScheduledTask[] {
  try {
    const file = getProjectFile(projectId)
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.tasks) ? data.tasks : []
  } catch {
    return []
  }
}

function writeProjectTasks(projectId: string, tasks: ScheduledTask[]) {
  const file = getProjectFile(projectId)
  fs.writeFileSync(file, JSON.stringify({ tasks }, null, 2), 'utf-8')
}

/** 获取所有任务（全局 + 项目级），支持按 projectId 过滤 */
export function getAllTasks(projectId?: string): ScheduledTask[] {
  const global = readGlobalTasks()
  if (projectId) {
    if (!isValidProjectId(projectId)) return global
    return [...global.filter(t => t.projectId === projectId), ...readProjectTasks(projectId)]
  }

  // 无 projectId 时收集所有项目的任务
  const all = [...global]
  const projectsDir = path.join(DATA_DIR, 'projects')
  if (fs.existsSync(projectsDir)) {
    for (const dir of fs.readdirSync(projectsDir)) {
      if (isValidProjectId(dir)) {
        all.push(...readProjectTasks(dir))
      }
    }
  }
  return all
}

/** 获取单个任务 */
export function getTask(id: string): ScheduledTask | undefined {
  // 先搜全局
  const global = readGlobalTasks()
  const found = global.find(t => t.id === id)
  if (found) return found

  // 再搜所有项目
  const projectsDir = path.join(DATA_DIR, 'projects')
  if (fs.existsSync(projectsDir)) {
    for (const dir of fs.readdirSync(projectsDir)) {
      if (isValidProjectId(dir)) {
        const found = readProjectTasks(dir).find(t => t.id === id)
        if (found) return found
      }
    }
  }
  return undefined
}

/** 创建任务 */
export function createTask(task: Omit<ScheduledTask, 'id' | 'runCount' | 'createdAt' | 'updatedAt'>): ScheduledTask {
  const now = new Date().toISOString()
  const newTask: ScheduledTask = {
    ...task,
    id: `task_${randomUUID().slice(0, 8)}`,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  if (task.projectId && isValidProjectId(task.projectId)) {
    const tasks = readProjectTasks(task.projectId)
    tasks.push(newTask)
    writeProjectTasks(task.projectId, tasks)
  } else {
    const tasks = readGlobalTasks()
    tasks.push(newTask)
    writeGlobalTasks(tasks)
  }

  return newTask
}

/** 更新任务 */
export function updateTask(id: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
  // 全局
  const global = readGlobalTasks()
  const gIdx = global.findIndex(t => t.id === id)
  if (gIdx >= 0) {
    global[gIdx] = { ...global[gIdx], ...updates, updatedAt: new Date().toISOString() }
    writeGlobalTasks(global)
    return global[gIdx]
  }

  // 项目级
  const projectsDir = path.join(DATA_DIR, 'projects')
  if (fs.existsSync(projectsDir)) {
    for (const dir of fs.readdirSync(projectsDir)) {
      if (!isValidProjectId(dir)) continue
      const tasks = readProjectTasks(dir)
      const idx = tasks.findIndex(t => t.id === id)
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() }
        writeProjectTasks(dir, tasks)
        return tasks[idx]
      }
    }
  }
  return null
}

/** 删除任务 */
export function deleteTask(id: string): boolean {
  // 全局
  const global = readGlobalTasks()
  const gIdx = global.findIndex(t => t.id === id)
  if (gIdx >= 0) {
    global.splice(gIdx, 1)
    writeGlobalTasks(global)
    return true
  }

  // 项目级
  const projectsDir = path.join(DATA_DIR, 'projects')
  if (fs.existsSync(projectsDir)) {
    for (const dir of fs.readdirSync(projectsDir)) {
      if (!isValidProjectId(dir)) continue
      const tasks = readProjectTasks(dir)
      const idx = tasks.findIndex(t => t.id === id)
      if (idx >= 0) {
        tasks.splice(idx, 1)
        writeProjectTasks(dir, tasks)
        return true
      }
    }
  }
  return false
}
