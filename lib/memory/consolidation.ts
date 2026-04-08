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

export interface ConsolidationResult {
  semanticCreated: number
  proceduralCreated: number
  episodicPromoted: number
  errors: string[]
}

/**
 * 执行巩固
 * 仅扫描用户级目录的情节点（项目级是用户级的副本，避免重复巩固）
 * 注意：总纲刷新由调用方负责（异步 LLM 提练）
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

  // 只在用户级目录巩固，避免与项目级重复
  const userDir = store.userMemoryDir(userId)
  try {
    consolidateDir(userDir, userId, projectId, result)
  } catch (err) {
    result.errors.push(`Failed to consolidate ${userDir}: ${err}`)
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

  // 加载已有的语义/程序记忆，用于去重
  const existingSemantic = store.readSemantic(baseDir).entries.filter(e => e.status === 'active')
  const existingProcedural = store.readProcedural(baseDir).entries.filter(e => e.status === 'active')

  // 按类型分组
  const byType = groupBy(unconsolidated, e => e.type)

  // ── 偏好 → 语义记忆（preference）──
  const preferences = byType.get('preference') || []
  if (preferences.length >= 1) {
    for (const ep of preferences) {
      if (ep.promotedTo) continue
      // 去重：检查是否已有内容相似的语义记忆
      if (hasSimilarEntry(existingSemantic, ep.summary, ep.detail)) {
        markPromoted(baseDir, [ep], 'skipped-duplicate')
        console.log(`[GClaw] Consolidation skip (duplicate): "${ep.summary.slice(0, 50)}"`)
        continue
      }
      const entry = addSemantic(userId, {
        type: 'preference',
        title: extractTitle(ep),
        content: ep.detail || ep.summary,
        scope: 'user',
        tags: ep.tags,
        confidence: 0.8,
        sources: [{ episodicId: ep.id, date: ep.timestamp.slice(0, 10) }],
      })
      existingSemantic.push(entry) // 加入缓存，后续去重用
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
      if (hasSimilarEntry(existingProcedural, ep.summary, ep.detail)) {
        markPromoted(baseDir, [ep], 'skipped-duplicate')
        continue
      }
      const entry = addProcedural(userId, {
        type: 'error_resolution',
        title: extractTitle(ep),
        content: ep.detail || ep.summary,
        scope: 'user',
        tags: ep.tags,
        confidence: 0.7,
        sources: [{ episodicId: ep.id, date: ep.timestamp.slice(0, 10) }],
      })
      existingProcedural.push(entry)
      markPromoted(baseDir, [ep], entry.id)
      result.proceduralCreated++
      result.episodicPromoted++
    }
  }

  // ── 决策 → 语义记忆（project_knowledge）──
  const decisions = byType.get('decision') || []
  if (decisions.length >= 1) {
    // 按上下文标签分组，同组多条合并，单条也提升
    const grouped = groupByTags(decisions)
    for (const [, group] of grouped) {
      // 取组内第一条检查去重
      const first = group[0]
      if (first.promotedTo) continue
      if (hasSimilarEntry(existingSemantic, first.summary, first.detail)) {
        markPromoted(baseDir, group, 'skipped-duplicate')
        continue
      }
      const entry = createSemanticFromEpisodic(group, 'project_knowledge', userId, projectId)
      if (entry) {
        existingSemantic.push(entry)
        markPromoted(baseDir, group, entry.id)
        result.semanticCreated++
        result.episodicPromoted += group.length
      }
    }
  }

  // ── 发现 → 语义记忆（environment/entity_relation）──
  const discoveries = byType.get('discovery') || []
  if (discoveries.length >= 1) {
    const grouped = groupByTags(discoveries)
    for (const [, group] of grouped) {
      const first = group[0]
      if (first.promotedTo) continue
      if (hasSimilarEntry(existingSemantic, first.summary, first.detail)) {
        markPromoted(baseDir, group, 'skipped-duplicate')
        continue
      }
      const entry = createSemanticFromEpisodic(group, 'environment', userId, projectId)
      if (entry) {
        existingSemantic.push(entry)
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
    if (hasSimilarEntry(existingSemantic, ep.summary, ep.detail)) {
      markPromoted(baseDir, [ep], 'skipped-duplicate')
      continue
    }
    const entry = addSemantic(userId, {
      type: 'project_knowledge',
      title: extractTitle(ep),
      content: ep.detail || ep.summary,
      scope: 'user',
      tags: ep.tags,
      confidence: 0.9,
      sources: [{ episodicId: ep.id, date: ep.timestamp.slice(0, 10) }],
    })
    existingSemantic.push(entry)
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
  const title = extractTitle(first)
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
 * 使用 timestamp + summary 双重匹配（避免 ID 重复导致的误标记）
 */
