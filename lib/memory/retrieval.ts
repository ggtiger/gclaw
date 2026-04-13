/**
 * 统一检索编排器
 * 跨层级（情节/语义/程序）检索记忆，支持关键词 + 标签 + 时间衰减排序
 */

import type { EpisodicEntry, SemanticEntry, ProceduralEntry, RecallResult } from '@/types/memory'
import { store } from './store'

export interface RetrievalQuery {
  userId: string
  projectId?: string
  query?: string
  tags?: string[]
  level?: 'episodic' | 'semantic' | 'procedural' | 'all'
  scope?: 'user' | 'project' | 'all'
  limit?: number
}

/**
 * 统一检索入口
 * 返回按相关性排序的跨层级记忆结果
 */
export function retrieve(query: RetrievalQuery): RecallResult {
  const level = query.level || 'all'
  const limit = query.limit || 20
  const now = Date.now()

  const result: RecallResult = {
    episodic: [],
    semantic: [],
    procedural: [],
  }

  if (level === 'all' || level === 'episodic') {
    result.episodic = retrieveEpisodic(query, now).slice(0, limit)
  }

  if (level === 'all' || level === 'semantic') {
    result.semantic = retrieveSemantic(query, now).slice(0, limit)
  }

  if (level === 'all' || level === 'procedural') {
    result.procedural = retrieveProcedural(query, now).slice(0, limit)
  }

  // 异步更新命中条目的访问计数（不阻塞检索返回）
  bumpAccessCounts(query.userId, query.projectId, result)

  return result
}

// ── 情节记忆检索 ──

function retrieveEpisodic(query: RetrievalQuery, now: number): EpisodicEntry[] {
  const dirs = store.getMemoryBaseDirs(query.userId, query.projectId)
  const allEntries: EpisodicEntry[] = []

  for (const dir of dirs) {
    allEntries.push(...store.readRecentEpisodic(dir, 30))
  }

  return allEntries
    .filter(entry => matchEpisodic(entry, query))
    .map(entry => ({ entry, score: scoreEpisodic(entry, query, now) }))
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry)
}

function matchEpisodic(entry: EpisodicEntry, query: RetrievalQuery): boolean {
  if (query.tags && query.tags.length > 0) {
    if (!query.tags.some(t => entry.tags.includes(t))) return false
  }

  if (query.query) {
    const q = query.query.toLowerCase()
    const memoryText = `${entry.summary} ${entry.detail || ''}`.toLowerCase()

    // 精确子串匹配
    if (q.includes(entry.summary.toLowerCase()) || memoryText.includes(q)) {
      return true
    }

    // 关键词重叠匹配
    const queryKeywords = extractMatchKeywords(q)
    const memoryKeywords = extractMatchKeywords(memoryText)
    const overlap = queryKeywords.filter((k: string) => memoryKeywords.includes(k))
    if (overlap.length >= 1) {
      return true
    }

    return false
  }

  return true
}

function scoreEpisodic(entry: EpisodicEntry, query: RetrievalQuery, now: number): number {
  let score = 1.0

  // 时间衰减：每天衰减 5%，30 天后趋近 0
  const ageDays = (now - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60 * 24)
  score *= Math.exp(-0.05 * ageDays)

  // 标签匹配加分
  if (query.tags && query.tags.length > 0) {
    const matchCount = query.tags.filter(t => entry.tags.includes(t)).length
    score *= (1 + matchCount * 0.2)
  }

  // 类型权重：decision > milestone > preference > discovery > action > error
  const typeWeight: Record<string, number> = {
    decision: 1.3,
    milestone: 1.2,
    preference: 1.1,
    discovery: 1.0,
    action: 0.8,
    error: 0.7,
  }
  score *= typeWeight[entry.type] || 1.0

  return score
}

// ── 语义记忆检索 ──

