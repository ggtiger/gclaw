import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ProjectInfo } from '@/types/skills'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json')
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true })
}

export function getProjects(): ProjectInfo[] {
  ensureDataDir()
  try {
    if (!fs.existsSync(PROJECTS_FILE)) return []
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.projects) ? data.projects : []
  } catch {
    return []
  }
}

export function getProjectsByOwner(userId: string): ProjectInfo[] {
  return getProjects().filter(p => !p.ownerId || p.ownerId === userId)
}

export function saveProjects(list: ProjectInfo[]) {
  ensureDataDir()
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: list }, null, 2), 'utf-8')
}

export function getProjectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId)
}

export function createProject(name: string, ownerId?: string): ProjectInfo {
  ensureDataDir()
  const id = randomUUID().slice(0, 8)
  const now = new Date().toISOString()
  const project: ProjectInfo = { id, name, ownerId, createdAt: now, updatedAt: now }

  fs.mkdirSync(path.join(PROJECTS_DIR, id), { recursive: true })

  const list = getProjects()
  list.push(project)
  saveProjects(list)
  return project
}

export function deleteProject(id: string) {
  const list = getProjects().filter(p => p.id !== id)
  saveProjects(list)

  const dir = path.join(PROJECTS_DIR, id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function renameProject(id: string, name: string) {
  const list = getProjects()
  const p = list.find(p => p.id === id)
  if (p) {
    p.name = name
    p.updatedAt = new Date().toISOString()
    saveProjects(list)
  }
}

export function touchProject(id: string) {
  const list = getProjects()
  const p = list.find(p => p.id === id)
  if (p) {
    p.updatedAt = new Date().toISOString()
    saveProjects(list)
  }
}

/**
 * 确保至少有一个项目。若无项目，创建"默认项目"并迁移旧数据。
 * 返回默认项目 ID。
 */
export function ensureDefaultProject(): string {
  const list = getProjects()
  if (list.length > 0) return list[0].id

  // 创建默认项目
  const project = createProject('默认项目')
  const projectDir = getProjectDir(project.id)

  // 迁移旧数据文件
  const oldFiles = ['messages.json', 'enabled-skills.json', 'agents.json']
  for (const file of oldFiles) {
    const oldPath = path.join(DATA_DIR, file)
    if (fs.existsSync(oldPath)) {
      try {
        fs.copyFileSync(oldPath, path.join(projectDir, file))
        fs.unlinkSync(oldPath)
      } catch (err) {
        console.error(`[GClaw] Failed to migrate ${file}:`, err)
      }
    }
  }

  // 迁移旧 settings.json：拆分为全局 + 项目
  const oldSettingsPath = path.join(DATA_DIR, 'settings.json')
  if (fs.existsSync(oldSettingsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(oldSettingsPath, 'utf-8'))

      // 全局设置
      const globalSettings = {
        apiKey: raw.apiKey || '',
        apiBaseUrl: raw.apiBaseUrl || '',
        theme: raw.theme || 'system',
      }
      fs.writeFileSync(
        path.join(DATA_DIR, 'global.json'),
        JSON.stringify(globalSettings, null, 2),
        'utf-8'
      )

      // 项目设置
      const projectSettings = {
        model: raw.model || '',
        effort: raw.effort || 'medium',
        sessionId: raw.sessionId || '',
        cwd: raw.cwd || '',
        dangerouslySkipPermissions: raw.dangerouslySkipPermissions ?? true,
      }
      fs.writeFileSync(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(projectSettings, null, 2),
        'utf-8'
      )

      fs.unlinkSync(oldSettingsPath)
    } catch (err) {
      console.error('[GClaw] Failed to migrate settings:', err)
    }
  }

  return project.id
}
