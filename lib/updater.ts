/**
 * Tauri 应用自动更新封装
 * 检查更新 → 下载 → 安装 → 重启
 *
 * 支持两种更新通道：
 * - Server 热更新：通过文件级补丁（覆盖式）更新 server/ 目录
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
}

export interface ServerFullPackage {
  url: string
  cdnUrl?: string
  size: number
  hash: string
}

export interface ServerUpdateInfo {
  /** 新 server 版本号 */
  version: string
  /** 匹配的 delta（null 表示无可用 delta，需走全量更新） */
  delta: ServerDelta | null
  /** 全量 server 包信息（delta 不可用时的 fallback） */
  serverFull: ServerFullPackage | null
  /** 更新类型标签 */
  label: string
}

// ============ 全量更新（Tauri updater） ============

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null

  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const currentVersion = await getVersion()
    console.log(`[Updater] 当前版本: ${currentVersion}, 开始检查更新...`)

    // 先通过自定义的多端点重试获取 latest.json（Gitee API + GitHub，更可靠）
    const latestJson = await fetchLatestJsonWithRetry()
    if (latestJson) {
      const remoteVersion = (latestJson.version as string) || ''
      // 如果 latest.json 显示的 Tauri 壳版本没有更新，直接返回
      if (!remoteVersion || !isVersionNewer(remoteVersion, currentVersion)) {
        console.log(`[Updater] 已是最新版本 (本地=${currentVersion}, 远程=${remoteVersion})`)
        return null
      }
      console.log(`[Updater] 发现新版本 ${remoteVersion}，通过 Tauri updater 获取详情...`)
    }

    // 调用 Tauri updater 获取完整更新信息（包含下载 URL、签名等）
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check({ timeout: 15000 })
    console.log('[Updater] 检查结果:', update ? `发现新版本 ${update.version}` : '已是最新')

    if (!update) return null

    return {
      version: update.version,
      date: update.date ?? undefined,
      body: update.body ?? undefined,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Updater] checkForUpdate 失败:', msg)
    // 不再直接 throw，让调用方通过 allSettled 处理
    throw new Error(`全量更新检查失败: ${msg.includes('github.com') || msg.includes('gitee.com') ? '网络连接失败，无法访问更新服务器' : msg}`)
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

/** 获取当前平台标识（通过 Tauri plugin-os 获取准确信息） */
async function getPlatformKey(): Promise<string> {
  if (!isTauri()) return 'unknown'
  try {
    // 检查 Tauri OS plugin 是否可用
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window === 'undefined' || !(window as any).__TAURI_OS_PLUGIN_INTERNALS__) {
      console.warn('[Updater] Tauri OS plugin 未初始化，使用默认平台')
      return 'unknown'
    }
    const { platform, arch } = await import('@tauri-apps/plugin-os')
    const osMap: Record<string, string> = { macos: 'darwin', windows: 'windows', linux: 'linux' }
    return `${osMap[platform()] ?? platform()}-${arch()}`
  } catch (e) {
    console.error('[Updater] 获取平台信息失败:', e)
    return 'unknown'
  }
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

