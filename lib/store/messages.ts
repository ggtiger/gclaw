import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ChatMessage, BranchInfo } from '@/types/chat'
import { MAX_BRANCHES } from '@/types/chat'
import { getProjectDir } from './projects'

const MAX_MESSAGES = 500

function getMessagesFile(projectId: string): string {
  return path.join(getProjectDir(projectId), 'messages.json')
}

function ensureProjectDir(projectId: string) {
  const dir = getProjectDir(projectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readMessages(projectId: string): ChatMessage[] {
  const file = getMessagesFile(projectId)
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.messages) ? data.messages : []
  } catch {
    return []
  }
}

function writeMessages(projectId: string, messages: ChatMessage[]) {
  ensureProjectDir(projectId)
  fs.writeFileSync(getMessagesFile(projectId), JSON.stringify({ messages }, null, 2), 'utf-8')
}

export function getMessages(projectId: string, limit = 50, before?: string): { messages: ChatMessage[]; hasMore: boolean } {
  const all = readMessages(projectId)
  let filtered = all
  if (before) {
    const idx = all.findIndex(m => m.id === before)
    if (idx > 0) {
      filtered = all.slice(0, idx)
    }
  }
  const start = Math.max(0, filtered.length - limit)
  return {
    messages: filtered.slice(start),
    hasMore: start > 0,
  }
}

export function addMessage(projectId: string, msg: ChatMessage) {
  const messages = readMessages(projectId)
  messages.push(msg)
  // 超过上限时截断
  if (messages.length > MAX_MESSAGES) {
    writeMessages(projectId, messages.slice(messages.length - MAX_MESSAGES))
  } else {
    writeMessages(projectId, messages)
  }
}

export function clearMessages(projectId: string) {
  writeMessages(projectId, [])
}

// ── 搜索 ──

export interface SearchOptions {
  keyword: string
  role?: 'user' | 'assistant' | 'system'
  timeRange?: 'today' | '7d' | '30d' | 'all'
  limit?: number
}

export interface SearchResult {
  id: string
  role: string
  content: string
  createdAt: string
  matchIndex: number   // 在原始消息中的位置
}

export function searchMessages(projectId: string, options: SearchOptions): SearchResult[] {
  const all = readMessages(projectId)
  const keyword = options.keyword.toLowerCase()
  if (!keyword) return []

  const now = Date.now()
  const timeRangeMs: Record<string, number> = {
    today: 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    all: Infinity,
  }
  const rangeMs = timeRangeMs[options.timeRange || 'all'] ?? Infinity

  const results: SearchResult[] = []

  for (let i = 0; i < all.length; i++) {
    const msg = all[i]

    // 角色过滤
    if (options.role && msg.role !== options.role) continue

    // 时间范围过滤
    if (rangeMs !== Infinity) {
      const msgTime = new Date(msg.createdAt).getTime()
      if (now - msgTime > rangeMs) continue
    }

    // 关键词匹配
    if (msg.content.toLowerCase().includes(keyword)) {
      results.push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        matchIndex: i,
      })
    }

    if (results.length >= (options.limit || 50)) break
  }

  return results
}

// ── 分支 ──

interface MessagesData {
  messages: ChatMessage[]
  branches?: BranchInfo[]
}

function readMessagesData(projectId: string): MessagesData {
  const file = getMessagesFile(projectId)
  try {
    if (!fs.existsSync(file)) return { messages: [], branches: [] }
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      branches: Array.isArray(data.branches) ? data.branches : [],
    }
  } catch {
    return { messages: [], branches: [] }
  }
}

function writeMessagesData(projectId: string, data: MessagesData) {
  ensureProjectDir(projectId)
  fs.writeFileSync(getMessagesFile(projectId), JSON.stringify(data, null, 2), 'utf-8')
}

export function getBranches(projectId: string): BranchInfo[] {
  return readMessagesData(projectId).branches || []
}