function markPromoted(baseDir: string, episodes: EpisodicEntry[], targetId: string): void {
  const byDate = groupBy(episodes, e => e.timestamp.slice(0, 10))

  for (const [date, dayEntries] of byDate) {
    const day = store.readEpisodicDay(baseDir, date)
    for (const ep of dayEntries) {
      const match = day.entries.find(e =>
        e.timestamp === ep.timestamp && e.summary === ep.summary
      )
      if (match) {
        match.promotedTo = targetId
      }
    }
    store.writeEpisodicDay(baseDir, day)
  }
}

// ── 工具函数 ──

/**
 * 从情节记忆中提取简短标题
 * 优先使用 LLM 提取的 title 字段，否则从 summary 生成简短标题
 */
function extractTitle(ep: EpisodicEntry): string {
  // LLM 提取的草稿带 title 字段（通过 any 访问，因为 EpisodicEntry 没有 title 字段）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draft = ep as any
  if (draft.title && typeof draft.title === 'string' && draft.title.length <= 30) {
    return draft.title
  }

  // 降级：从 summary 生成简短标题
  return generateShortTitle(ep.summary, ep.type)
}

/**
 * 从 summary 生成简短标题（2-15字）
 */
function generateShortTitle(summary: string, type: string): string {
  // 移除常见前缀（"用户"、"偏好使用"、"表达了"等）
  let cleaned = summary
    .replace(/^用户(\u8868达了对|喜欢|偏好|选择|决定|认为|希望|需要|使用)/g, '')
    .replace(/^用户/g, '')
    .trim()

  // 如果清理后太短，用原始 summary
  if (cleaned.length < 2) cleaned = summary

  // 截取前 15 字作为标题
  if (cleaned.length <= 15) return cleaned

  // 尝试在标点处截断
  const punct = cleaned.slice(0, 15).search(/[，。！？、；,;]/)
  if (punct > 2) return cleaned.slice(0, punct)

  // 直接截取
  return cleaned.slice(0, 12)
}

/**
 * 检查是否已有内容相似的条目（防止重复巩固）
 * 比较 title 和 content 的关键词重叠度
 */
function hasSimilarEntry<T extends { title: string; content: string }>(
  existing: T[],
  title: string,
  content?: string
): boolean {
  const target = (title + ' ' + (content || '')).toLowerCase()
  const targetWords = extractKeywords(target)

  for (const entry of existing) {
    const existingText = (entry.title + ' ' + entry.content).toLowerCase()
    const existingWords = extractKeywords(existingText)

    // 计算关键词重叠率（双向取最大）
    const overlap = targetWords.filter(w => existingWords.includes(w))
    const similarityA = overlap.length / Math.max(targetWords.length, 1)
    const similarityB = overlap.length / Math.max(existingWords.length, 1)
    const similarity = Math.max(similarityA, similarityB)
    if (similarity >= 0.5) return true
  }

  return false
}

/**
 * 简单关键词提取：按标点/空格分词，过滤短词
 */
function extractKeywords(text: string): string[] {
  return text
    .replace(/[，。！？、；：""''（）【】《》\s,.\-!?;:()[\]{}<>]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)
}

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