/** 比较两个 semver 版本号，返回 true 表示 remote 比 local 更新 */
function isVersionNewer(remote: string, local: string): boolean {
  const rParts = remote.split('.').map(Number)
  const lParts = local.split('.').map(Number)
  for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
    const r = rParts[i] ?? 0
    const l = lParts[i] ?? 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带重试的 latest.json 获取，依次尝试七牛云 CDN、Gitee 和 GitHub，每个端点支持指数退避重试
 */
async function fetchLatestJsonWithRetry(maxRetries = 2): Promise<Record<string, unknown> | null> {
  const endpoints: Array<() => Promise<Record<string, unknown> | null>> = [
    () => fetchJsonViaRust(`https://o09u11p5v.qnssl.com/gclaw/latest.json?t=${Date.now()}`),
    () => fetchLatestJsonFromGitee(),
    () => fetchJsonViaRust('https://github.com/ggtiger/gclaw/releases/latest/download/latest.json'),
  ]
  for (const fetchFn of endpoints) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fetchFn()
        if (result) return result
      } catch { /* ignore, retry */ }
      if (attempt < maxRetries) await delay(Math.pow(2, attempt) * 1000)
    }
  }
  return null
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

    // 通过带重试的方式获取 latest.json（依次尝试 Gitee、GitHub，支持指数退避）
    const latestJson = await fetchLatestJsonWithRetry()

    if (!latestJson) {
      console.log('[Delta] 无法获取 latest.json')
      return null
    }

    const serverVersion = latestJson.serverVersion as string | undefined
    if (!serverVersion || !isVersionNewer(serverVersion, currentVersion)) {
      console.log(`[Delta] server 已是最新或无需更新 (本地=${currentVersion}, 远程=${serverVersion})`)
      return null
    }

    const deltas = latestJson.serverDeltas as Record<string, ServerDelta[]> | undefined

    let matchedDelta: ServerDelta | null = null
    if (deltas && typeof deltas === 'object') {
      const platformKey = await getPlatformKey()
      const platformDeltas = deltas[platformKey]

      // 查找可用的 delta（文件级补丁是覆盖式的，from <= 当前版本即可使用，优先选最近的）
      matchedDelta = platformDeltas
        ?.filter(d => {
          const parts = (v: string) => v.split('.').map(Number)
          const [fa, fb, fc] = parts(d.from)
          const [ca, cb, cc] = parts(currentVersion)
          return fa < ca || (fa === ca && fb < cb) || (fa === ca && fb === cb && fc <= cc)
        })
        ?.sort((a, b) => {
          const parts = (v: string) => v.split('.').map(Number)
          const [aa, ab, ac] = parts(a.from)
          const [ba, bb, bc] = parts(b.from)
          return (ba - aa) || (bb - ab) || (bc - ac)  // 降序，优先选 from 最大的
        })[0] ?? null
    }

    if (matchedDelta) {
      const sizeLabel = matchedDelta.size >= 1024 * 1024
        ? `~${(matchedDelta.size / 1024 / 1024).toFixed(1)} MB`
        : `~${(matchedDelta.size / 1024).toFixed(0)} KB`
      const label = `热更新 ${sizeLabel}`
      console.log(`[Delta] 发现 server 更新: ${currentVersion} → ${serverVersion}, ${label}`)
      return { version: serverVersion, delta: matchedDelta, serverFull: null, label }
    } else {
      const serverFull = latestJson.serverFullUrl as ServerFullPackage | undefined
      if (serverFull) {
        const sizeMB = (serverFull.size / 1024 / 1024).toFixed(1)
        const label = `全量更新 ~${sizeMB} MB`
        console.log(`[Delta] 发现 server 更新: ${currentVersion} → ${serverVersion}, ${label}`)
        return { version: serverVersion, delta: null, serverFull, label }
      }
      const label = '全量更新 ~25 MB'
      console.log(`[Delta] 发现 server 更新: ${currentVersion} → ${serverVersion}, ${label}`)
      return { version: serverVersion, delta: null, serverFull: null, label }
    }
  } catch (err) {
    console.error('[Delta] 检查 server delta 失败:', err)
    return null
  }
}

/**
 * 下载 server 更新包（delta 或全量），仅下载 + hash 校验，返回本地路径
 */
