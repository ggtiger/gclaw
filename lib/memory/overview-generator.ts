/**
 * 总纲自动生成器
 * 从语义/程序记忆数据生成 Markdown 总纲，写入 overview.md
 * 支持按类别分组，限制 token 预算
 */

import { store } from './store'
import type { SemanticEntry, ProceduralEntry } from '@/types/memory'

export interface OverviewOptions {
  /** 最大语义记忆条目数 */
  maxSemantic?: number
  /** 最大程序记忆条目数 */
  maxProcedural?: number
  /** 单条内容最大字符数 */
  maxContentLen?: number
}

const DEFAULT_OPTIONS: OverviewOptions = {
  maxSemantic: 20,
  maxProcedural: 15,
  maxContentLen: 120,
}

/**
 * 从记忆数据生成总纲 Markdown
 */
export function generateOverview(
  userId: string,
  options: OverviewOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const userDir = store.userMemoryDir(userId)
  const semantic = store.readSemantic(userDir)
  const procedural = store.readProcedural(userDir)

  const activeSemantic = semantic.entries.filter(e => e.status === 'active')
  const activeProcedural = procedural.entries.filter(e => e.status === 'active' && e.verification !== 'outdated')

  if (activeSemantic.length === 0 && activeProcedural.length === 0) {
    return ''
  }

  const lines: string[] = ['## 用户记忆总纲', '']

  // 按类型分组输出语义记忆（全局限制条目数）
  const semanticByType = groupBy(activeSemantic, e => e.type)
  const typeLabels: Record<string, string> = {
    user_profile: '用户画像',
    preference: '偏好与习惯',
    project_knowledge: '项目知识',
    environment: '环境信息',
    entity_relation: '实体关系',
  }

  let semanticUsed = 0
  for (const [type, entries] of semanticByType) {
    if (semanticUsed >= opts.maxSemantic!) break
    const label = typeLabels[type] || type
    lines.push(`### ${label}`)
    for (const entry of entries) {
      if (semanticUsed >= opts.maxSemantic!) break
      lines.push(`- **${entry.title}**: ${truncate(entry.content, opts.maxContentLen!)}`)
      semanticUsed++
    }
    lines.push('')
  }

  // 按类型分组输出程序记忆
  if (activeProcedural.length > 0) {
    const procByType = groupBy(activeProcedural, e => e.type)
    const procTypeLabels: Record<string, string> = {
      runbook: '操作手册',
      lesson: '经验教训',
      error_resolution: '错误解决',
      best_practice: '最佳实践',
    }

    let proceduralUsed = 0
    for (const [type, entries] of procByType) {
      if (proceduralUsed >= opts.maxProcedural!) break
      const label = procTypeLabels[type] || type
      lines.push(`### ${label}`)
      for (const entry of entries) {
        if (proceduralUsed >= opts.maxProcedural!) break
        const suffix = entry.verification === 'verified' ? ' (已验证)' : ''
        lines.push(`- **${entry.title}**${suffix}: ${truncate(entry.content, opts.maxContentLen!)}`)
        proceduralUsed++
      }
      lines.push('')
    }
  }

  lines.push('> 详细记忆可通过 API 检索：POST $GCLAW_API_BASE/api/memory/recall')

  return lines.join('\n')
}

/**
 * 生成并写入总纲
 */
export function generateAndSaveOverview(userId: string): string {
  const content = generateOverview(userId)
  if (content) {
    store.writeOverview(userId, content)
  }
  return content
}

// ── 工具 ──

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const key = keyFn(item)
    const group = map.get(key) || []
    group.push(item)
    map.set(key, group)
  }
  return map
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}
