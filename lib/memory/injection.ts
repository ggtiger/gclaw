/**
 * CLAUDE.md 记忆注入辅助
 * 生成用户记忆总纲，供 claude-md.ts 注入到 CLAUDE.md
 */

import { store } from './store'

/**
 * 获取总纲内容（供 claude-md.ts 注入）
 * 优先读取缓存文件，无缓存时动态生成
 */
export function getOverviewForInjection(userId: string): string {
  return store.readOverview(userId) || generateAndSaveOverview(userId)
}

/**
 * 降级生成（无 overview-generator 依赖的简化版）
 */
function generateAndSaveOverview(userId: string): string {
  const userDir = store.userMemoryDir(userId)
  const semantic = store.readSemantic(userDir)
  const procedural = store.readProcedural(userDir)

  const activeSemantic = semantic.entries.filter(e => e.status === 'active')
  const activeProcedural = procedural.entries.filter(e => e.status === 'active' && e.verification !== 'outdated')

  if (activeSemantic.length === 0 && activeProcedural.length === 0) {
    return ''
  }

  const lines: string[] = ['## 用户记忆总纲', '']

  if (activeSemantic.length > 0) {
    lines.push('### 关键信息')
    for (const entry of activeSemantic.slice(0, 15)) {
      lines.push(`- **${entry.title}**: ${truncate(entry.content, 100)}`)
    }
    lines.push('')
  }

  if (activeProcedural.length > 0) {
    lines.push('### 已知模式与最佳实践')
    for (const entry of activeProcedural.slice(0, 10)) {
      lines.push(`- **${entry.title}**: ${truncate(entry.content, 100)}`)
    }
    lines.push('')
  }

  lines.push('> 详细记忆可通过 API 检索：POST $GCLAW_API_BASE/api/memory/recall')

  return lines.join('\n')
}

/**
 * 刷新总纲（语义/程序记忆变更后调用）
 */
export function refreshOverview(userId: string): void {
  try {
    const { generateAndSaveOverview } = require('@/lib/memory/overview-generator')
    generateAndSaveOverview(userId)
  } catch {
    // overview-generator 不可用时降级
    const content = generateAndSaveOverview(userId)
    if (content) {
      store.writeOverview(userId, content)
    }
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}
