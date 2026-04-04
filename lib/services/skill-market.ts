/**
 * 技能市场服务 - 精简版
 * 通过 SkillHub Web API 搜索，CDN 直接下载 zip 安装
 */

import fs from 'fs'
import path from 'path'

const SKILLS_DIR = path.join(process.cwd(), 'skills')

export interface MarketSkill {
  name: string
  displayName: string
  description: string
  author?: string
  version?: string
  downloads?: number
  category?: string
  installed: boolean
}

export interface MarketSearchResult {
  skills: MarketSkill[]
  total: number
  hasMore: boolean
}

// 缓存（5 分钟）
let cachedSkills: MarketSkill[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

/**
 * 搜索市场技能
 */
export async function searchMarketSkills(
  query?: string,
  page: number = 1,
  limit: number = 20,
): Promise<MarketSearchResult> {
  // 缓存命中
  if (!query && page === 1 && cachedSkills && Date.now() - cacheTime < CACHE_TTL) {
    return paginate(cachedSkills, page, limit)
  }

  const searchUrl = 'https://lightmake.site/api/v1/search'
  const indexUrl = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills.json'

  try {
    let rawSkills: unknown[] = []

    if (query) {
      const params = new URLSearchParams({ q: query, limit: String(limit) })
      const res = await fetch(`${searchUrl}?${params}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'GClaw/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Search API returned ${res.status}`)
      const data = await res.json()
      rawSkills = data.results || data.skills || data.data || []
    } else {
      const res = await fetch(indexUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'GClaw/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Index API returned ${res.status}`)
      const data = await res.json()
      rawSkills = Array.isArray(data) ? data : (data.skills || data.results || data.data || [])
    }

    // 获取已安装的技能名
    const installed = getInstalledSkillNames()

    const skills: MarketSkill[] = rawSkills
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        name: String(item.slug || item.name || ''),
        displayName: String(item.displayName || item.display_name || item.name || item.slug || ''),
        description: String(item.description || item.desc || item.summary || ''),
        author: item.author ? String(item.author) : undefined,
        version: item.version ? String(item.version) : undefined,
        downloads: typeof item.downloads === 'number' ? item.downloads
          : typeof item.download_count === 'number' ? item.download_count : undefined,
        category: item.category ? String(item.category) : undefined,
        installed: installed.has(String(item.slug || item.name || '')),
      }))
      .filter(s => s.name)

    // 更新缓存
    if (!query) {
      cachedSkills = skills
      cacheTime = Date.now()
    }

    return paginate(skills, page, limit)
  } catch (error) {
    console.error('[SkillMarket] Search failed:', error)
    return { skills: [], total: 0, hasMore: false }
  }
}

/**
 * 验证技能名称是否安全（无路径遍历）
 * 合法的技能名只包含字母、数字、连字符和下划线
 */
function isValidSkillName(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name) && name.length <= 128
}

/**
 * 从市场安装技能（CDN 直接下载 zip）
 */
export async function installSkill(skillName: string): Promise<{ success: boolean; error?: string }> {
  // 安全校验：技能名不能包含路径遍历字符
  if (!isValidSkillName(skillName)) {
    return { success: false, error: `无效的技能名称: "${skillName}"` }
  }

  fs.mkdirSync(SKILLS_DIR, { recursive: true })

  const targetDir = path.join(SKILLS_DIR, skillName)
  if (fs.existsSync(targetDir)) {
    return { success: false, error: `技能 "${skillName}" 已存在，删除后重试` }
  }

  // 尝试两个下载源
  const urls = [
    `https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/${encodeURIComponent(skillName)}.zip`,
    `https://lightmake.site/api/v1/download?slug=${encodeURIComponent(skillName)}`,
  ]

  for (const url of urls) {
    try {
      console.log(`[SkillMarket] Downloading from: ${url}`)
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GClaw/1.0' },
        signal: AbortSignal.timeout(60000),
      })
      if (!res.ok) continue

      const buffer = Buffer.from(await res.arrayBuffer())

      // 解压 zip
      await extractZip(buffer, targetDir)

      // 清除缓存，下次搜索会更新 installed 状态
      cachedSkills = null

      console.log(`[SkillMarket] Installed ${skillName} to ${targetDir}`)
      return { success: true }
    } catch (err) {
      console.warn(`[SkillMarket] Download from ${url} failed:`, err instanceof Error ? err.message : err)
      continue
    }
  }

  return { success: false, error: `下载失败，请检查网络连接` }
}

/**
 * 获取已安装的技能名集合
 */
function getInstalledSkillNames(): Set<string> {
  const names = new Set<string>()
  try {
    if (!fs.existsSync(SKILLS_DIR)) return names
    for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (entry.isFile() && entry.name.endsWith('.md')) {
        names.add(path.basename(entry.name, '.md'))
      } else if (entry.isDirectory()) {
        names.add(entry.name)
      }
    }
  } catch { /* ignore */ }
  return names
}

/**
 * 分页
 */
function paginate(skills: MarketSkill[], page: number, limit: number): MarketSearchResult {
  const start = (page - 1) * limit
  const end = start + limit
  return {
    skills: skills.slice(start, end),
    total: skills.length,
    hasMore: end < skills.length,
  }
}

/**
 * 解压 zip buffer 到目标目录（使用 Node.js 内置 zlib + 简单 zip 解析）
 */
async function extractZip(zipBuffer: Buffer, targetDir: string): Promise<void> {
  // 动态导入 unzipper（轻量 zip 解压库）
  // 如果没有 unzipper，使用 child_process 调用系统 unzip
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const os = await import('os')

    // 写 zip 到临时文件
    const tmpZip = path.join(os.tmpdir(), `gclaw-skill-${Date.now()}.zip`)
    fs.writeFileSync(tmpZip, zipBuffer)
    fs.mkdirSync(targetDir, { recursive: true })

    try {
      await execAsync(`unzip -o "${tmpZip}" -d "${targetDir}"`, { timeout: 30000 })
    } finally {
      try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }
    }

    // 安全校验：验证解压后的所有文件都在目标目录内（防止 zip slip）
    const resolvedTarget = path.resolve(targetDir)
    validateExtractedPaths(targetDir, resolvedTarget)

    // 如果解压后只有一个子目录，把内容提升上来
    const entries = fs.readdirSync(targetDir)
    if (entries.length === 1) {
      const subDir = path.join(targetDir, entries[0])
      if (fs.statSync(subDir).isDirectory()) {
        for (const file of fs.readdirSync(subDir)) {
          fs.renameSync(path.join(subDir, file), path.join(targetDir, file))
        }
        fs.rmdirSync(subDir)
      }
    }
  } catch (err) {
    throw new Error(`解压失败: ${err instanceof Error ? err.message : err}`)
  }
}

/**
 * 递归验证解压后的所有文件路径都在目标目录内（防止 zip slip 攻击）
 * 发现逃逸文件则直接删除
 */
function validateExtractedPaths(dir: string, allowedBase: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const resolved = path.resolve(fullPath)
    if (!resolved.startsWith(allowedBase + path.sep) && resolved !== allowedBase) {
      console.warn(`[SkillMarket] Removing zip-slip file: ${fullPath}`)
      try {
        if (entry.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true })
        else fs.unlinkSync(fullPath)
      } catch { /* ignore */ }
      continue
    }
    if (entry.isDirectory()) {
      validateExtractedPaths(fullPath, allowedBase)
    }
  }
}
