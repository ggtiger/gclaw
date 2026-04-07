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
    const textMatch =
      entry.summary.toLowerCase().includes(q) ||
      (entry.detail && entry.detail.toLowerCase().includes(q)) ||
      entry.tags.some(t => t.toLowerCase().includes(q))
    if (!textMatch) return false
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
    const textMatch =
      entry.title.toLowerCase().includes(q) ||
      entry.content.toLowerCase().includes(q) ||
      entry.tags.some(t => t.toLowerCase().includes(q))
    if (!textMatch) return false
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
    const textMatch =
      entry.title.toLowerCase().includes(q) ||
      entry.content.toLowerCase().includes(q) ||
      entry.triggers.some(t => t.toLowerCase().includes(q)) ||
      entry.tags.some(t => t.toLowerCase().includes(q))
    if (!textMatch) return false
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
