/**
 * Tauri 应用自动更新封装
 * 检查更新 → 下载 → 安装 → 重启
 *
 * 支持两种更新通道：
 * - Server 热更新：通过 bsdiff delta patch 更新 server/ 目录（无需重启应用）
 * - Tauri 全量更新：通过 tauri-plugin-updater 更新整个应用
 */

import { isTauri } from './tauri'

export interface UpdateProgress {
  /** 已下载字节数 */
  downloaded: number
  /** 总字节数（可能为 0） */
  total: number
  /** 下载百分比 0~100 */
  percent: number
}

export interface UpdateInfo {
  version: string
  date?: string
  body?: string
}

export type UpdateStatus =
  | 'idle'          // 空闲
  | 'checking'      // 检查中
  | 'available'     // 发现新版本
  | 'downloading'   // 下载中
  | 'downloaded'    // 下载完成
  | 'error'         // 出错

// ============ Server Delta 类型 ============

export interface ServerDelta {
  from: string
  url: string
  size: number
  hash: string
  targetHash: string
}

export interface ServerUpdateInfo {
  /** 新 server 版本号 */
  version: string
  /** 匹配的 delta（null 表示无可用 delta，需走全量更新） */
  delta: ServerDelta | null
  /** 更新类型标签 */
  label: string
}

// ============ 全量更新（Tauri updater） ============

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const { getVersion } = await import('@tauri-apps/api/app')
    const currentVersion = await getVersion()
    console.log(`[Updater] 当前版本: ${currentVersion}, 开始检查更新...`)

    const update = await check({ timeout: 30000 })
    console.log('[Updater] 检查结果:', update ? `发现新版本 ${update.version}` : '已是最新', update)

    if (!update) return null

    return {
      version: update.version,
      date: update.date ?? undefined,
      body: update.body ?? undefined,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Updater] checkForUpdate 失败:', err)

    // 友好错误提示
    if (msg.includes('github.com') || msg.includes('gitee.com')) {
      throw new Error('网络连接失败，无法访问更新服务器。请检查网络后重试。')
    }
    throw err
  }
}

export async function downloadAndInstall(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  const { check } = await import('@tauri-apps/plugin-updater')
  const { relaunch } = await import('@tauri-apps/plugin-process')

  console.log('[Updater] 开始下载更新...')
  const update = await check({ timeout: 30000 })
  if (!update) throw new Error('没有可用更新')

  let downloaded = 0
  let totalSize = 0
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        downloaded = 0
        totalSize = event.data.contentLength ?? 0
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        if (onProgress) {
          onProgress({
            downloaded,
            total: totalSize,
            percent: totalSize > 0 ? Math.round(downloaded / totalSize * 100) : 0,
          })
        }
        break
      case 'Finished':
        if (onProgress) {
          onProgress({ downloaded, total: totalSize || downloaded, percent: 100 })
        }
        break
    }
  })

  await relaunch()
}

// ============ Server 热更新（delta patch） ============

/** 获取当前 server 版本号 */
export async function getCurrentServerVersion(): Promise<string> {
  if (!isTauri()) return 'unknown'
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('get_current_server_version')
}

/** 获取当前平台标识 */
function getPlatformKey(): string {
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  if (platform.includes('Mac') || ua.includes('Mac')) {
    // 检查架构 - Tauri 桌面端无法直接判断，使用通用 key
    return 'darwin-aarch64'
  }
  if (platform.includes('Win') || ua.includes('Windows')) {
    return 'windows-x86_64'
  }
  return 'linux-x86_64'
}

/**
 * 通过 Tauri Rust 端 curl 获取远程 JSON（绕过浏览器 CORS 限制）
 */
async function fetchJsonViaRust(url: string): Promise<Record<string, unknown> | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const body = await invoke<string>('fetch_url', { url })
    return JSON.parse(body) as Record<string, unknown>
  } catch (err) {
    console.log(`[Delta] fetch_url 失败 (${url}):`, err)
    return null
  }
}

/**
 * 通过 Gitee API 获取 latest.json
 */
