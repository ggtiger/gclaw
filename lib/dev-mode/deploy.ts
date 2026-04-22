import { execFile, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '@/lib/logger'

const PROJECT_ROOT = process.cwd()

function exec(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

export interface DeployResult {
  success: boolean
  error?: string
  buildOutput?: string
}

/**
 * 在 worktree 中构建并部署到主项目
 */
export async function buildAndDeploy(worktreePath: string): Promise<DeployResult> {
  logger.info('[DevMode] Starting build in worktree:', worktreePath)

  try {
    // Step 1: 安装依赖（如果 package.json 有变更）
    const mainPkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'))
    const wtPkg = JSON.parse(fs.readFileSync(path.join(worktreePath, 'package.json'), 'utf-8'))
    if (JSON.stringify(mainPkg.dependencies) !== JSON.stringify(wtPkg.dependencies) ||
        JSON.stringify(mainPkg.devDependencies) !== JSON.stringify(wtPkg.devDependencies)) {
      logger.info('[DevMode] Dependencies changed, running npm install...')
      await exec('npm', ['install'], worktreePath)
    }

    // Step 2: 构建
    logger.info('[DevMode] Building...')
    const buildOutput = await exec('npm', ['run', 'build'], worktreePath)

    // Step 3: 备份当前版本
    const backupDir = path.join(PROJECT_ROOT, '.next-backup')
    const nextDir = path.join(PROJECT_ROOT, '.next')
    if (fs.existsSync(nextDir)) {
      if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true })
      }
      fs.renameSync(nextDir, backupDir)
      logger.info('[DevMode] Backed up current .next to .next-backup')
    }

    // Step 4: 复制构建产物
    const wtNextDir = path.join(worktreePath, '.next')
    if (!fs.existsSync(wtNextDir)) {
      return { success: false, error: 'Build output not found' }
    }

    // 复制 .next 目录
    copyDir(wtNextDir, nextDir)
    logger.info('[DevMode] Copied build output to main project')

    // Step 5: 复制 public 和 static 资源（如有变更）
    const wtPublic = path.join(worktreePath, 'public')
    const mainPublic = path.join(PROJECT_ROOT, 'public')
    if (fs.existsSync(wtPublic)) {
      copyDir(wtPublic, mainPublic)
    }

    logger.info('[DevMode] Deploy complete')
    return { success: true, buildOutput }
  } catch (err) {
    // 回滚：恢复备份
    const backupDir = path.join(PROJECT_ROOT, '.next-backup')
    const nextDir = path.join(PROJECT_ROOT, '.next')
    if (fs.existsSync(backupDir)) {
      try {
        if (fs.existsSync(nextDir)) fs.rmSync(nextDir, { recursive: true, force: true })
        fs.renameSync(backupDir, nextDir)
        logger.info('[DevMode] Rolled back to previous version')
      } catch (rollbackErr) {
        logger.error('[DevMode] Rollback failed:', rollbackErr)
      }
    }
    return { success: false, error: (err as Error).message }
  }
}

/**
 * 将 worktree 中的改动直接同步到主项目（不构建，适合 dev 模式）
 */
export async function syncChanges(worktreePath: string): Promise<DeployResult> {
  logger.info('[DevMode] Syncing changes from worktree to main project')
  try {
    // 使用 rsync 或 git diff + apply 来同步
    // 简单方式：用 git diff 生成 patch，然后 apply
    const diffOutput = await exec('git', ['diff', 'HEAD'], worktreePath)
    if (!diffOutput) {
      return { success: true, error: 'No changes to sync' }
    }

    // 将 patch 写入临时文件
    const patchFile = path.join(PROJECT_ROOT, '.gclaw-dev.patch')
    fs.writeFileSync(patchFile, diffOutput)

    // 在主项目中 apply patch
    await exec('git', ['apply', '--reject', '.gclaw-dev.patch'], PROJECT_ROOT)

    // 清理
    fs.unlinkSync(patchFile)

    logger.info('[DevMode] Changes synced successfully')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

/**
 * 清理备份目录
 */
export function cleanupBackup(): void {
  const backupDir = path.join(PROJECT_ROOT, '.next-backup')
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true })
  }
}

/** 递归复制目录 */
function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
