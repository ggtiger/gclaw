import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '@/lib/logger'

const PROJECT_ROOT = process.cwd()

// 默认远程仓库地址（可被设置覆盖）
const DEFAULT_REPO_URL = 'https://github.com/ggtiger/gclaw.git'

export interface WorktreeInfo {
  path: string
  branch: string
}

function execGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: cwd || PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

/** 检查 git 是否可用 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await execGit(['--version'], '/')
    return true
  } catch {
    return false
  }
}

/** 获取当前分支名（本地开发时） */
export async function getCurrentBranch(): Promise<string> {
  try {
    return await execGit(['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return 'main'
  }
}

/** 获取远程仓库 URL（本地开发时） */
export async function getRemoteUrl(): Promise<string | null> {
  try {
    return await execGit(['remote', 'get-url', 'origin'])
  } catch {
    return null
  }
}

/**
 * 获取仓库 URL：优先从设置读取，其次从本地 git 获取，最后用默认值
 */
export function getRepoUrl(settings?: { devRepoUrl?: string }): string {
  if (settings?.devRepoUrl) return settings.devRepoUrl
  // 同步获取 remoteUrl 不方便，直接用默认值
  return DEFAULT_REPO_URL
}

/**
 * 创建独立克隆（git clone）
 * 始终从远程 clone，不依赖本地 git 仓库
 */
export async function createWorktree(repoUrl?: string): Promise<WorktreeInfo> {
  const timestamp = Date.now().toString(36)
  const clonePath = path.join(PROJECT_ROOT, '..', `gclaw-dev-${timestamp}`)
  const url = repoUrl || DEFAULT_REPO_URL

  // 检查 git 可用
  if (!(await isGitAvailable())) {
    throw new Error('git 未安装或不在 PATH 中，无法使用开发模式')
  }

  logger.info(`[DevMode] Cloning from ${url} to ${clonePath}`)

  // 从远程 clone（shallow clone，速度快）
  await execGit(['clone', '--depth', '1', url, clonePath], path.dirname(clonePath))

  // 复制 .env 文件
  const envFile = path.join(PROJECT_ROOT, '.env')
  if (fs.existsSync(envFile)) {
    fs.copyFileSync(envFile, path.join(clonePath, '.env'))
  }

  // symlink node_modules（共享依赖，避免重复安装）
  const nodeModules = path.join(PROJECT_ROOT, 'node_modules')
  const cloneNodeModules = path.join(clonePath, 'node_modules')
  if (fs.existsSync(nodeModules) && !fs.existsSync(cloneNodeModules)) {
    fs.symlinkSync(nodeModules, cloneNodeModules, 'junction')
  }

  // symlink data 目录（共享数据）
  const dataDir = path.join(PROJECT_ROOT, 'data')
  const cloneDataDir = path.join(clonePath, 'data')
  if (fs.existsSync(dataDir) && !fs.existsSync(cloneDataDir)) {
    fs.symlinkSync(dataDir, cloneDataDir, 'junction')
  }

  // 如果是本地开发（有 .git），同步未提交的变更
  if (fs.existsSync(path.join(PROJECT_ROOT, '.git'))) {
    await syncWorkingChanges(clonePath)
  }

  logger.info(`[DevMode] Dev clone created: ${clonePath}`)
  return { path: clonePath, branch: 'main' }
}

/**
 * 移除克隆目录
 */
export async function removeWorktree(clonePath: string): Promise<void> {
  if (!fs.existsSync(clonePath)) {
    logger.warn(`[DevMode] Clone path does not exist: ${clonePath}`)
    return
  }

  // 先移除 symlink（避免 rm -rf 递归删除主项目数据）
  const symlinks = ['data', 'node_modules']
  for (const link of symlinks) {
    const linkPath = path.join(clonePath, link)
    try {
      if (fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink()) {
        fs.unlinkSync(linkPath)
      }
    } catch {
      // ignore
    }
  }

  try {
    fs.rmSync(clonePath, { recursive: true, force: true })
    logger.info(`[DevMode] Removed dev clone: ${clonePath}`)
  } catch (err) {
    logger.error(`[DevMode] Failed to delete clone:`, err)
  }
}

/**
 * 清理残留的 gclaw-dev 目录（启动时调用）
 */
export async function cleanupStaleWorktrees(): Promise<void> {
  try {
    const parentDir = path.dirname(PROJECT_ROOT)
    const entries = fs.readdirSync(parentDir)
    for (const entry of entries) {
      if (entry.startsWith('gclaw-dev-')) {
        const fullPath = path.join(parentDir, entry)
        try {
          if (fs.lstatSync(fullPath).isDirectory()) {
            for (const link of ['data', 'node_modules']) {
              const linkPath = path.join(fullPath, link)
              if (fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink()) {
                fs.unlinkSync(linkPath)
              }
            }
            fs.rmSync(fullPath, { recursive: true, force: true })
            logger.info(`[DevMode] Cleaned up stale clone: ${fullPath}`)
          }
        } catch (err) {
          logger.warn(`[DevMode] Failed to clean up ${fullPath}:`, err)
        }
      }
    }
  } catch (err) {
    logger.warn('[DevMode] Failed to cleanup stale clones:', err)
  }
}

/**
 * 同步未提交的变更到克隆目录（仅本地开发模式）
 */
async function syncWorkingChanges(clonePath: string): Promise<void> {
  const modified = await execGit(['diff', '--name-only', 'HEAD'])
  const untracked = await execGit(['ls-files', '--others', '--exclude-standard'])

  const allFiles = [...modified.split('\n'), ...untracked.split('\n')]
    .map(f => f.trim())
    .filter(f => f.length > 0)

  if (allFiles.length === 0) {
    logger.info('[DevMode] No uncommitted changes to sync')
    return
  }

  logger.info(`[DevMode] Syncing ${allFiles.length} uncommitted files to clone`)

  for (const file of allFiles) {
    const srcPath = path.join(PROJECT_ROOT, file)
    const destPath = path.join(clonePath, file)

    if (!fs.existsSync(srcPath)) continue

    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    const stat = fs.statSync(srcPath)
    if (stat.isDirectory()) continue

    fs.copyFileSync(srcPath, destPath)
  }

  logger.info(`[DevMode] Synced ${allFiles.length} files`)
}
