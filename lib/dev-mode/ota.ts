import { execFile } from 'child_process'
import path from 'path'
import { logger } from '@/lib/logger'

const PROJECT_ROOT = process.cwd()

function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: cwd || PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

export interface OTAStatus {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  remoteUrl?: string
  error?: string
}

export interface OTAResult {
  success: boolean
  error?: string
  output?: string
}

/**
 * 检查远程是否有更新
 */
export async function checkForUpdate(): Promise<OTAStatus> {
  try {
    // 获取当前 commit
    const currentCommit = await exec('git', ['rev-parse', '--short', 'HEAD'])

    // fetch 远程
    await exec('git', ['fetch', 'origin'])

    // 比较本地和远程 HEAD
    const remoteHead = await exec('git', ['rev-parse', '--short', 'origin/main'])
    const localHead = await exec('git', ['rev-parse', '--short', 'HEAD'])

    const behind = parseInt(
      await exec('git', ['rev-list', '--count', 'HEAD..origin/main']),
      10
    )

    const remoteUrl = await exec('git', ['remote', 'get-url', 'origin'])

    return {
      hasUpdate: behind > 0,
      currentVersion: localHead,
      latestVersion: remoteHead,
      remoteUrl,
    }
  } catch (err) {
    return {
      hasUpdate: false,
      currentVersion: 'unknown',
      error: (err as Error).message,
    }
  }
}

/**
 * 拉取远程更新并重新构建
 */
export async function pullAndUpdate(): Promise<OTAResult> {
  try {
    // 检查工作区是否干净
    const status = await exec('git', ['status', '--porcelain'])
    if (status) {
      // 有未提交的修改，先 stash
      logger.info('[OTA] Stashing local changes before pull')
      await exec('git', ['stash'])
    }

    // 拉取更新
    logger.info('[OTA] Pulling updates from origin')
    const pullOutput = await exec('git', ['pull', 'origin', 'main'])

    // 检查 package.json 是否有变更
    const diffFiles = await exec('git', ['diff', '--name-only', 'HEAD@{1}', 'HEAD'])
    const needsInstall = diffFiles.split('\n').some(f =>
      f === 'package.json' || f === 'package-lock.json'
    )

    if (needsInstall) {
      logger.info('[OTA] Dependencies changed, running npm install')
      await exec('npm', ['install'])
    }

    // 构建
    logger.info('[OTA] Building updated version')
    const buildOutput = await exec('npm', ['run', 'build'])

    logger.info('[OTA] Update complete')
    return { success: true, output: pullOutput + '\n' + buildOutput }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
