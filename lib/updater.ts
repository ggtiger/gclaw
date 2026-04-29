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
  /** Tauri updater check() 是否可用（false 表示需要手动下载安装） */
  canAutoInstall?: boolean
  /** 手动下载 URL（当 canAutoInstall=false 时提供） */
  downloadUrl?: string
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
  /** 所有匹配的 delta 候选（用于 hash 校验失败时依次重试） */
  allDeltas?: ServerDelta[]
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
    console.log(`[Updater] 🔍 checkForUpdate 开始 | 当前 Tauri 壳版本: ${currentVersion}`)

    // 先通过自定义的多端点重试获取 latest.json（七牛云 CDN + GitHub，更可靠）
    const latestJson = await fetchLatestJsonWithRetry()
    if (latestJson) {
      const remoteVersion = (latestJson.version as string) || ''
      const remoteServerVersion = (latestJson.serverVersion as string) || ''
      console.log(`[Updater] 📦 latest.json | version(壳)=${remoteVersion}, serverVersion=${remoteServerVersion}`)
      // 如果 latest.json 显示的 Tauri 壳版本没有更新，直接返回
      if (!remoteVersion || !isVersionNewer(remoteVersion, currentVersion)) {
        console.log(`[Updater] ⏭️ 壳版本无更新 (本地=${currentVersion}, 远程=${remoteVersion})`)
        return null
      }
      console.log(`[Updater] ✅ 发现壳新版本 ${remoteVersion} > ${currentVersion}，调用 Tauri updater...`)
    } else {
      console.warn(`[Updater] ⚠️ fetchLatestJsonWithRetry 返回 null，无法获取 latest.json`)
    }

    // 调用 Tauri updater 获取完整更新信息（包含下载 URL、签名等）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let update: any = null
    let checkError: string | null = null
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      console.log('[Updater] 🔄 调用 Tauri plugin-updater check()...')
      update = await check({ timeout: 15000 })
      console.log('[Updater] 📋 Tauri updater 结果:', update ? `发现 v${update.version}, date=${update.date}` : '返回 null（已是最新）')
    } catch (pluginErr) {
      checkError = pluginErr instanceof Error ? pluginErr.message : String(pluginErr)
      console.error('[Updater] ⚠️ Tauri plugin-updater check() 异常:', checkError)
    }

    if (update) {
      return {
        version: update.version,
        date: update.date ?? undefined,
        body: update.body ?? undefined,
        canAutoInstall: true,
      }
    }

    // Tauri check() 失败或返回 null，但我们自己的版本比较发现了更新
    // 提供手动下载回退
    if (latestJson) {
      const remoteVersion = (latestJson.version as string) || ''
      if (remoteVersion && isVersionNewer(remoteVersion, currentVersion)) {
        // 从 platforms 中提取当前平台的下载 URL
        const platformKey = await getPlatformKey()
        const platforms = latestJson.platforms as Record<string, { url?: string }> | undefined
        const platEntry = platforms?.[platformKey]
        console.warn(`[Updater] ⚠️ Tauri check() 不可用 (${checkError || 'returned null'})，回退到手动下载模式, platform=${platformKey}, url=${platEntry?.url}`)
        return {
          version: remoteVersion,
          body: `检测到新版本，但自动更新不可用${checkError ? `（${checkError}）` : ''}，请手动下载安装。`,
          canAutoInstall: false,
          downloadUrl: platEntry?.url,
        }
      }
    }

    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Updater] ❌ checkForUpdate 异常:', msg, err)
    throw new Error(`全量更新检查失败: ${msg.includes('github.com') ? '网络连接失败，无法访问更新服务器' : msg}`)
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
 * 带重试的 latest.json 获取，依次尝试七牛云 CDN 和 GitHub，每个端点支持指数退避重试
 */
