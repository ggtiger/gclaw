/**
 * CLAUDE.md 记忆注入辅助
 * 生成用户记忆总纲，供 claude-md.ts 注入到 CLAUDE.md
 */

import { store } from './store'
import type { SemanticEntry, ProceduralEntry } from '@/types/memory'

/**
 * 生成用户记忆总纲 Markdown
 * 注入到项目 CLAUDE.md 中，让 Agent 了解用户的关键记忆
 */
export function generateOverviewMarkdown(userId: string): string {
  const userDir = store.userMemoryDir(userId)

  // 先尝试读取已有的 overview.md
  const existing = store.readOverview(userId)
  if (existing) return existing

  // 首次生成
  return buildOverviewFromData(userId)
}

/**
 * 从记忆数据构建总纲
 */
function buildOverviewFromData(userId: string): string {
  const userDir = store.userMemoryDir(userId)
  const semantic = store.readSemantic(userDir)
  const procedural = store.readProcedural(userDir)

  const lines: string[] = ['## 用户记忆总纲', '']

  // 活跃的语义记忆
  const activeSemantic = semantic.entries.filter(e => e.status === 'active')
  if (activeSemantic.length > 0) {
    lines.push('### 关键信息')
    for (const entry of activeSemantic.slice(0, 15)) {
      lines.push(`- **${entry.title}**: ${truncate(entry.content, 100)}`)
    }
    lines.push('')
  }

  // 活跃的程序记忆
  const activeProcedural = procedural.entries.filter(e => e.status === 'active' && e.verification !== 'outdated')
  if (activeProcedural.length > 0) {
    lines.push('### 已知模式与最佳实践')
    for (const entry of activeProcedural.slice(0, 10)) {
      lines.push(`- **${entry.title}**: ${truncate(entry.content, 100)}`)
    }
    lines.push('')
  }

  if (activeSemantic.length === 0 && activeProcedural.length === 0) {
    return ''
  }

  lines.push('> 详细记忆可通过 API 检索：POST $GCLAW_API_BASE/api/memory/recall')

  return lines.join('\n')
}

/**
 * 更新用户记忆总纲文件
 * 在记忆变更后调用
 */
export function refreshOverview(userId: string): void {
  const content = buildOverviewFromData(userId)
  if (content) {
    store.writeOverview(userId, content)
  }
}

/**
 * 读取总纲内容（供 claude-md.ts 注入）
 */
export function getOverviewForInjection(userId: string): string {
  return store.readOverview(userId) || generateOverviewMarkdown(userId)
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}
