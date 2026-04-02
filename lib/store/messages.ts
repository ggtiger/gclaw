import fs from 'fs'
import path from 'path'
import type { ChatMessage } from '@/types/chat'
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
