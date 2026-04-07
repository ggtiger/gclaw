/**
 * 记忆巩固引擎
 * 将情节记忆提炼为语义/程序记忆
 *
 * 巩固策略：
 * - 日级巩固：聚合当天同类型/同标签的情节点，提炼为语义或程序记忆
 * - 标记已巩固的情节点 promotedTo 字段
 */

import type { EpisodicEntry, SemanticEntry, ProceduralEntry } from '@/types/memory'
import { store } from './store'
import { addSemantic } from './semantic-manager'
import { addProcedural } from './procedural-manager'
import { refreshOverview } from './injection'

export interface ConsolidationResult {
  semanticCreated: number
  proceduralCreated: number
  episodicPromoted: number
  errors: string[]
}

/**
 * 执行巩固
 * 扫描用户级（和可选的项目级）未巩固的情节点，按模式提炼
 */
export function runConsolidation(
  userId: string,
  projectId?: string
): ConsolidationResult {
  const result: ConsolidationResult = {
    semanticCreated: 0,
    proceduralCreated: 0,
    episodicPromoted: 0,
    errors: [],
  }

  const dirs = store.getMemoryBaseDirs(userId, projectId)

  for (const baseDir of dirs) {
    try {
      consolidateDir(baseDir, userId, projectId, result)
    } catch (err) {
      result.errors.push(`Failed to consolidate ${baseDir}: ${err}`)
    }
  }

  // 巩固后刷新总纲
  if (result.semanticCreated > 0 || result.proceduralCreated > 0) {
    refreshOverview(userId)
  }

  return result
}

function consolidateDir(
  baseDir: string,
  userId: string,
  projectId: string | undefined,
  result: ConsolidationResult
): void {
  // 读取最近 30 天的情节点
  const entries = store.readRecentEpisodic(baseDir, 30)
  if (entries.length === 0) return

  // 筛选未巩固的条目
  const unconsolidated = entries.filter(e => !e.promotedTo)
  if (unconsolidated.length === 0) return

  // 按类型分组
  const byType = groupBy(unconsolidated, e => e.type)

  // ── 决策 → 语义记忆（user_profile/project_knowledge）──
  const decisions = byType.get('decision') || []
  if (decisions.length >= 2) {
    const grouped = groupByTags(decisions)
    for (const [, group] of grouped) {
      if (group.length < 2) continue
      const entry = createSemanticFromEpisodic(group, 'project_knowledge', userId, projectId)
      if (entry) {
        markPromoted(baseDir, group, entry.id)
        result.semanticCreated++
        result.episodicPromoted += group.length
      }
    }
  }

  // ── 偏好 → 语义记忆（preference）──
  const preferences = byType.get('preference') || []
  if (preferences.length >= 1) {
    for (const ep of preferences) {
      if (ep.promotedTo) continue
      const entry = addSemantic(userId, {
        type: 'preference',
        title: ep.summary,
        content: ep.detail || ep.summary,
        scope: ep.projectId ? 'project' : 'user',
        projectId: ep.projectId || projectId,
        tags: ep.tags,
        confidence: 0.8,
        sources: [{ episodicId: ep.id, date: ep.timestamp.slice(0, 10) }],
      })
      markPromoted(baseDir, [ep], entry.id)
      result.semanticCreated++
      result.episodicPromoted++
    }
  }

  // ── 错误 → 程序记忆（error_resolution）──
  const errors = byType.get('error') || []
  if (errors.length >= 1) {
    for (const ep of errors) {
      if (ep.promotedTo) continue
      const entry = addProcedural(userId, {
        type: 'error_resolution',
        title: ep.summary,
        content: ep.detail || ep.summary,
        scope: ep.projectId ? 'project' : 'user',
        projectId: ep.projectId || projectId,
        tags: ep.tags,
        confidence: 0.7,
        sources: [{ episodicId: ep.id, date: ep.timestamp.slice(0, 10) }],
      })
      markPromoted(baseDir, [ep], entry.id)
      result.proceduralCreated++
      result.episodicPromoted++
    }
  }

  // ── 发现 → 语义记忆（environment/entity_relation）──
  const discoveries = byType.get('discovery') || []
  if (discoveries.length >= 2) {
    const grouped = groupByTags(discoveries)
    for (const [, group] of grouped) {
      if (group.length < 2) continue
      const entry = createSemanticFromEpisodic(group, 'environment', userId, projectId)
      if (entry) {
        markPromoted(baseDir, group, entry.id)
        result.semanticCreated++
        result.episodicPromoted += group.length
      }
    }
  }

  // ── 里程碑 → 语义记忆（project_knowledge）──
  const milestones = byType.get('milestone') || []
  for (const ep of milestones) {
    if (ep.promotedTo) continue
    const entry = addSemantic(userId, {
      type: 'project_knowledge',
      title: ep.summary,
      content: ep.detail || ep.summary,
      scope: ep.projectId ? 'project' : 'user',
      projectId: ep.projectId || projectId,
      tags: ep.tags,
      confidence: 0.9,
      sources: [{ episodicId: ep.id, date: ep.timestamp.slice(0, 10) }],
    })
    markPromoted(baseDir, [ep], entry.id)
    result.semanticCreated++
    result.episodicPromoted++
  }

  // 更新 lastConsolidatedAt
  const now = new Date().toISOString()
  const semantic = store.readSemantic(baseDir)
  semantic.lastConsolidatedAt = now
  store.writeSemantic(baseDir, semantic)

  const procedural = store.readProcedural(baseDir)
  procedural.lastConsolidatedAt = now
  store.writeProcedural(baseDir, procedural)
}

/**
 * 从一组情节点创建语义记忆
 */
function createSemanticFromEpisodic(
  episodes: EpisodicEntry[],
  type: SemanticEntry['type'],
  userId: string,
  projectId?: string
): SemanticEntry | null {
  if (episodes.length === 0) return null

  const first = episodes[0]
  const title = first.summary.slice(0, 60)
  const content = episodes
    .map(e => `- ${e.summary}${e.detail ? `: ${e.detail.slice(0, 100)}` : ''}`)
    .join('\n')

  const allTags = [...new Set(episodes.flatMap(e => e.tags))]
  const sources = episodes.map(e => ({ episodicId: e.id, date: e.timestamp.slice(0, 10) }))

  return addSemantic(userId, {
    type,
    title,
    content,
    scope: first.projectId ? 'project' : 'user',
    projectId: first.projectId || projectId,
    tags: allTags,
    confidence: Math.min(0.5 + episodes.length * 0.1, 0.95),
    sources,
  })
}

/**
 * 标记情节点已巩固
 */
function markPromoted(baseDir: string, episodes: EpisodicEntry[], targetId: string): void {
  // 按日期分组更新
  const byDate = groupBy(episodes, e => e.timestamp.slice(0, 10))

  for (const [date, dayEntries] of byDate) {
    const day = store.readEpisodicDay(baseDir, date)
    for (const ep of dayEntries) {
      const match = day.entries.find(e => e.id === ep.id)
      if (match) {
        match.promotedTo = targetId
      }
    }
    store.writeEpisodicDay(baseDir, day)
  }
}

// ── 工具函数 ──

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

function groupByTags(entries: EpisodicEntry[]): Map<string, EpisodicEntry[]> {
  const map = new Map<string, EpisodicEntry[]>()
  for (const entry of entries) {
    const key = entry.tags.length > 0 ? entry.tags.sort().join(',') : '_untagged'
    const group = map.get(key) || []
    group.push(entry)
    map.set(key, group)
  }
  return map
}
