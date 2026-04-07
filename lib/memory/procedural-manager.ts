/**
 * L3 程序记忆管理器
 * 提供程序记忆的 CRUD 和搜索
 */

import type { ProceduralEntry } from '@/types/memory'
import { store } from './store'

/**
 * 添加一条程序记忆
 */
export function addProcedural(
  userId: string,
  params: {
    type: ProceduralEntry['type']
    title: string
    content: string
    scope: 'user' | 'project'
    projectId?: string
    triggers?: string[]
    steps?: string[]
    tags?: string[]
    confidence?: number
    sources?: Array<{ episodicId: string; date: string }>
  }
): ProceduralEntry {
  const now = new Date().toISOString()
  const entry: ProceduralEntry = {
    id: store.generateId('PROC'),
    type: params.type,
    title: params.title,
    content: params.content,
    scope: params.scope,
    projectId: params.scope === 'project' ? params.projectId : undefined,
    triggers: params.triggers || [],
    steps: params.steps,
    tags: params.tags || [],
    status: 'active',
    verification: 'unverified',
    confidence: params.confidence ?? 0.7,
    sources: params.sources || [],
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
  }

  const baseDir = params.scope === 'project' && params.projectId
    ? store.projectMemoryDir(params.projectId)
    : store.userMemoryDir(userId)

  store.initMemoryDirs(userId, params.projectId)
  store.addProceduralEntry(baseDir, entry)

  return entry
}

/**
 * 搜索程序记忆
 */
export function searchProcedural(
  userId: string,
  query: {
    projectId?: string
    query?: string
    tags?: string[]
    type?: string
    scope?: 'user' | 'project' | 'all'
    limit?: number
  }
): ProceduralEntry[] {
  const dirs = store.getMemoryBaseDirs(userId, query.projectId)
  const allEntries: ProceduralEntry[] = []

  for (const dir of dirs) {
    const data = store.readProcedural(dir)
    allEntries.push(...data.entries.filter(e => e.status === 'active'))
  }

  let filtered = allEntries

  if (query.scope === 'user') {
    filtered = filtered.filter(e => e.scope === 'user')
  } else if (query.scope === 'project' && query.projectId) {
    filtered = filtered.filter(e => e.scope === 'project' && e.projectId === query.projectId)
  }

  if (query.type) {
    filtered = filtered.filter(e => e.type === query.type)
  }

  if (query.tags && query.tags.length > 0) {
    filtered = filtered.filter(e =>
      query.tags!.some(t => e.tags.includes(t))
    )
  }

  if (query.query) {
    const q = query.query.toLowerCase()
    filtered = filtered.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.triggers.some(t => t.toLowerCase().includes(q)) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const limit = query.limit || 20
  return filtered.slice(0, limit)
}

/**
 * 更新程序记忆
 */
export function updateProcedural(
  userId: string,
  id: string,
  updates: Partial<ProceduralEntry>,
  projectId?: string
): ProceduralEntry | null {
  const dirs = store.getMemoryBaseDirs(userId, projectId)

  for (const dir of dirs) {
    const result = store.updateProceduralEntry(dir, id, updates)
    if (result) return result
  }
  return null
}

/**
 * 列出程序记忆
 */
export function listProcedural(
  userId: string,
  projectId?: string,
  scope?: 'user' | 'project' | 'all'
): ProceduralEntry[] {
  const dirs = store.getMemoryBaseDirs(userId, projectId)
  const allEntries: ProceduralEntry[] = []

  for (const dir of dirs) {
    const data = store.readProcedural(dir)
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