function retrieveSemantic(query: RetrievalQuery, now: number): SemanticEntry[] {
  const dirs = store.getMemoryBaseDirs(query.userId, query.projectId)
  const allEntries: SemanticEntry[] = []

  for (const dir of dirs) {
    const data = store.readSemantic(dir)
    allEntries.push(...data.entries.filter(e => e.status === 'active'))
  }

  return allEntries
    .filter(entry => matchSemantic(entry, query))
    .map(entry => ({ entry, score: scoreSemantic(entry, query, now) }))
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry)
}

function matchSemantic(entry: SemanticEntry, query: RetrievalQuery): boolean {
  if (query.scope === 'user' && entry.scope !== 'user') return false
  if (query.scope === 'project' && entry.scope !== 'project') return false

  if (query.tags && query.tags.length > 0) {
    if (!query.tags.some(t => entry.tags.includes(t))) return false
  }

  if (query.query) {
    const q = query.query.toLowerCase()
    // 双向匹配：用户消息包含记忆内容，或记忆内容包含用户消息中的关键词
    const memoryText = `${entry.title} ${entry.content}`.toLowerCase()

    // 1. 精确子串：用户消息包含记忆标题/内容
    if (q.includes(entry.title.toLowerCase()) || memoryText.includes(q)) {
      return true
    }

    // 2. 关键词匹配：从用户消息和记忆条目中提取关键词，计算重叠率
    const queryKeywords = extractMatchKeywords(q)
    const memoryKeywords = extractMatchKeywords(memoryText)
    const overlap = queryKeywords.filter(k => memoryKeywords.includes(k))
    // 至少 1 个关键词重叠即可（中文 bigram 粒度足够细）
    if (overlap.length >= 1) {
      return true
    }

    return false
  }

  return true
}

function scoreSemantic(entry: SemanticEntry, query: RetrievalQuery, _now: number): number {
  let score = entry.confidence

  // 访问次数加分
  score += Math.min(entry.accessCount * 0.05, 0.3)

  // 标签匹配加分
  if (query.tags && query.tags.length > 0) {
    const matchCount = query.tags.filter(t => entry.tags.includes(t)).length
    score += matchCount * 0.1
  }

  // 来源数量加分（多个情节点提炼 = 更可靠）
  score += Math.min(entry.sources.length * 0.05, 0.2)

  // 验证加分（用户确认过的记忆更可靠）
  if (entry.lastVerifiedAt) {
    score += 0.3
  }

  return score
}

// ── 程序记忆检索 ──

function retrieveProcedural(query: RetrievalQuery, now: number): ProceduralEntry[] {
  const dirs = store.getMemoryBaseDirs(query.userId, query.projectId)
  const allEntries: ProceduralEntry[] = []

  for (const dir of dirs) {
    const data = store.readProcedural(dir)
    allEntries.push(...data.entries.filter(e => e.status === 'active'))
  }

  return allEntries
    .filter(entry => matchProcedural(entry, query))
    .map(entry => ({ entry, score: scoreProcedural(entry, query, now) }))
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry)
}

function matchProcedural(entry: ProceduralEntry, query: RetrievalQuery): boolean {
  if (query.scope === 'user' && entry.scope !== 'user') return false
  if (query.scope === 'project' && entry.scope !== 'project') return false

  if (query.tags && query.tags.length > 0) {
    if (!query.tags.some(t => entry.tags.includes(t))) return false
  }

  if (query.query) {
    const q = query.query.toLowerCase()
    const memoryText = `${entry.title} ${entry.content}`.toLowerCase()

    // 精确子串匹配
    if (q.includes(entry.title.toLowerCase()) || memoryText.includes(q)) {
      return true
    }

    // 关键词重叠匹配
    const queryKeywords = extractMatchKeywords(q)
    const memoryKeywords = extractMatchKeywords(memoryText)
    const overlap = queryKeywords.filter((k: string) => memoryKeywords.includes(k))
    if (overlap.length >= 1) {
      return true
    }

    return false
  }

  return true
}

