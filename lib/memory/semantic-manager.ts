/**
 * L2 语义记忆管理器
 * 提供语义记忆的 CRUD 和搜索
 */

import type { SemanticEntry } from '@/types/memory'
import { store } from './store'

/**
 * 添加一条语义记忆
 */
export function addSemantic(
  userId: string,
  params: {
    type: SemanticEntry['type']
    title: string
    content: string
    scope: 'user' | 'project'
    projectId?: string
    tags?: string[]
    confidence?: number
    sources?: Array<{ episodicId: string; date: string }>
  }
): SemanticEntry {
  const now = new Date().toISOString()
  const entry: SemanticEntry = {
    id: store.generateId('SEM'),
    type: params.type,
    title: params.title,
    content: params.content,
    scope: params.scope,
    projectId: params.scope === 'project' ? params.projectId : undefined,
    confidence: params.confidence ?? 0.7,
    sources: params.sources || [],
    tags: params.tags || [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
  }

  // 根据 scope 写入对应目录
  const baseDir = params.scope === 'project' && params.projectId
    ? store.projectMemoryDir(params.projectId)
    : store.userMemoryDir(userId)

  store.initMemoryDirs(userId, params.projectId)
  store.addSemanticEntry(baseDir, entry)

  return entry
}

/**
 * 搜索语义记忆
 */
export function searchSemantic(
  userId: string,
  query: {
    projectId?: string
    query?: string
    tags?: string[]
    type?: string
    scope?: 'user' | 'project' | 'all'
    limit?: number
  }
): SemanticEntry[] {
  const dirs = store.getMemoryBaseDirs(userId, query.projectId)
  const allEntries: SemanticEntry[] = []

  for (const dir of dirs) {
    const data = store.readSemantic(dir)
    allEntries.push(...data.entries.filter(e => e.status === 'active'))
  }

  let filtered = allEntries

  // scope 过滤
  if (query.scope === 'user') {
    filtered = filtered.filter(e => e.scope === 'user')
  } else if (query.scope === 'project' && query.projectId) {
    filtered = filtered.filter(e => e.scope === 'project' && e.projectId === query.projectId)
  }

  // type 过滤
  if (query.type) {
    filtered = filtered.filter(e => e.type === query.type)
  }

  // tags 过滤
  if (query.tags && query.tags.length > 0) {
    filtered = filtered.filter(e =>
      query.tags!.some(t => e.tags.includes(t))
    )
  }

  // 文本搜索
  if (query.query) {
    const q = query.query.toLowerCase()
    filtered = filtered.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  // 按更新时间排序
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const limit = query.limit || 20
  return filtered.slice(0, limit)
}

/**
 * 更新语义记忆
 */
export function updateSemantic(
  userId: string,
  id: string,
  updates: Partial<SemanticEntry>,
  projectId?: string
): SemanticEntry | null {
  const dirs = store.getMemoryBaseDirs(userId, projectId)

  for (const dir of dirs) {
    const result = store.updateSemanticEntry(dir, id, updates)
    if (result) return result
  }
  return null
}

/**
 * 列出语义记忆
 */
export function listSemantic(
  userId: string,
  projectId?: string,
  scope?: 'user' | 'project' | 'all'
): SemanticEntry[] {
  const dirs = store.getMemoryBaseDirs(userId, projectId)
  const allEntries: SemanticEntry[] = []

  for (const dir of dirs) {
    const data = store.readSemantic(dir)
    allEntries.push(...data.entries)
  }

  let filtered = allEntries
  if (scope === 'user') {
    filtered = filtered.filter(e => e.scope === 'user')
  } else if (scope === 'project') {
    filtered = filtered.filter(e => e.scope === 'project')
  }

  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