export function createBranch(
  projectId: string,
  fromMessageId: string,
  name?: string
): { branch?: BranchInfo; error?: string } {
  const data = readMessagesData(projectId)
  const all = data.messages

  const forkIndex = all.findIndex(m => m.id === fromMessageId)
  if (forkIndex === -1) return { error: '消息不存在' }

  if (!data.branches) data.branches = []
  if (data.branches.length >= MAX_BRANCHES) {
    return { error: `分支数量已达上限 (${MAX_BRANCHES})` }
  }

  const branchId = `branch_${Date.now()}_${randomUUID().slice(0, 4)}`
  const branch: BranchInfo = {
    id: branchId,
    name: name || `分支 ${data.branches.length + 1}`,
    forkFromMessageId: fromMessageId,
    forkAtIndex: forkIndex,
    messages: all.slice(0, forkIndex + 1), // 复制分叉点及之前的消息
    createdAt: new Date().toISOString(),
  }

  data.branches.push(branch)
  writeMessagesData(projectId, data)

  return { branch }
}

export function getBranchMessages(projectId: string, branchId: string): ChatMessage[] {
  const data = readMessagesData(projectId)
  if (branchId === 'main') return data.messages
  const branch = data.branches?.find(b => b.id === branchId)
  return branch?.messages || []
}

export function addBranchMessage(projectId: string, branchId: string, msg: ChatMessage) {
  if (branchId === 'main') {
    addMessage(projectId, msg)
    return
  }

  const data = readMessagesData(projectId)
  const branch = data.branches?.find(b => b.id === branchId)
  if (!branch) return

  if (!branch.messages) branch.messages = []
  branch.messages.push(msg)

  // 截断
  if (branch.messages.length > MAX_MESSAGES) {
    branch.messages = branch.messages.slice(branch.messages.length - MAX_MESSAGES)
  }

  writeMessagesData(projectId, data)
}

export function deleteBranch(projectId: string, branchId: string): boolean {
  if (branchId === 'main') return false // 不能删除主线

  const data = readMessagesData(projectId)
  if (!data.branches) return false

  const idx = data.branches.findIndex(b => b.id === branchId)
  if (idx === -1) return false

  data.branches.splice(idx, 1)
  writeMessagesData(projectId, data)
  return true
}

// ── 标签 & 收藏 ──

/** 切换消息收藏状态 */
export function toggleStar(projectId: string, messageId: string): ChatMessage | null {
  const data = readMessagesData(projectId)
  const msg = data.messages.find(m => m.id === messageId)
  if (!msg) return null

  msg.isStarred = !msg.isStarred
  writeMessagesData(projectId, data)
  return msg
}

/** 为消息添加标签 */
export function addTag(projectId: string, messageId: string, tag: string): ChatMessage | null {
  const data = readMessagesData(projectId)
  const msg = data.messages.find(m => m.id === messageId)
  if (!msg) return null

  if (!msg.tags) msg.tags = []
  if (!msg.tags.includes(tag)) {
    msg.tags.push(tag)
  }
  writeMessagesData(projectId, data)
  return msg
}

/** 为消息移除标签 */
export function removeTag(projectId: string, messageId: string, tag: string): ChatMessage | null {
  const data = readMessagesData(projectId)
  const msg = data.messages.find(m => m.id === messageId)
  if (!msg) return null

  if (msg.tags) {
    msg.tags = msg.tags.filter(t => t !== tag)
    if (msg.tags.length === 0) delete msg.tags
  }
  writeMessagesData(projectId, data)
  return msg
}

/** 获取项目中所有已使用的标签（去重） */
export function getAllTags(projectId: string): string[] {
  const data = readMessagesData(projectId)
  const tagSet = new Set<string>()
  for (const msg of data.messages) {
    if (msg.tags) {
      for (const t of msg.tags) tagSet.add(t)
    }
  }
  return Array.from(tagSet).sort()
}

/** 获取带收藏状态的所有标签 */
export function getTagsWithCount(projectId: string): { name: string; count: number }[] {
  const data = readMessagesData(projectId)
  const tagMap = new Map<string, number>()
  for (const msg of data.messages) {
    if (msg.tags) {
      for (const t of msg.tags) {
        tagMap.set(t, (tagMap.get(t) || 0) + 1)
      }
    }
  }
  return Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/** 获取收藏的消息 */
export function getStarredMessages(projectId: string): ChatMessage[] {
  const data = readMessagesData(projectId)
  return data.messages.filter(m => m.isStarred)
}