function scoreProcedural(entry: ProceduralEntry, query: RetrievalQuery, _now: number): number {
  let score = entry.confidence

  // 验证状态加分
  const verBonus: Record<string, number> = {
    verified: 0.3,
    unverified: 0,
    outdated: -0.3,
  }
  score += verBonus[entry.verification] || 0

  // 访问次数加分
  score += Math.min(entry.accessCount * 0.05, 0.3)

  // 标签匹配加分
  if (query.tags && query.tags.length > 0) {
    const matchCount = query.tags.filter(t => entry.tags.includes(t)).length
    score += matchCount * 0.1
  }

  // trigger 匹配加分
  if (query.query) {
    const q = query.query.toLowerCase()
    if (entry.triggers.some(t => t.toLowerCase().includes(q))) {
      score += 0.3
    }
  }

  return score
}

// ── 访问计数更新 ──

/**
 * 异步更新检索命中条目的 accessCount
 * 不阻塞检索返回，失败时静默忽略
 */
function bumpAccessCounts(
  userId: string,
  projectId: string | undefined,
  result: RecallResult
): void {
  try {
    const dirs = store.getMemoryBaseDirs(userId, projectId)

    // 更新语义记忆 accessCount
    if (result.semantic.length > 0) {
      const hitIds = new Set(result.semantic.map(e => e.id))
      for (const dir of dirs) {
        const data = store.readSemantic(dir)
        let changed = false
        for (const entry of data.entries) {
          if (hitIds.has(entry.id)) {
            entry.accessCount = (entry.accessCount || 0) + 1
            changed = true
          }
        }
        if (changed) store.writeSemantic(dir, data)
      }
    }

    // 更新程序记忆 accessCount
    if (result.procedural.length > 0) {
      const hitIds = new Set(result.procedural.map(e => e.id))
      for (const dir of dirs) {
        const data = store.readProcedural(dir)
        let changed = false
        for (const entry of data.entries) {
          if (hitIds.has(entry.id)) {
            entry.accessCount = (entry.accessCount || 0) + 1
            changed = true
          }
        }
        if (changed) store.writeProcedural(dir, data)
      }
    }
  } catch {
    // 访问计数更新失败不影响检索结果
  }
}

// ── 匹配工具 ──

// 延迟初始化中文分词器（避免模块加载时 Intl.Segmenter 不可用导致整个模块崩溃）
let _zhSegmenter: Intl.Segmenter | null = null
function getZhSegmenter(): Intl.Segmenter | null {
  if (_zhSegmenter === undefined) return null
  if (_zhSegmenter) return _zhSegmenter
  try {
    _zhSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })
    return _zhSegmenter
  } catch {
    _zhSegmenter = null as unknown as Intl.Segmenter
    return null
  }
}

/** 从文本中提取用于匹配的关键词 */
function extractMatchKeywords(text: string): string[] {
  const segmenter = getZhSegmenter()

  if (segmenter) {
    // Intl.Segmenter 可用：精确分词
    const segments = [...segmenter.segment(text)]
    const words = segments
      .filter(s => s.isWordLike && s.segment.length >= 2)
      .map(s => s.segment.toLowerCase())
    const noise = new Set([
      '这是', '也是', '好的', '是的', '没有', '就是',
      '这个', '那个', '什么', '怎么', '如何', '一个', '一些',
    ])
    return [...new Set(words.filter(w => !noise.has(w)))]
  }

  // Fallback：滑动窗口 bigram（无 Intl.Segmenter 时使用）
  const keywords: string[] = []
  const enWords = text.match(/[a-z]{2,}/g) || []
  keywords.push(...enWords)

  const cnSegments = text.match(/[\u4e00-\u9fa5]+/g) || []
  const cnStopWords = new Set([
    '这是', '也是', '好的', '是的', '没有', '就是',
    '这个', '那个', '什么', '怎么', '如何', '一个', '一些',
    '不要', '使用', '可以', '需要', '应该', '已经', '我们',
  ])
  for (const seg of cnSegments) {
    for (let i = 0; i <= seg.length - 2; i++) {
      const w = seg.slice(i, i + 2)
      if (!cnStopWords.has(w)) keywords.push(w)
    }
  }

  return [...new Set(keywords)]
}
