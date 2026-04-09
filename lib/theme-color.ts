/** 将 hex 颜色转为更暗的版本（用于 hover） */
function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const nr = clamp(Math.round(r * (1 - amount)))
  const ng = clamp(Math.round(g * (1 - amount)))
  const nb = clamp(Math.round(b * (1 - amount)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

/** 将 hex 转为 "R G B" 格式（供 Tailwind CSS 变量使用） */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

/** 应用自定义主题颜色到 CSS 变量 */
export function applyThemeColor(hex: string) {
  const root = document.documentElement
  // CSS 变量（用于 inline style 的 var(--color-primary)）
  root.style.setProperty('--color-primary', hex)
  root.style.setProperty('--color-primary-hover', darken(hex, 0.15))
  root.style.setProperty('--color-primary-subtle', `${hex}1a`)
  root.style.setProperty('--glass-border', `${hex}1f`)
  root.style.setProperty('--glass-card-border', `${hex}14`)
  // RGB 变量（供 Tailwind purple-* 类使用）
  root.style.setProperty('--theme-primary', hexToRgb(hex))
}

/** 重置为默认主题颜色（移除 inline override，回到 CSS 定义） */
export function resetThemeColor() {
  const root = document.documentElement
  root.style.removeProperty('--color-primary')
  root.style.removeProperty('--color-primary-hover')
  root.style.removeProperty('--color-primary-subtle')
  root.style.removeProperty('--glass-border')
  root.style.removeProperty('--glass-card-border')
  root.style.removeProperty('--theme-primary')
}