export async function downloadServerUpdate(
  info: ServerUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<{ localPath: string; version: string }> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  const { invoke } = await import('@tauri-apps/api/core')
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const dataDir = await appDataDir()

  let downloadUrl: string
  let fallbackUrl: string | undefined
  let expectedHash: string | undefined
  let fileName: string

  if (info.delta) {
    downloadUrl = info.delta.url
    expectedHash = info.delta.hash
    fileName = info.delta.url.split('/').pop() ?? 'server.delta'
  } else if (info.serverFull) {
    // 全量包：优先 cdnUrl，回退 url
    downloadUrl = info.serverFull.cdnUrl ?? info.serverFull.url
    fallbackUrl = info.serverFull.cdnUrl ? info.serverFull.url : undefined
    expectedHash = info.serverFull.hash
    fileName = info.serverFull.url.split('/').pop() ?? 'server-full.tar.gz'
  } else {
    throw new Error('无可用的更新包（delta 和全量包均不可用）')
  }

  const localPath = await join(dataDir, fileName)
  console.log(`[Delta] 开始下载: ${downloadUrl}`)
  onProgress?.(0)

  // 下载文件（如有 cdnUrl 先尝试，失败回退）
  let downloaded = false
  try {
    await invoke('download_file', { url: downloadUrl, path: localPath })
    downloaded = true
  } catch (err) {
    if (fallbackUrl) {
      console.warn(`[Delta] CDN 下载失败，回退到源地址: ${fallbackUrl}`)
      await invoke('download_file', { url: fallbackUrl, path: localPath })
      downloaded = true
    } else {
      const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err))
      if (msg.includes('文件过小') || msg.includes('过小')) {
        throw new Error('下载的更新包无效（可能是网络返回了错误页面），请稍后重试')
      }
      throw new Error(`下载更新包失败: ${msg}`)
    }
  }

  if (!downloaded) throw new Error('下载更新包失败')
  onProgress?.(50)

  // hash 校验
  if (expectedHash) {
    const hashValid = await invoke<boolean>('verify_file_hash', {
      path: localPath,
      expectedHash,
    })
    if (!hashValid) {
      throw new Error('更新包 hash 校验失败，文件可能损坏')
    }
  }

  onProgress?.(100)
  console.log(`[Delta] 下载完成: ${localPath}`)
  return { localPath, version: info.version }
}

/**
 * 应用已下载的 server 更新包
 */
export async function applyServerUpdate(
  localPath: string,
  version: string,
  restartServer: boolean = true,
): Promise<void> {
  if (!isTauri()) throw new Error('仅 Tauri 桌面模式支持更新')

  const { invoke } = await import('@tauri-apps/api/core')

  // 应用补丁
  try {
    const newVersion = await invoke<string>('apply_server_patch', {
      patchPath: localPath,
      expectedVersion: version,
    })
    console.log(`[Delta] 应用成功: server version = ${newVersion}`)
  } catch (err) {
    const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err))
    if (msg.includes('文件过小') || msg.includes('delta 文件过小')) {
      throw new Error('更新包无效（可能下载失败），请稍后重试或等待全量更新')
    }
    throw new Error(`应用更新失败: ${msg}`)
  }

  // 重启 server
  if (restartServer) {
    console.log(`[Delta] 正在重启 server 进程...`)
    try {
      const serverUrl = await invoke<string>('restart_server')
      console.log(`[Delta] Server 已重启: ${serverUrl}`)
    } catch (restartErr) {
      console.error('[Delta] Server 重启失败:', restartErr)
    }
  } else {
    console.log(`[Delta] 应用成功，等待用户手动重启 server`)
  }

  // 清理下载文件
  try {
    const { invoke: inv } = await import('@tauri-apps/api/core')
    await inv('plugin:fs|remove', { path: localPath })
  } catch {
    // 清理失败不阻塞
  }
}

/**
 * 兼容旧接口：下载并应用 server delta 更新
 * @deprecated 请使用 downloadServerUpdate + applyServerUpdate
 */
export async function downloadAndApplyDelta(
  delta: ServerDelta,
  serverVersion: string,
  onProgress?: (progress: UpdateProgress) => void,
  autoRestart: boolean = true,
): Promise<string> {
  const info: ServerUpdateInfo = {
    version: serverVersion,
    delta,
    serverFull: null,
    label: '热更新',
  }

  onProgress?.({ downloaded: 0, total: delta.size || 0, percent: 0 })

  const result = await downloadServerUpdate(info, (percent) => {
    onProgress?.({
      downloaded: Math.floor((delta.size || 0) * percent / 100),
      total: delta.size || 0,
      percent: Math.floor(percent * 0.7),
    })
  })

  onProgress?.({ downloaded: delta.size || 0, total: delta.size || 0, percent: 70 })
  await applyServerUpdate(result.localPath, result.version, autoRestart)
  onProgress?.({ downloaded: delta.size || 0, total: delta.size || 0, percent: 100 })

  return result.version
}

