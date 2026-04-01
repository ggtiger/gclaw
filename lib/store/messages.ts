import fs from 'fs'
import path from 'path'
import type { ChatMessage } from '@/types/chat'

const DATA_DIR = path.join(process.cwd(), 'data')
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json')
const MAX_MESSAGES = 500

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readMessages(): ChatMessage[] {
  ensureDataDir()
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return []
    const raw = fs.readFileSync(MESSAGES_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.messages) ? data.messages : []
  } catch {
    return []
  }
}

function writeMessages(messages: ChatMessage[]) {
  ensureDataDir()
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages }, null, 2), 'utf-8')
}

export function getMessages(limit = 50, before?: string): { messages: ChatMessage[]; hasMore: boolean } {
  const all = readMessages()
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

export function addMessage(msg: ChatMessage) {
  const messages = readMessages()
  messages.push(msg)
  // 超过上限时截断
  if (messages.length > MAX_MESSAGES) {
    writeMessages(messages.slice(messages.length - MAX_MESSAGES))
  } else {
    writeMessages(messages)
  }
}

export function clearMessages() {
  writeMessages([])
}
