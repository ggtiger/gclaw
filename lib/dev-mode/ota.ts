import { execFile } from 'child_process'
import path from 'path'
import { logger } from '@/lib/logger'
import { getGlobalSettings } from '@/lib/store/settings'

const PROJECT_ROOT = process.cwd()

// OTA 检查更新用的仓库地址
const REPO_URLS = [
  'https://github.com/ggtiger/gclaw.git',
]

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

/** 获取所有可用的远程源 URL */
function getRemoteUrls(): string[] {
  const custom = getGlobalSettings().devRepoUrl?.trim()
  if (custom) return [custom]
  return REPO_URLS
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
 * 尝试用多个远程源 fetch，返回成功用的 remote URL
 */
async function tryFetchRemotes(): Promise<string | null> {
  const urls = getRemoteUrls()

  // 确保 origin 指向第一个 URL
  try {
    const currentUrl = await exec('git', ['remote', 'get-url', 'origin']).catch(() => '')
    if (currentUrl !== urls[0]) {
      await exec('git', ['remote', 'set-url', 'origin', urls[0]])
    }
  } catch {
    await exec('git', ['remote', 'add', 'origin', urls[0]]).catch(() => {})
  }

  // 依次尝试 fetch
  for (const url of urls) {
    try {
      if (url !== urls[0]) {
        await exec('git', ['remote', 'set-url', 'origin', url])
      }
      await exec('git', ['fetch', 'origin'])
      return url
    } catch (err) {
      logger.warn(`[OTA] Fetch from ${url} failed: ${(err as Error).message}`)
    }
  }
  return null
}

/**
 * 检查远程是否有更新
 */
export async function checkForUpdate(): Promise<OTAStatus> {
  try {
    const currentCommit = await exec('git', ['rev-parse', '--short', 'HEAD'])

    const fetchUrl = await tryFetchRemotes()
    if (!fetchUrl) {
      return {
        hasUpdate: false,
        currentVersion: currentCommit,
        error: '所有源均无法连接，请检查网络或配置镜像地址',
      }
    }

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
      logger.info('[OTA] Stashing local changes before pull')
      await exec('git', ['stash'])
    }

    // 先 fetch 确定可用源
    const fetchUrl = await tryFetchRemotes()
    if (!fetchUrl) {
      return { success: false, error: '所有源均无法连接，请检查网络或配置镜像地址' }
    }

    // 拉取更新
    logger.info(`[OTA] Pulling updates from ${fetchUrl}`)
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
