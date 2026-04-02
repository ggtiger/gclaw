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
