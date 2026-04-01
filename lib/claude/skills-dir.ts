import fs from 'fs'
import path from 'path'
import type { SkillInfo } from '@/types/skills'

const SKILLS_DIR = path.join(process.cwd(), 'skills')
const CLAUDE_SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills')

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
 * 根据启用的技能列表，同步 .claude/skills/ 目录
 * - 启用的技能：创建 symlink 到 skills/ 下的源文件
 * - 未启用的技能：删除对应的 symlink
 * SDK 通过 settingSources: ['project'] 自动读取 .claude/skills/
 */
export function syncClaudeSkillsDir(enabledSkillNames: string[]): void {
  // 确保 .claude/skills/ 存在
  fs.mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true })

  // 清理 .claude/skills/ 中所有已有的 symlink（只清理 symlink，不动非 symlink 文件）
  const existing = fs.readdirSync(CLAUDE_SKILLS_DIR)
  for (const file of existing) {
    const fullPath = path.join(CLAUDE_SKILLS_DIR, file)
    try {
      const stat = fs.lstatSync(fullPath)
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(fullPath)
      }
    } catch {
      // 忽略
    }
  }

  // 为启用的技能创建 symlink
  for (const name of enabledSkillNames) {
    try {
      // 目录型技能：skills/xxx/SKILL.md -> .claude/skills/xxx.md
      const dirSkillMd = path.join(SKILLS_DIR, name, 'SKILL.md')
      if (fs.existsSync(dirSkillMd)) {
        fs.symlinkSync(dirSkillMd, path.join(CLAUDE_SKILLS_DIR, `${name}.md`))
        continue
      }

      // 单文件技能：skills/xxx.md -> .claude/skills/xxx.md
      const mdPath = path.join(SKILLS_DIR, `${name}.md`)
      if (fs.existsSync(mdPath)) {
        fs.symlinkSync(mdPath, path.join(CLAUDE_SKILLS_DIR, `${name}.md`))
      }
    } catch (err) {
      console.error(`Failed to link skill ${name}:`, err)
    }
  }
}
