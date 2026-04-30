import { NextRequest } from 'next/server'
import {
  getProjects,
  getProjectsForUser,
  getProjectById,
  createProject,
  deleteProject,
  renameProject,
  ensureDefaultProject,
  enrichWithOwnerName,
} from '@/lib/store/projects'
import { getUserFolders, getProjectFolderMap } from '@/lib/store/folders'
import { getAllUsers } from '@/lib/store/users'
import { getProjectSettings } from '@/lib/store/settings'
import { addAuditLog } from '@/lib/store/audit-log'
import { getAuthUser } from '@/lib/auth/helpers'
import { getDefaultSkills, getEnabledSkills, setEnabledSkills } from '@/lib/store/skills'
import { scanAvailableSkills } from '@/lib/claude/skills-dir'
import type { ProjectMode, ProjectType } from '@/types/skills'
import { initializeProjectAgents } from '@/lib/modes/template-initializer'

export const dynamic = 'force-dynamic'

/**
 * 补救迁移：为没有启用技能的项目自动启用内置技能
 * 解决打包后首次创建的默认项目未启用 memory-recall 等技能的问题
 */
function ensureProjectSkills(projects: { id: string }[]) {
  const defaultSkills = getDefaultSkills()
  const useDefault = defaultSkills.length > 0

  for (const project of projects) {
    const enabled = getEnabledSkills(project.id)
    if (enabled.length > 0) continue // 已有技能配置，跳过

    // 无技能配置 → 自动启用
    if (useDefault) {
      setEnabledSkills(project.id, defaultSkills)
    } else {
      const builtInSkills = scanAvailableSkills().filter(s => s.builtIn).map(s => s.name)
      if (builtInSkills.length > 0) {
        setEnabledSkills(project.id, builtInSkills)
      }
    }
  }
}

export async function GET(request: NextRequest) {
  const user = getAuthUser(request)

  // admin 可看到所有项目；普通用户只看自己的和参与的
  // 任何用户无项目时自动创建默认秘书项目
  let projects = user
    ? (user.role === 'admin'
        ? (() => {
            const list = getProjects()
            if (list.length === 0) {
              ensureDefaultProject(user.userId)
              return getProjects()
            }
            return list
          })()
        : (() => {
            const list = getProjectsForUser(user.userId)
            if (list.length === 0) {
              ensureDefaultProject(user.userId)
              return getProjectsForUser(user.userId)
            }
            return list
          })())
    : getProjects()

  // 补救：为未配置技能的项目自动启用内置技能（解决打包后首次启动问题）
  ensureProjectSkills(projects)

  // admin 视角附加 ownerName
  if (user?.role === 'admin') {
    projects = enrichWithOwnerName(projects)
  }

  // 返回当前用户的文件夹和项目映射
  const folders = user ? getUserFolders(user.userId) : []
  const projectFolderMap = user ? getProjectFolderMap(user.userId) : {}

  // admin 视角：附带 ownerMeta（头像、角色）用于侧边栏多用户分组显示
  let ownerMeta: Record<string, { username: string; role: string; avatarUrl?: string }> = {}
  if (user?.role === 'admin') {
    const allUsers = getAllUsers()
    const ownerIds = new Set(projects.map(p => p.ownerId).filter(Boolean))
    allUsers.forEach(u => {
      if (ownerIds.has(u.id)) {
        ownerMeta[u.id] = { username: u.username, role: u.role, avatarUrl: u.avatarUrl }
      }
    })
  }

  // 批量读取项目助理图标信息，用于侧边栏渲染
  const projectAssistantIcons: Record<string, { assistantIcon?: string; assistantAvatar?: string }> = {}
  projects.forEach(p => {
    const s = getProjectSettings(p.id)
    projectAssistantIcons[p.id] = { assistantIcon: s.assistantIcon, assistantAvatar: s.assistantAvatar }
  })

  return Response.json({ projects, folders, projectFolderMap, ownerMeta, projectAssistantIcons })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, mode } = body

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  // 验证 type 是否为有效值，如果未提供默认为 'development'
  const validTypes: ProjectType[] = ['secretary', 'development', 'office']
  const projectType: ProjectType = validTypes.includes(type) ? type : 'development'

  // 验证 mode 是否为有效值
  const validModes: ProjectMode[] = ['team', 'government', 'company', 'classroom']
  const projectMode: ProjectMode | undefined = validModes.includes(mode) ? mode : undefined

  const user = getAuthUser(request)
  const project = createProject(name.trim(), user?.userId, projectType, projectMode)
  addAuditLog('project:create', user?.username || 'system', { projectName: name.trim(), type: projectType, mode: projectMode }, project.id)

  // 应用默认技能
  const defaultSkills = getDefaultSkills()
  if (defaultSkills.length > 0) {
    setEnabledSkills(project.id, defaultSkills)
  } else {
    // 无全局默认配置时，默认启用平台自带技能
    const builtInSkills = scanAvailableSkills().filter(s => s.builtIn).map(s => s.name)
    if (builtInSkills.length > 0) {
      setEnabledSkills(project.id, builtInSkills)
    }
  }

  // 按模式初始化 Agent
  if (projectMode) {
    initializeProjectAgents(project.id, name.trim(), projectMode)
  }

  return Response.json({ project })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, name } = body

  if (!id || !name) {
    return Response.json({ error: 'id and name are required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  renameProject(id, name.trim())
  addAuditLog('project:update', user?.username || 'system', { newName: name.trim() }, id)
  return Response.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  const user = getAuthUser(request)
  const project = getProjectById(id)

  // 秘书类型项目不允许删除
  if (!project || project.type === 'secretary') {
    return Response.json({ error: '秘书项目不允许删除' }, { status: 403 })
  }

  deleteProject(id)
  addAuditLog('project:delete', user?.username || 'system', { projectId: id })
  return Response.json({ success: true })
}
