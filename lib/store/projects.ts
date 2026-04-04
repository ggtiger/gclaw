import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ProjectInfo, ProjectMember, ProjectRole, ProjectType } from '@/types/skills'
import { getAllUsers } from './users'
import { addAuditLog } from './audit-log'

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
    const projects = Array.isArray(data.projects) ? data.projects : []
    // 兼容旧数据：没有 type 字段的项目默认为 secretary
    return projects.map((p: ProjectInfo) => ({
      ...p,
      type: p.type || 'secretary',
    }))
  } catch {
    return []
  }
}

export function getProjectsByOwner(userId: string): ProjectInfo[] {
  return getProjects().filter(p =>
    p.ownerId === userId ||
    p.members?.some(m => m.userId === userId)
  )
}

export function getProjectsForUser(userId: string, role?: 'admin'): ProjectInfo[] {
  if (role === 'admin') return getProjects()
  return getProjects().filter(p =>
    !p.ownerId ||
    p.ownerId === userId ||
    p.members?.some(m => m.userId === userId)
  )
}

/**
 * 给项目列表附加 ownerName（从用户表批量查询）
 */
export function enrichWithOwnerName(projects: ProjectInfo[]): ProjectInfo[] {
  const users = getAllUsers()
  const userMap = new Map(users.map(u => [u.id, u.username]))
  return projects.map(p => ({
    ...p,
    ownerName: p.ownerId ? (userMap.get(p.ownerId) || p.ownerId.slice(0, 8)) : undefined,
  }))
}

export function saveProjects(list: ProjectInfo[]) {
  ensureDataDir()
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: list }, null, 2), 'utf-8')
}

/**
 * 验证 projectId 是否安全（无路径遍历）
 * 合法的 projectId 只包含字母、数字、连字符
 */
export function isValidProjectId(id: string): boolean {
  if (!id || typeof id !== 'string') return false
  // projectId 由 randomUUID().slice(0, 8) 生成，只包含十六进制字符
  return /^[a-f0-9]{8}$/.test(id)
}

/**
 * 断言 projectId 合法，否则抛出错误
 */
export function assertValidProjectId(id: string): void {
  if (!isValidProjectId(id)) {
    throw new Error(`Invalid projectId: ${id}`)
  }
}

export function getProjectDir(projectId: string): string {
  assertValidProjectId(projectId)
  return path.join(PROJECTS_DIR, projectId)
}

export function getProjectById(id: string): ProjectInfo | undefined {
  return getProjects().find(p => p.id === id)
}

export function createProject(name: string, ownerId?: string, type: ProjectType = 'secretary'): ProjectInfo {
  ensureDataDir()
  const id = randomUUID().slice(0, 8)
  const now = new Date().toISOString()
  const members: ProjectMember[] = ownerId ? [{
    userId: ownerId,
    username: '',
    role: 'owner',
    joinedAt: now,
  }] : []

  const project: ProjectInfo = { id, name, type, ownerId, members, createdAt: now, updatedAt: now }

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

// ── 成员管理 ──

function resolveUsername(userId: string): string {
  const users = getAllUsers()
  return users.find(u => u.id === userId)?.username || userId.slice(0, 8)
}

export function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole = 'editor',
  actorName?: string
): { success: boolean; error?: string } {
  const list = getProjects()
  const project = list.find(p => p.id === projectId)
  if (!project) return { success: false, error: '项目不存在' }

  if (!project.members) project.members = []

  if (project.members.length >= 50) {
    return { success: false, error: '项目成员数已达上限' }
  }

  if (project.members.some(m => m.userId === userId)) {
    return { success: false, error: '用户已是项目成员' }
  }

  project.members.push({
    userId,
    username: resolveUsername(userId),
    role,
    joinedAt: new Date().toISOString(),
  })
  project.updatedAt = new Date().toISOString()
  saveProjects(list)

  addAuditLog('project:member-add', actorName || 'system', {
    projectId,
    targetUserId: userId,
    role,
  })

  return { success: true }
}

export function removeProjectMember(
  projectId: string,
  userId: string,
  actorName?: string
): { success: boolean; error?: string } {
  const list = getProjects()
  const project = list.find(p => p.id === projectId)
  if (!project) return { success: false, error: '项目不存在' }

  if (!project.members) return { success: false, error: '用户不是项目成员' }

  const member = project.members.find(m => m.userId === userId)
  if (!member) return { success: false, error: '用户不是项目成员' }

  if (member.role === 'owner') {
    return { success: false, error: '不能移除项目所有者' }
  }

  project.members = project.members.filter(m => m.userId !== userId)
  project.updatedAt = new Date().toISOString()
  saveProjects(list)

  addAuditLog('project:member-remove', actorName || 'system', {
    projectId,
    targetUserId: userId,
  })

  return { success: true }
}

export function updateProjectMemberRole(
  projectId: string,
  userId: string,
  newRole: ProjectRole,
  actorName?: string
): { success: boolean; error?: string } {
  const list = getProjects()
  const project = list.find(p => p.id === projectId)
  if (!project) return { success: false, error: '项目不存在' }

  if (!project.members) return { success: false, error: '用户不是项目成员' }

  const member = project.members.find(m => m.userId === userId)
  if (!member) return { success: false, error: '用户不是项目成员' }

  if (member.role === 'owner') {
    return { success: false, error: '不能修改所有者角色' }
  }

  member.role = newRole
  project.updatedAt = new Date().toISOString()
  saveProjects(list)

  addAuditLog('project:member-role-update', actorName || 'system', {
    projectId,
    targetUserId: userId,
    newRole,
  })

  return { success: true }
}

export function getProjectMemberRole(
  projectId: string,
  userId: string
): ProjectRole | null {
  const project = getProjectById(projectId)
  if (!project) return null

  // owner
  if (project.ownerId === userId) return 'owner'

  // member
  const member = project.members?.find(m => m.userId === userId)
  return member?.role || null
}

/**
 * 确保至少有一个项目。若无项目，创建"默认项目"并迁移旧数据。
 * 若当前用户的项目列表为空，为其创建一个默认项目。
 * 返回默认项目 ID。
 */
export function ensureDefaultProject(ownerId?: string): string {
  const list = getProjects()

  // 如果用户已登录，检查用户是否有自己的项目，没有则创建一个
  if (ownerId) {
    const userProjects = list.filter(p =>
      p.ownerId === ownerId || p.members?.some(m => m.userId === ownerId)
    )
    if (userProjects.length > 0) return userProjects[0].id
  } else if (list.length > 0) {
    return list[0].id
  }

  // 创建默认项目（秘书类型）
  const project = createProject('默认项目', ownerId, 'secretary')
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