async function fetchLatestJsonWithRetry(maxRetries = 2): Promise<Record<string, unknown> | null> {
  const endpoints: Array<() => Promise<Record<string, unknown> | null>> = [
    () => fetchJsonViaRust(`https://o09u11p5v.qnssl.com/gclaw/latest.json?t=${Date.now()}`),
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
    console.log(`[Delta] 🔍 checkServerDelta 开始 | 当前 server 版本: ${currentVersion}`)

    // 通过带重试的方式获取 latest.json（依次尝试七牛云 CDN、GitHub，支持指数退避）
    const latestJson = await fetchLatestJsonWithRetry()

    if (!latestJson) {
      console.log('[Delta] ⚠️ 无法获取 latest.json')
      return null
    }

    const serverVersion = latestJson.serverVersion as string | undefined
    console.log(`[Delta] 📦 latest.json | serverVersion=${serverVersion}, version(壳)=${latestJson.version}`)
    if (!serverVersion || !isVersionNewer(serverVersion, currentVersion)) {
      console.log(`[Delta] ⏭️ server 已是最新 (本地=${currentVersion}, 远程=${serverVersion})`)
      return null
    }
    console.log(`[Delta] ✅ 发现 server 新版本: ${currentVersion} → ${serverVersion}`)

    const deltas = latestJson.serverDeltas as Record<string, ServerDelta[]> | undefined

    let matchedDelta: ServerDelta | null = null
    let allMatchedDeltas: ServerDelta[] = []
    if (deltas && typeof deltas === 'object') {
      const platformKey = await getPlatformKey()
      const platformDeltas = deltas[platformKey]
      console.log(`[Delta] 🖥️ 平台=${platformKey}, 可用delta数=${platformDeltas?.length ?? 0}`)

      // 查找可用的 delta（文件级补丁是覆盖式的，from <= 当前版本即可使用，优先选最近的）
      allMatchedDeltas = (platformDeltas
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
        })) ?? []
      matchedDelta = allMatchedDeltas[0] ?? null
    }

    if (matchedDelta) {
      const sizeLabel = matchedDelta.size >= 1024 * 1024
        ? `~${(matchedDelta.size / 1024 / 1024).toFixed(1)} MB`
        : `~${(matchedDelta.size / 1024).toFixed(0)} KB`
      const label = `热更新 ${sizeLabel}`
      console.log(`[Delta] 发现 server 更新: ${currentVersion} → ${serverVersion}, ${label}`)
      return { version: serverVersion, delta: matchedDelta, allDeltas: allMatchedDeltas, serverFull: null, label }
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

  // 收集所有候选 delta（allDeltas 优先，回退到单个 delta）
  const deltaCandidates = info.allDeltas?.length
    ? info.allDeltas
    : (info.delta ? [info.delta] : [])

  onProgress?.(0)

  // 依次尝试每个 delta 候选
  for (let i = 0; i < deltaCandidates.length; i++) {
    const candidate = deltaCandidates[i]
    const fileName = candidate.url.split('/').pop() ?? 'server.delta'
    const localPath = await join(dataDir, fileName)

    try {
      console.log(`[Delta] 尝试候选 ${i + 1}/${deltaCandidates.length}: from=${candidate.from}, url=${candidate.url}`)
      await invoke('download_file', { url: candidate.url, path: localPath })

      // hash 校验
      if (candidate.hash) {
        const hashValid = await invoke<boolean>('verify_file_hash', {
          path: localPath,
          expectedHash: candidate.hash,
        })
        if (!hashValid) {
          console.warn(`[Delta] hash 校验失败 (from=${candidate.from})，尝试下一个候选...`)
          // 清理失败文件
          try { await invoke('plugin:fs|remove', { path: localPath }) } catch { /* ignore */ }
          continue
        }
      }

      onProgress?.(100)
      console.log(`[Delta] 下载完成: ${localPath}`)
      return { localPath, version: info.version }
    } catch (err) {
      console.warn(`[Delta] 候选 ${i + 1} 下载失败 (from=${candidate.from}):`, err)
      // 清理失败文件
      try { await invoke('plugin:fs|remove', { path: localPath }) } catch { /* ignore */ }
    }
  }

  // 所有 delta 失败，尝试全量包
  if (info.serverFull) {
    console.log('[Delta] 所有 delta 候选失败，回退到全量包')
    const downloadUrl = info.serverFull.cdnUrl ?? info.serverFull.url
    const fallbackUrl = info.serverFull.cdnUrl ? info.serverFull.url : undefined
    const expectedHash = info.serverFull.hash
    const fileName = info.serverFull.url.split('/').pop() ?? 'server-full.tar.gz'
    const localPath = await join(dataDir, fileName)

    onProgress?.(0)
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

    if (expectedHash) {
      const hashValid = await invoke<boolean>('verify_file_hash', {
        path: localPath,
        expectedHash,
      })
      if (!hashValid) {
        throw new Error('全量更新包 hash 校验失败，文件可能损坏')
      }
    }

    onProgress?.(100)
    console.log(`[Delta] 全量包下载完成: ${localPath}`)
    return { localPath, version: info.version }
  }

  throw new Error('所有下载源均校验失败')
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
  let alreadyRestarted = false
  let restartedUrl = ''
  try {
    const result = await invoke<string>('apply_server_patch', {
      patchPath: localPath,
      expectedVersion: version,
    })
    // Windows 上 Rust 会在补丁后自动重启 server，返回 "版本号|restarted:url"
    if (result.includes('|restarted:')) {
      const [newVersion, restartInfo] = result.split('|restarted:')
      console.log(`[Delta] 应用成功: server version = ${newVersion}, Windows 已自动重启: ${restartInfo}`)
      alreadyRestarted = true
      restartedUrl = restartInfo
    } else {
      console.log(`[Delta] 应用成功: server version = ${result}`)
    }
  } catch (err) {
    const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err))
    if (msg.includes('文件过小') || msg.includes('delta 文件过小')) {
      throw new Error('更新包无效（可能下载失败），请稍后重试或等待全量更新')
    }
    throw new Error(`应用更新失败: ${msg}`)
  }

  // 重启 server（Windows 上 apply_server_patch 已自动重启，跳过）
  if (restartServer && !alreadyRestarted) {
    console.log(`[Delta] 正在重启 server 进程...`)
    try {
      const serverUrl = await invoke<string>('restart_server')
      console.log(`[Delta] Server 已重启: ${serverUrl}`)

      // 刷新 webview 以加载新代码（解决旧 JS 与新 server 不匹配的问题）
      // Rust 端 restart_server 已处理端口变化时的 webview 导航
      // 这里用 location.href 确保页面刷新，加载新的 JavaScript 资源
      try {
        await new Promise(resolve => setTimeout(resolve, 500))
        console.log('[Delta] 刷新 webview 以加载新代码...')
        window.location.href = serverUrl
      } catch {
        // location.href 赋值会触发页面跳转，不会到这里
      }
    } catch (restartErr) {
      console.error('[Delta] Server 重启失败:', restartErr)
    }
  } else if (alreadyRestarted) {
    // Windows: server 已在 Rust 端重启，只需刷新 webview
    console.log(`[Delta] Windows 已自动重启，刷新页面: ${restartedUrl}`)
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      window.location.href = restartedUrl
    } catch {
      // location.href 赋值会触发页面跳转
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
    onProgress?.('loading', 80, '检查更新...')

    // 1. 优先检查 Tauri 壳全量更新
    try {
      const tauriUpdate = await checkForUpdate()
      if (tauriUpdate) {
        if (tauriUpdate.canAutoInstall) {
          // Tauri updater 可自动安装 → 提示用户，跳过 server 热更新
          onProgress?.('loading', 85, `发现新版本 v${tauriUpdate.version}，请前往设置重新安装`)
          console.log(`[Startup] 发现 Tauri 全量更新 v${tauriUpdate.version}（可自动安装），跳过 server 热更新`)
          await delay(2000)
          onProgress?.('loading', 100, '启动中...')
          return false
        } else {
          // canAutoInstall=false → 仅手动下载，不跳过 server 热更新
          console.log(`[Startup] 发现 Tauri 全量更新 v${tauriUpdate.version}（仅手动下载），继续检查 server 热更新`)
        }
      }
    } catch (tauriErr) {
      console.warn('[Startup] Tauri 全量更新检查失败，继续检查 server 热更新:', tauriErr)
    }

    // 2. 无全量更新，再检查 server 热更新
    onProgress?.('loading', 82, '检查热更新...')
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
      // 1. 优先检查 Tauri 壳全量更新
      try {
        const tauriUpdate = await checkForUpdate()
        if (tauriUpdate) {
          callbacks.onTauriUpdate?.(tauriUpdate)
          if (tauriUpdate.canAutoInstall) {
            // Tauri updater 可自动安装 → 跳过 server 热更新
            console.log(`[AutoUpdater] 发现全量更新: ${tauriUpdate.version}（可自动安装），跳过 server 热更新`)
            return
          }
          // canAutoInstall=false → 仅通知 UI，继续检查 server 热更新
          console.log(`[AutoUpdater] 发现全量更新: ${tauriUpdate.version}（仅手动下载），继续检查 server 热更新`)
        }
      } catch (tauriErr) {
        console.warn('[AutoUpdater] Tauri 全量更新检查失败，继续检查 server 热更新:', tauriErr)
      }

      // 2. 无全量更新，再检查 server 热更新
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
        console.warn('[AutoUpdater] server 更新检查/下载失败:', deltaErr)
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
