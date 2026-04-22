/**
 * DevModeManager — 开发模式全局单例
 *
 * 管理开发模式的完整生命周期：
 * OFF → INITIALIZING → ACTIVE → SHUTTING_DOWN → OFF
 */

import { ChildProcess } from 'child_process'
import path from 'path'
import { logger } from '@/lib/logger'
import {
  isGitRepo,
  isWorkingTreeClean,
  getCurrentBranch,
  createWorktree,
  removeWorktree,
  cleanupStaleWorktrees,
  type WorktreeInfo,
} from './worktree'
import { startDevServer, stopDevServer, type DevServerInfo } from './dev-server'
import { createProject, deleteProject, getProjects } from '@/lib/store/projects'
import { updateProjectSettings } from '@/lib/store/settings'

// ── 类型 ──

export type DevModeState = 'off' | 'initializing' | 'active' | 'shutting_down'

export interface DevModeStatus {
  state: DevModeState
  worktreePath?: string
  devBranch?: string
  devServerPort?: number
  previewUrl?: string
  mainBranch?: string
  projectId?: string  // dev mode 自动创建的项目 ID
  error?: string
}

// ── globalThis 单例 ──

const g = globalThis as Record<string, unknown>

interface DevModeStateInternal {
  state: DevModeState
  worktreeInfo: WorktreeInfo | null
  devServerProcess: ChildProcess | null
  devServerInfo: DevServerInfo | null
  mainBranch: string
  error: string | null
  projectId: string | null
  ownerId: string | null  // dev mode 自动创建的项目
}

function getInternalState(): DevModeStateInternal {
  return (
    (g.__gclaw_dev_mode__ as DevModeStateInternal) ??
    ((g.__gclaw_dev_mode__ = {
      state: 'off',
      worktreeInfo: null,
      devServerProcess: null,
      devServerInfo: null,
      mainBranch: 'main',
      error: null,
      projectId: null,
      ownerId: null,
    }) as DevModeStateInternal)
  )
}

// ── 公共 API ──

export function getDevModeStatus(): DevModeStatus {
  const s = getInternalState()

  // 健壮性检查：如果 dev mode 活跃但项目被删，自动重建
  if (s.state === 'active' && s.projectId && s.worktreeInfo) {
    const { getProjectById } = require('@/lib/store/projects')
    const project = getProjectById(s.projectId)
    if (!project) {
      logger.warn(`[DevMode] Dev project ${s.projectId} was deleted, recreating...`)
      try {
        const newProject = createProject('GClaw 开发模式', s.ownerId || undefined, 'development')
        updateProjectSettings(newProject.id, {
          cwd: s.worktreeInfo.path,
          dangerouslySkipPermissions: true,
          systemPrompt: `你是 GClaw 的开发助手。当前处于开发模式，工作目录是 GClaw 源代码的 Git worktree。
你可以直接修改源代码文件，修改会实时反映在预览面板中。
修改完成后，用户可以通过部署功能将变更应用到主项目。`,
        })
        s.projectId = newProject.id
        logger.info(`[DevMode] Recreated dev project: ${newProject.id}`)
      } catch (err) {
        logger.error('[DevMode] Failed to recreate dev project:', err)
      }
    }
  }

  return {
    state: s.state,
    worktreePath: s.worktreeInfo?.path,
    devBranch: s.worktreeInfo?.branch,
    devServerPort: s.devServerInfo?.port,
    previewUrl: s.devServerInfo?.url,
    mainBranch: s.mainBranch,
    projectId: s.projectId ?? undefined,
    error: s.error ?? undefined,
  }
}

export async function enableDevMode(userId?: string): Promise<DevModeStatus> {
  const s = getInternalState()

  if (s.state !== 'off') {
    return { ...getDevModeStatus(), error: `Dev mode is already ${s.state}` }
  }

  s.state = 'initializing'
  s.error = null
  logger.info('[DevMode] Enabling dev mode...')

  try {
    // Step 1: 检查 git 环境
    if (!(await isGitRepo())) {
      throw new Error('当前目录不是 git 仓库，无法启用开发模式')
    }

    // Step 2: 保存当前分支
    s.mainBranch = await getCurrentBranch()

    // Step 3: 创建 worktree
    const worktree = await createWorktree()
    s.worktreeInfo = worktree
    logger.info(`[DevMode] Worktree created: ${worktree.path}`)

    // Step 4: 启动 dev server
    const server = await startDevServer(worktree.path)
    s.devServerInfo = server
    s.devServerProcess = server.process
    logger.info(`[DevMode] Dev server started on port ${server.port}`)

    // Step 5: 自动创建 dev mode 项目（cwd 指向 worktree）
    const project = createProject('GClaw 开发模式', userId, 'development')
    updateProjectSettings(project.id, {
      cwd: worktree.path,
      dangerouslySkipPermissions: true,
      systemPrompt: `你是 GClaw 的开发助手。当前处于开发模式，工作目录是 GClaw 源代码的 Git worktree。
你可以直接修改源代码文件，修改会实时反映在预览面板中（dev server 运行在 ${server.url}）。
修改完成后，用户可以通过部署功能将变更应用到主项目。`,
    })
    s.projectId = project.id
    s.ownerId = userId || null
    logger.info(`[DevMode] Created dev mode project: ${project.id}`)

    s.state = 'active'
    return getDevModeStatus()
  } catch (err) {
    s.state = 'off'
    s.error = (err as Error).message
    logger.error('[DevMode] Failed to enable dev mode:', err)

    // 清理已创建的资源
    if (s.worktreeInfo) {
      try { await removeWorktree(s.worktreeInfo.path) } catch { /* ignore */ }
      s.worktreeInfo = null
    }
    if (s.devServerProcess) {
      stopDevServer(s.devServerProcess)
      s.devServerProcess = null
    }

    return getDevModeStatus()
  }
}

export async function disableDevMode(options?: { keepWorktree?: boolean }): Promise<DevModeStatus> {
  const s = getInternalState()

  if (s.state === 'off') {
    return getDevModeStatus()
  }

  s.state = 'shutting_down'
  logger.info('[DevMode] Disabling dev mode...')

  try {
    // Step 1: 停止 dev server
    if (s.devServerProcess) {
      stopDevServer(s.devServerProcess)
      s.devServerProcess = null
    }
    s.devServerInfo = null

    // Step 2: 删除 dev mode 项目
    if (s.projectId) {
      try { deleteProject(s.projectId) } catch { /* ignore */ }
      s.projectId = null
    }

    // Step 3: 清理 worktree
    if (s.worktreeInfo && !options?.keepWorktree) {
      await removeWorktree(s.worktreeInfo.path)
    }
    s.worktreeInfo = null

    s.state = 'off'
    s.error = null
    logger.info('[DevMode] Dev mode disabled')
  } catch (err) {
    s.error = (err as Error).message
    logger.error('[DevMode] Error disabling dev mode:', err)
    s.state = 'off' // 确保状态恢复
  }

  return getDevModeStatus()
}

/** 获取 worktree 路径（供外部使用，如创建开发项目） */
export function getWorktreePath(): string | null {
  return getInternalState().worktreeInfo?.path ?? null
}

/** 获取 dev server 进程引用（内部用） */
export function _setDevServerProcess(proc: ChildProcess | null): void {
  getInternalState().devServerProcess = proc
}

/** 启动时清理残留 worktree */
export async function initCleanup(): Promise<void> {
  await cleanupStaleWorktrees()
}