async function fetchLatestJsonFromGitee(): Promise<Record<string, unknown> | null> {
  try {
    // 1. 通过 API 获取最新 release
    const apiResult = await fetchJsonViaRust(
      'https://gitee.com/api/v5/repos/laohu2022/gclaw/releases/latest',
    )
    if (!apiResult) return null

    const assets = apiResult.assets as Array<{ name: string; browser_download_url: string }> | undefined
    const asset = assets?.find(a => a.name === 'latest.json')
    if (!asset) return null

    // 2. 下载 latest.json
    return await fetchJsonViaRust(asset.browser_download_url)
  } catch {
    return null
  }
}

/**
 * 检查 server delta 更新
 * 从 latest.json 获取 serverVersion 和 serverDeltas 信息
 */
export async function checkServerDelta(): Promise<ServerUpdateInfo | null> {
  if (!isTauri()) return null

  try {
    const currentVersion = await getCurrentServerVersion()
    console.log(`[Delta] 当前 server 版本: ${currentVersion}`)

    // 依次尝试各端点获取 latest.json
    let latestJson: Record<string, unknown> | null = null

    // 1. Gitee（通过 API 解析最新 release）
    if (!latestJson) {
      console.log('[Delta] 尝试 Gitee...')
      latestJson = await fetchLatestJsonFromGitee()
    }

    // 2. GitHub 直链
    if (!latestJson) {
      console.log('[Delta] 尝试 GitHub...')
      latestJson = await fetchJsonViaRust(
        'https://github.com/ggtiger/gclaw/releases/latest/download/latest.json',
      )
    }

    if (!latestJson) {
      console.log('[Delta] 无法获取 latest.json')
      return null
    }

    const serverVersion = latestJson.serverVersion as string | undefined
    if (!serverVersion || serverVersion === currentVersion) {
      console.log(`[Delta] server 已是最新或无版本信息 (本地=${currentVersion}, 远程=${serverVersion})`)
      return null
    }

    const platformKey = getPlatformKey()
    const deltas = latestJson.serverDeltas as Record<string, ServerDelta[]> | undefined
    const platformDeltas = deltas?.[platformKey]

    // 查找匹配当前版本的 delta
    const matchedDelta = platformDeltas?.find(d => d.from === currentVersion) ?? null

    const sizeMB = matchedDelta
      ? (matchedDelta.size / 1024 / 1024).toFixed(1)
      : '~25'

    const label = matchedDelta
      ? `热更新 ~${sizeMB} MB`
      : `全量更新 ~25 MB`

    console.log(`[Delta] 发现 server 更新: ${currentVersion} → ${serverVersion}, ${label}`)

    return {
      version: serverVersion,
      delta: matchedDelta,
      label,
    }
  } catch (err) {
    console.error('[Delta] 检查 server delta 失败:', err)
    return null
  }
}

/**
 * 下载并应用 server delta 更新
 * 通过 Rust 端 curl 下载（绕过 CORS），成功后应用 delta
 */
export async function downloadAndApplyDelta(
  delta: ServerDelta,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<string> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  const { invoke } = await import('@tauri-apps/api/core')
  const { appDataDir, join } = await import('@tauri-apps/api/path')

  console.log(`[Delta] 开始下载 delta: ${delta.url}`)

  const dataDir = await appDataDir()
  const deltaFileName = delta.url.split('/').pop() ?? 'server.delta'
  const deltaPath = await join(dataDir, deltaFileName)

  onProgress?.({ downloaded: 0, total: delta.size, percent: 0 })

  // 通过 Rust 端 curl 下载（绕过 CORS）
  await invoke('download_file', { url: delta.url, path: deltaPath })

  onProgress?.({ downloaded: delta.size, total: delta.size, percent: 100 })

  // 调用 Rust 端应用 delta
  const newVersion = await invoke<string>('apply_server_delta', {
    deltaPath,
    targetHash: delta.targetHash,
  })

  console.log(`[Delta] 应用成功: server version = ${newVersion}`)
  return newVersion
}
