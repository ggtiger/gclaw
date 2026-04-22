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

/** 检查工作区是否干净（无未提交修改） */
export async function isWorkingTreeClean(): Promise<boolean> {
  const status = await execGit(['status', '--porcelain'])
  return status.length === 0
}

/** 获取当前分支名 */
export async function getCurrentBranch(): Promise<string> {
  return execGit(['rev-parse', '--abbrev-ref', 'HEAD'])
}

/** 获取当前 commit hash */
export async function getHeadCommit(): Promise<string> {
  return execGit(['rev-parse', '--short', 'HEAD'])
}

/**
 * 创建 git worktree
 * @returns worktree 信息（路径和分支名）
 */
export async function createWorktree(): Promise<WorktreeInfo> {
  const timestamp = Date.now().toString(36)
  const branchName = `gclaw-dev/${timestamp}`
  // worktree 放在项目根目录的同级目录
  const worktreePath = path.join(PROJECT_ROOT, '..', `.gclaw-dev-${timestamp}`)

  logger.info(`[DevMode] Creating worktree: ${worktreePath} on branch ${branchName}`)

  // 创建 worktree（基于当前 HEAD 创建新分支）
  await execGit(['worktree', 'add', worktreePath, '-b', branchName])

  // 同步未提交的变更（新增文件 + 修改文件）到 worktree
  await syncWorkingChanges(worktreePath)

  // 复制 .env 文件（如果存在）
  const envFile = path.join(PROJECT_ROOT, '.env')
  if (fs.existsSync(envFile)) {
    fs.copyFileSync(envFile, path.join(worktreePath, '.env'))
  }

  // symlink node_modules（共享依赖，避免重复安装）
  const nodeModules = path.join(PROJECT_ROOT, 'node_modules')
  const worktreeNodeModules = path.join(worktreePath, 'node_modules')
  if (fs.existsSync(nodeModules) && !fs.existsSync(worktreeNodeModules)) {
    fs.symlinkSync(nodeModules, worktreeNodeModules, 'junction')
  }

  // 注意：不 symlink .next！两个源码树必须各自有独立的构建缓存，
  // 否则 React Client Manifest 路径不匹配会导致 500 错误

  // symlink data 目录（共享数据）
  const dataDir = path.join(PROJECT_ROOT, 'data')
  const worktreeDataDir = path.join(worktreePath, 'data')
  if (fs.existsSync(dataDir) && !fs.existsSync(worktreeDataDir)) {
    fs.symlinkSync(dataDir, worktreeDataDir, 'junction')
  }

  logger.info(`[DevMode] Worktree created: ${worktreePath}`)
  return { path: worktreePath, branch: branchName }
}

/**
 * 移除 git worktree
 */
export async function removeWorktree(worktreePath: string): Promise<void> {
  if (!fs.existsSync(worktreePath)) {
    logger.warn(`[DevMode] Worktree path does not exist: ${worktreePath}`)
    return
  }

  // 先移除所有 symlink（避免 git worktree remove 递归删除主项目数据）
  const symlinks = ['data', 'node_modules']
  for (const link of symlinks) {
    const linkPath = path.join(worktreePath, link)
    try {
      if (fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink()) {
        fs.unlinkSync(linkPath)
      }
    } catch {
      // ignore
    }
  }

  logger.info(`[DevMode] Removing worktree: ${worktreePath}`)
  await execGit(['worktree', 'remove', worktreePath, '--force'])

  // 清理已合并的本地分支
  try {
    const branches = await execGit(['branch', '--merged', 'HEAD'])
    const mergedBranches = branches.split('\n')
      .map(b => b.trim())
      .filter(b => b.startsWith('gclaw-dev/'))
    for (const branch of mergedBranches) {
      await execGit(['branch', '-d', branch])
      logger.info(`[DevMode] Deleted merged branch: ${branch}`)
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * 列出所有 worktree
 */
export async function listWorktrees(): Promise<Array<{ path: string; branch: string; isMain: boolean }>> {
  const output = await execGit(['worktree', 'list', '--porcelain'])
  const worktrees: Array<{ path: string; branch: string; isMain: boolean }> = []

  let currentPath = ''
  let currentBranch = ''
  let isMain = false

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (currentPath) {
        worktrees.push({ path: currentPath, branch: currentBranch, isMain })
      }
      currentPath = line.slice('worktree '.length)
      isMain = false
    } else if (line.startsWith('branch ')) {
      currentBranch = line.slice('branch '.length).replace('refs/heads/', '')
      if (currentBranch === (await getCurrentBranch())) {
        isMain = true
      }
    }
  }
  if (currentPath) {
    worktrees.push({ path: currentPath, branch: currentBranch, isMain })
  }

  return worktrees
}

/**
 * 清理残留的 gclaw-dev worktree（启动时调用）
 */
export async function cleanupStaleWorktrees(): Promise<void> {
  try {
    const worktrees = await listWorktrees()
    for (const wt of worktrees) {
      if (wt.path.includes('.gclaw-dev-')) {
        logger.info(`[DevMode] Cleaning up stale worktree: ${wt.path}`)
        await removeWorktree(wt.path)
      }
    }
  } catch (err) {
    logger.warn('[DevMode] Failed to cleanup stale worktrees:', err)
  }
}

/**
 * 同步工作目录中未提交的变更到 worktree
 * 包括：修改的文件、新增的文件（untracked）
 */
async function syncWorkingChanges(worktreePath: string): Promise<void> {
  // 获取已修改（staged + unstaged）的文件
  const modified = await execGit(['diff', '--name-only', 'HEAD'])
  // 获取新增的 untracked 文件
  const untracked = await execGit(['ls-files', '--others', '--exclude-standard'])

  const allFiles = [...modified.split('\n'), ...untracked.split('\n')]
    .map(f => f.trim())
    .filter(f => f.length > 0)

  if (allFiles.length === 0) {
    logger.info('[DevMode] No uncommitted changes to sync')
    return
  }

  logger.info(`[DevMode] Syncing ${allFiles.length} uncommitted files to worktree`)

  for (const file of allFiles) {
    const srcPath = path.join(PROJECT_ROOT, file)
    const destPath = path.join(worktreePath, file)

    if (!fs.existsSync(srcPath)) {
      // 文件在 worktree 中已被 git 删除但本地存在的情况——跳过
      continue
    }

    // 确保目标目录存在
    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    // 跳过目录（如 node_modules, data 等）
    const stat = fs.statSync(srcPath)
    if (stat.isDirectory()) continue

    fs.copyFileSync(srcPath, destPath)
  }

  logger.info(`[DevMode] Synced ${allFiles.length} files`)
}
