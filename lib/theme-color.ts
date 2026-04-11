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

/** 解析 hex 为 [r, g, b] */
function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** 将 RGB 转为 hex */
function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** 将颜色与白色混合（ratio=0 原色，ratio=1 纯白） */
function mixWithWhite(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex)
  return toHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio)
}

/** 将颜色与黑色混合（ratio=0 原色，ratio=1 纯黑） */
function mixWithBlack(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex)
  return toHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio))
}

/** 将 hex 颜色按 HSL 旋转色相，返回新的 hex */
function rotateHue(hex: string, degrees: number): string {
  let r = parseInt(hex.slice(1, 3), 16) / 255
  let g = parseInt(hex.slice(3, 5), 16) / 255
  let b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }

  h = (h + degrees / 360) % 1
  if (h < 0) h += 1

  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  if (s === 0) {
    const v = clamp(l)
    return `#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const nr = clamp(hue2rgb(p, q, h + 1 / 3))
  const ng = clamp(hue2rgb(p, q, h))
  const nb = clamp(hue2rgb(p, q, h - 1 / 3))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
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

  // ── 背景渐变跟随主题颜色 ──
  // 亮色模式：主题色与白色混合（保留色调，足够浅不影响阅读）
  const light1 = mixWithWhite(hex, 0.92)
  const light2 = mixWithWhite(hex, 0.88)
  const light3 = mixWithWhite(rotateHue(hex, 35), 0.86)
  const light4 = mixWithWhite(rotateHue(hex, -35), 0.90)
  root.style.setProperty('--bg-gradient-light',
    `linear-gradient(135deg, ${light1} 0%, ${light2} 30%, ${light3} 60%, ${light4} 100%)`
  )

  // 暗色模式：主题色与黑色混合
  const dark1 = mixWithBlack(hex, 0.90)
  const dark2 = mixWithBlack(hex, 0.85)
  const dark3 = mixWithBlack(rotateHue(hex, 25), 0.83)
  const dark4 = mixWithBlack(rotateHue(hex, -25), 0.87)
  root.style.setProperty('--bg-gradient-dark',
    `linear-gradient(135deg, ${dark1} 0%, ${dark2} 35%, ${dark3} 65%, ${dark4} 100%)`
  )

  // 装饰光晕颜色（主题色 + 色相偏移）
  const rgb = parseHex(hex)
  root.style.setProperty('--halo-color-1', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.45)`)
  const c2 = parseHex(rotateHue(hex, 40))
  root.style.setProperty('--halo-color-2', `rgba(${c2[0]},${c2[1]},${c2[2]},0.4)`)
  const c3 = parseHex(rotateHue(hex, -40))
  root.style.setProperty('--halo-color-3', `rgba(${c3[0]},${c3[1]},${c3[2]},0.35)`)
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
  root.style.removeProperty('--bg-gradient-light')
  root.style.removeProperty('--bg-gradient-dark')
  root.style.removeProperty('--halo-color-1')
  root.style.removeProperty('--halo-color-2')
  root.style.removeProperty('--halo-color-3')
}