/**
 * 启动时更新检查：检查 → 下载 → 应用，一站式完成
 * 超时由调用方控制，此函数不设超时
 */
export async function startupUpdateCheck(
  onProgress?: (status: string, progress: number, detail: string) => void,
): Promise<boolean> {
  try {
    onProgress?.('loading', 82, '检查更新...')
    const info = await checkServerDelta()
    if (!info) {
      onProgress?.('loading', 100, '已是最新版本')
      return false
    }

    onProgress?.('loading', 85, `发现新版本 v${info.version}`)

    // 下载
    const result = await downloadServerUpdate(info, (percent) => {
      const progress = 85 + Math.floor(percent * 0.1) // 85-95%
      onProgress?.('loading', progress, `下载更新 ${percent}%`)
    })

    // 应用
    onProgress?.('loading', 96, '正在应用更新...')
    await applyServerUpdate(result.localPath, result.version, true)

    onProgress?.('loading', 100, '更新完成')
    return true
  } catch (err) {
    console.warn('Startup update check failed:', err)
    onProgress?.('loading', 100, '启动中...')
    return false
  }
}

// ============ 自动更新调度 ============

export interface AutoUpdateCallbacks {
  /** 下载完成，等待用户操作（新增） */
  onUpdateReady?: (version: string, localPath: string) => void
  /** server 热更新成功后的回调（通知 UI 刷新版本号） */
  onServerUpdated?: (newVersion: string) => void
  /** 发现 Tauri 全量更新时的回调（需要用户确认重启） */
  onTauriUpdate?: (info: UpdateInfo) => void
  /** 更新出错回调（仅用于日志，不影响应用运行） */
  onError?: (error: string) => void
}

export class AutoUpdater {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private checking = false

  /**
   * 启动自动更新检查
   * - 延迟 30s 首次检查
   * - 之后每 2 小时检查一次
   */
  start(callbacks: AutoUpdateCallbacks): void {
    if (!isTauri()) return
    setTimeout(() => this.runCheck(callbacks), 30_000)
    this.intervalId = setInterval(() => this.runCheck(callbacks), 2 * 60 * 60 * 1000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** 手动触发一次更新检查 */
  async checkNow(callbacks: AutoUpdateCallbacks): Promise<void> {
    await this.runCheck(callbacks)
  }

  private async runCheck(callbacks: AutoUpdateCallbacks): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      // 1. 检查 server 更新（delta 或全量），下载后等待用户操作
      try {
        const serverUpdate = await checkServerDelta()
        if (serverUpdate) {
          console.log(`[AutoUpdater] 发现 server 更新: ${serverUpdate.label}`)
          const result = await downloadServerUpdate(serverUpdate)
          console.log(`[AutoUpdater] 更新下载完成: ${result.localPath}`)
          callbacks.onUpdateReady?.(result.version, result.localPath)
          return
        }
      } catch (deltaErr) {
        console.warn('[AutoUpdater] server 更新检查/下载失败，降级到全量更新:', deltaErr)
      }

      // 2. 检查 Tauri 全量更新（需用户确认重启）
      try {
        const tauriUpdate = await checkForUpdate()
        if (tauriUpdate) {
          console.log(`[AutoUpdater] 发现全量更新: ${tauriUpdate.version}`)
          callbacks.onTauriUpdate?.(tauriUpdate)
        }
      } catch (tauriErr) {
        console.warn('[AutoUpdater] Tauri 更新检查失败:', tauriErr)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AutoUpdater] 更新检查异常:', msg)
      callbacks.onError?.(msg)
    } finally {
      this.checking = false
    }
  }
}
