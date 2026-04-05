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
