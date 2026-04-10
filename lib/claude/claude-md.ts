/**
 * 项目 CLAUDE.md 生成器
 * 在每次 SDK 调用前，将系统提示词和技能经验摘要写入 CLAUDE.md
 * SDK 会自动从 cwd 加载此文件（settingSources 含 "project" 时）
 *
 * .learnings/ 目录架构：
 *   - 技能源目录 skills/xxx/assets/ 包含 .learnings 模板文件
 *   - 实际 .learnings/ 生成在项目 cwd 根目录（data/projects/{id}/.learnings/）
 *   - 每个项目独立，Agent 通过 cwd 相对路径 .learnings/ 访问
 */

import fs from 'fs'
import path from 'path'
import { getOverviewForInjection } from '@/lib/memory/injection'

const SKILLS_DIR = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')

/**
 * 同步生成项目的 CLAUDE.md，并初始化 .learnings/ 目录
 * SDK 会自动从 cwd 读取此文件，注入到每次会话上下文中
 *
 * @param projectCwd SDK 工作目录（项目数据目录或用户自定义 cwd）
 * @param systemPrompt 用户配置的系统提示词
 * @param enabledSkills 启用的技能名称列表
 * @param userId 用户 ID（可选，用于注入记忆总纲）
 * @param projectId 项目 ID（可选，用于项目级记忆）
 */
export function syncProjectClaudeMd(
  projectCwd: string,
  systemPrompt: string,
  enabledSkills: string[],
  userId?: string,
  _projectId?: string
): void {
  // ── 初始化项目的 .learnings/ 目录（从技能模板复制）──
  initProjectLearnings(projectCwd, enabledSkills)

  const claudeMdPath = path.join(projectCwd, 'CLAUDE.md')

  const sections: string[] = []

  // ── 系统提示词（Soul）──
  if (systemPrompt.trim()) {
    sections.push(systemPrompt.trim())
  }

  // ── 用户记忆总纲（注入活跃的语义/程序记忆摘要）──
  if (userId) {
    const overview = getOverviewForInjection(userId)
    if (overview) {
      sections.push(overview)
    }
  }

  // ── 技能经验摘要（从项目 cwd/.learnings/ 扫描）──
  const learningsSummary = collectLearningsSummary(projectCwd)
  if (learningsSummary) {
    sections.push(learningsSummary)
  }

  // 写入或清理 CLAUDE.md
  if (sections.length > 0) {
    const content = sections.join('\n\n---\n\n') + '\n'
    try {
      if (!fs.existsSync(projectCwd)) {
        fs.mkdirSync(projectCwd, { recursive: true })
      }
      // 仅在内容变化时写入（避免不必要的磁盘 IO）
      const existing = fs.existsSync(claudeMdPath)
        ? fs.readFileSync(claudeMdPath, 'utf-8')
        : ''
      if (existing !== content) {
        fs.writeFileSync(claudeMdPath, content, 'utf-8')
      }
    } catch (err) {
      console.error('[GClaw] Failed to write CLAUDE.md:', err)
    }
  } else {
    // 无内容时删除 CLAUDE.md（避免残留旧指令）
    try {
      if (fs.existsSync(claudeMdPath)) {
        fs.unlinkSync(claudeMdPath)
      }
    } catch {
      // 忽略
    }
  }
}

/**
 * 初始化项目的 .learnings/ 目录
 * 从启用技能的 assets/ 中查找 .learnings 模板文件，复制到项目 cwd/.learnings/
 * 仅在文件不存在时复制（不覆盖已有内容）
 */
function initProjectLearnings(projectCwd: string, enabledSkills: string[]): void {
  const projectLearningsDir = path.join(projectCwd, '.learnings')

  for (const skillName of enabledSkills) {
    const assetsDir = path.join(SKILLS_DIR, skillName, 'assets')
    if (!fs.existsSync(assetsDir)) continue

    try {
      // 查找 assets/ 下的模板文件（LEARNINGS.md, ERRORS.md 等）
      const templates = fs.readdirSync(assetsDir).filter(f => f.endsWith('.md'))

      if (templates.length === 0) continue

      // 确保项目 .learnings/ 目录存在
      if (!fs.existsSync(projectLearningsDir)) {
        fs.mkdirSync(projectLearningsDir, { recursive: true })
      }

      for (const tpl of templates) {
        const dest = path.join(projectLearningsDir, tpl)
        // 仅在目标不存在时复制模板（不覆盖用户数据）
        if (!fs.existsSync(dest)) {
          const src = path.join(assetsDir, tpl)
          fs.copyFileSync(src, dest)
        }
      }
    } catch {
      // 忽略初始化错误
    }
  }
}

/**
 * 从项目 cwd/.learnings/ 扫描 pending 条目摘要
 * 返回 Markdown 格式，注入到 CLAUDE.md 供 Agent 参考
 */
function collectLearningsSummary(projectCwd: string): string {
  const learningsDir = path.join(projectCwd, '.learnings')
  if (!fs.existsSync(learningsDir)) return ''

  const allEntries: { file: string; entries: string[] }[] = []

  try {
    const files = fs.readdirSync(learningsDir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const filePath = path.join(learningsDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')

      const pendingEntries = extractPendingEntries(content)
      if (pendingEntries.length > 0) {
        allEntries.push({ file, entries: pendingEntries })
      }
    }
  } catch {
    // 忽略读取错误
  }

  if (allEntries.length === 0) return ''

  const lines: string[] = [
    '## 待处理经验（来自 .learnings/）',
    '',
    '以下条目尚未处理，在相关场景中请参考：',
    '',
  ]

  for (const { file, entries } of allEntries) {
    lines.push(`### ${file}`)
    for (const entry of entries) {
      lines.push(`- ${entry}`)
    }
    lines.push('')
  }

  lines.push(`> 完整内容请查看 .learnings/ 目录下对应文件。处理后将 Status 改为 resolved。`)

  return lines.join('\n')
}

/**
 * 从 .learnings/ 的 Markdown 文件中提取 pending 状态的条目
 * 返回条目 ID + 摘要
 */
function extractPendingEntries(content: string): string[] {
  const entries: string[] = []
  const lines = content.split('\n')

  let currentId = ''
  let isPending = false
  let summary = ''

  for (const line of lines) {
    // 匹配条目标题：## [LRN-20250115-001] category
    const headingMatch = line.match(/^## \[([A-Z]+-\d{8}-\w+)\]\s*(.*)/)
    if (headingMatch) {
      // 保存上一条 pending 条目
      if (currentId && isPending) {
        entries.push(`**${currentId}** ${summary || '(无摘要)'}`)
      }
      currentId = headingMatch[1]
      isPending = false
      summary = headingMatch[2] || ''
      continue
    }

    // 检测 Status
    if (currentId && /^\*\*Status\*\*:\s*pending/i.test(line)) {
      isPending = true
    }

    // 提取摘要（### 摘要 下的第一行非空内容）
    if (currentId && isPending && !summary) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('**') && !trimmed.startsWith('---')) {
        summary = trimmed.slice(0, 100)
      }
    }
  }

  // 最后一条
  if (currentId && isPending) {
    entries.push(`**${currentId}** ${summary || '(无摘要)'}`)
  }

  return entries
}
