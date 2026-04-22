import fs from 'fs'
import path from 'path'
import type { SkillInfo } from '@/types/skills'
import { getProjectDir } from '@/lib/store/projects'
import { getProjectSettings } from '@/lib/store/settings'
import { logger } from '@/lib/logger'

const SKILLS_DIR = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')

/**
 * 清理目录中所有条目（symlink、文件、目录）
 */
function cleanDir(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file)
    try {
      const stat = fs.lstatSync(fullPath)
      if (stat.isSymbolicLink() || stat.isFile()) {
        fs.unlinkSync(fullPath)
      } else if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true })
      }
    } catch {
      // 忽略
    }
  }
}

/**
 * 只清理指向 GClaw SKILLS_DIR 的 symlink，保留第三方已有的 skills
 */
function cleanGclawLinksOnly(dir: string): void {
  if (!fs.existsSync(dir)) return
  const resolvedSkillsDir = path.resolve(SKILLS_DIR)
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file)
    try {
      const stat = fs.lstatSync(fullPath)
      if (stat.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(fullPath)
        // 只删除指向 GClaw skills 目录的 symlink
        if (path.resolve(dir, linkTarget).startsWith(resolvedSkillsDir)) {
          fs.unlinkSync(fullPath)
        }
      }
    } catch {
      // 忽略
    }
  }
}

/**
 * 为启用的技能创建 symlink 到目标目录
 */
function createSkillLinks(enabledSkillNames: string[], targetDir: string): void {
  for (const name of enabledSkillNames) {
    try {
      const destPath = path.join(targetDir, name)
      // 跳过已存在的条目（可能是第三方的 skill）
      if (fs.existsSync(destPath)) continue

      // 目录型技能：skills/xxx/ -> .claude/skills/xxx
      const dirPath = path.join(SKILLS_DIR, name)
      const dirSkillMd = path.join(dirPath, 'SKILL.md')
      if (fs.existsSync(dirSkillMd)) {
        if (process.platform === 'win32') {
          fs.symlinkSync(dirPath, destPath, 'junction')
        } else {
          fs.symlinkSync(dirPath, destPath)
        }
        continue
      }

      // 单文件技能：skills/xxx.md -> .claude/skills/xxx.md
      const mdPath = path.join(SKILLS_DIR, `${name}.md`)
      const mdDestPath = path.join(targetDir, `${name}.md`)
      if (fs.existsSync(mdPath) && !fs.existsSync(mdDestPath)) {
        fs.symlinkSync(mdPath, mdDestPath)
      }
    } catch (err) {
      logger.error(`Failed to link skill ${name}:`, err)
    }
  }
}

/**
 * 扫描 skills/ 目录，支持两种技能格式：
 * 1. 单文件：skills/xxx.md
 * 2. 目录型：skills/xxx/SKILL.md（可含 scripts/、.env 等）
 */
export function scanAvailableSkills(): SkillInfo[] {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      return []
    }

    const results: SkillInfo[] = []
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue

      if (entry.isFile() && entry.name.endsWith('.md')) {
        // 单文件技能：skills/xxx.md
        const filePath = path.join(SKILLS_DIR, entry.name)
        const name = path.basename(entry.name, '.md')
        const content = fs.readFileSync(filePath, 'utf-8')
        const { displayName, description } = parseSkillMeta(content, name)
        results.push({ name, displayName, description, path: filePath, enabled: false, builtIn: true })
      } else if (entry.isDirectory()) {
        // 目录型技能：skills/xxx/SKILL.md
        const skillMdPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md')
        if (fs.existsSync(skillMdPath)) {
          const name = entry.name
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const { displayName, description } = parseSkillMeta(content, name)
          // 读取 _meta.json
          let version: string | undefined
          let builtIn = false
          const metaPath = path.join(SKILLS_DIR, entry.name, '_meta.json')
          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
              if (meta.version) version = String(meta.version)
              if (meta.builtIn) builtIn = true
            } catch { /* ignore */ }
          }
          results.push({ name, displayName, description, path: path.join(SKILLS_DIR, entry.name), enabled: false, version, builtIn })
        }
      }
    }

    return results
  } catch (err) {
    logger.error('Failed to scan skills:', err)
    return []
  }
}

