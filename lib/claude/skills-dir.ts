import fs from 'fs'
import path from 'path'
import type { SkillInfo } from '@/types/skills'
import { getProjectDir } from '@/lib/store/projects'

const SKILLS_DIR = path.join(process.cwd(), 'skills')

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
        results.push({ name, displayName, description, path: filePath, enabled: false })
      } else if (entry.isDirectory()) {
        // 目录型技能：skills/xxx/SKILL.md
        const skillMdPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md')
        if (fs.existsSync(skillMdPath)) {
          const name = entry.name
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const { displayName, description } = parseSkillMeta(content, name)
          results.push({ name, displayName, description, path: path.join(SKILLS_DIR, entry.name), enabled: false })
        }
      }
    }

    return results
  } catch (err) {
    console.error('Failed to scan skills:', err)
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
  const projectSkillsDir = path.join(projectDir, '.claude', 'skills')
  fs.mkdirSync(projectSkillsDir, { recursive: true })

  // 清理旧条目
  cleanDir(projectSkillsDir)

  // 为启用的技能创建 symlink
  for (const name of enabledSkillNames) {
    try {
      // 目录型技能：skills/xxx/ -> data/projects/{id}/.claude/skills/xxx
      const dirPath = path.join(SKILLS_DIR, name)
      const dirSkillMd = path.join(dirPath, 'SKILL.md')
      if (fs.existsSync(dirSkillMd)) {
        fs.symlinkSync(dirPath, path.join(projectSkillsDir, name))
        continue
      }

      // 单文件技能：skills/xxx.md -> data/projects/{id}/.claude/skills/xxx.md
      const mdPath = path.join(SKILLS_DIR, `${name}.md`)
      if (fs.existsSync(mdPath)) {
        fs.symlinkSync(mdPath, path.join(projectSkillsDir, `${name}.md`))
      }
    } catch (err) {
      console.error(`Failed to link skill ${name}:`, err)
    }
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
        console.log(`[GClaw] Loaded env from skill "${name}":`, loaded)
      }
    } catch (err) {
      console.error(`Failed to load .env for skill ${name}:`, err)
    }
  }

  return env
}
