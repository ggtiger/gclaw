/**
 * Tauri 环境检测与系统操作封装
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function openWithSystemApp(absolutePath: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('仅在 Tauri 桌面模式下支持本地打开')
  }
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(absolutePath)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`打开失败: ${detail}`)
  }
}

/**
 * 打开系统目录选择对话框，返回用户选择的目录路径
 * 非 Tauri 环境下返回 null
 */
export async function selectDirectory(): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    return typeof selected === 'string' ? selected : null
  } catch {
    return null
  }
}

export async function revealInFinder(absolutePath: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('仅在 Tauri 桌面模式下支持')
  }
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
    await revealItemInDir(absolutePath)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`打开目录失败: ${detail}`)
  }
}