/**
 * 从 .md 内容提取标题和描述，支持 YAML frontmatter
 */
function parseSkillMeta(content: string, fallbackName: string): { displayName: string; description: string } {
  let body = content
  let fmName = ''
  let fmDescription = ''

  // 解析 YAML frontmatter
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3)
    if (endIdx !== -1) {
      const frontmatter = content.slice(3, endIdx)
      body = content.slice(endIdx + 3)
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
      const descMatch = frontmatter.match(/^description:\s*"?([^"]*)"?$/m)
      if (nameMatch) fmName = nameMatch[1].trim()
      if (descMatch) fmDescription = descMatch[1].trim()
    }
  }

  const lines = body.split('\n')
  let displayName = fmName || fallbackName
  let description = fmDescription

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('#') && !fmName) {
      displayName = trimmed.replace(/^#+\s*/, '')
      continue
    }

    if (!trimmed.startsWith('#') && !description) {
      description = trimmed.slice(0, 200)
      break
    }
  }

  return { displayName, description }
}

/**
 * 同步启用的技能 symlink 到项目的 .claude/skills/ 目录。
 * 只在 data/projects/{id}/.claude/skills/ 下操作，不碰 cwd 或根目录。
 *
 * @param enabledSkillNames 启用的技能名称列表
 * @param projectId 项目 ID
 */
export function syncProjectSkillsDir(enabledSkillNames: string[], projectId: string): void {
  const projectDir = getProjectDir(projectId)

  // 确定两个目标目录：项目数据目录（兜底）和 cwd（用户的工作目录）
  const settings = getProjectSettings(projectId)
  const cwd = settings.cwd ? path.resolve(settings.cwd) : null
  const cwdIsExternal = cwd && cwd !== path.resolve(projectDir) && fs.existsSync(cwd)

  // 总是在项目数据目录创建 skills（兜底）
  const projectSkillsDir = path.join(projectDir, '.claude', 'skills')
  fs.mkdirSync(projectSkillsDir, { recursive: true })
  cleanDir(projectSkillsDir)
  createSkillLinks(enabledSkillNames, projectSkillsDir)

  // 当 cwd 是外部目录时，也在 cwd 下创建 skills（让 SDK 能看到）
  if (cwdIsExternal) {
    const cwdSkillsDir = path.join(cwd, '.claude', 'skills')
    fs.mkdirSync(cwdSkillsDir, { recursive: true })
    // 只清理 GClaw 创建的 symlink（指向 SKILLS_DIR 的），保留第三方已有的 skills
    cleanGclawLinksOnly(cwdSkillsDir)
    createSkillLinks(enabledSkillNames, cwdSkillsDir)
  }
}

/**
 * 读取启用技能的 .env 文件，合并为环境变量对象
 * 支持格式：KEY=value 或 KEY="value"
 */
export function loadSkillEnvVars(enabledSkillNames: string[]): Record<string, string> {
  const env: Record<string, string> = {}

  for (const name of enabledSkillNames) {
    const envPath = path.join(SKILLS_DIR, name, '.env')
    if (!fs.existsSync(envPath)) continue

    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      const loaded: string[] = []
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        let value = trimmed.slice(eqIdx + 1).trim()
        // 去掉引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (key) {
          env[key] = value
          loaded.push(key)
        }
      }
      if (loaded.length > 0) {
        logger.info(`[GClaw] Loaded env from skill "${name}":`, loaded)
      }
    } catch (err) {
      logger.error(`Failed to load .env for skill ${name}:`, err)
    }
  }

  return env
}
