import fs from 'fs'
import path from 'path'

/**
 * 查找种子数据文件（多级回退）
 * 打包后种子数据位于 server 目录的 data/ 子目录，开发环境则在项目根目录的 data/ 下
 *
 * @param filename - 种子文件名，如 'commands.json'
 * @returns 找到的种子文件绝对路径，未找到返回 null
 */
export function findSeedFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'data', filename),           // 开发环境 / standalone server
    path.join(__dirname, '..', '..', 'data', filename),   // 打包后（相对于 lib/store/ -> ../../data/）
    path.join(__dirname, '..', 'data', filename),          // 打包后（相对于 server root）
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}
