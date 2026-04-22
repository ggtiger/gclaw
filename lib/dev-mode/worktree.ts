import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '@/lib/logger'

const PROJECT_ROOT = process.cwd()

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

/** 检查当前目录是否在 git 仓库中 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await execGit(['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

/** 获取当前分支名 */
export async function getCurrentBranch(): Promise<string> {
  return execGit(['rev-parse', '--abbrev-ref', 'HEAD'])
}

/** 获取远程仓库 URL */
export async function getRemoteUrl(): Promise<string | null> {
  try {
    return await execGit(['remote', 'get-url', 'origin'])
  } catch {
    return null
  }
}

/**
 * 创建独立克隆（git clone，非 worktree）
 * 优先从远程 clone（干净状态），回退到从本地 clone
 */
export async function createWorktree(): Promise<WorktreeInfo> {
  const timestamp = Date.now().toString(36)
  const branchName = `main`
  const clonePath = path.join(PROJECT_ROOT, '..', `gclaw-dev-${timestamp}`)

  logger.info(`[DevMode] Creating dev clone: ${clonePath}`)

  // 优先从远程 clone，回退到本地 clone
  const remoteUrl = await getRemoteUrl()
  let cloned = false

  if (remoteUrl) {
    try {
      logger.info(`[DevMode] Cloning from remote: ${remoteUrl}`)
      await execGit(['clone', '--depth', '1', remoteUrl, clonePath], path.dirname(clonePath))
      cloned = true
    } catch (err) {
      logger.warn(`[DevMode] Remote clone failed, falling back to local:`, err)
    }
  }

  if (!cloned) {
    logger.info(`[DevMode] Cloning from local repo`)
    await execGit(['clone', '--depth', '1', PROJECT_ROOT, clonePath], path.dirname(clonePath))
  }

  // 复制 .env 文件
  const envFile = path.join(PROJECT_ROOT, '.env')
  if (fs.existsSync(envFile)) {
    fs.copyFileSync(envFile, path.join(clonePath, '.env'))
  }

  // symlink node_modules（共享依赖）
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

  // 同步未提交的变更到克隆目录（确保开发环境包含最新代码）
  await syncWorkingChanges(clonePath)

  logger.info(`[DevMode] Dev clone created: ${clonePath}`)
  return { path: clonePath, branch: branchName }
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

  // 删除克隆目录（独立的 git repo，直接 rm -rf 即可）
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
            // 先移除 symlink
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
 * 同步未提交的变更到克隆目录
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
