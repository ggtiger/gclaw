import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const LOG_DIR = path.join(DATA_DIR, 'logs')

interface LogEntry {
  time: string
  level: string
  message: string
}

function parseLogLine(line: string): LogEntry | null {
  // 格式: [HH:mm:ss] [LEVEL] message
  const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*\[(\w+)\]\s*(.*)$/)
  if (!match) return null
  return { time: match[1], level: match[2].toLowerCase(), message: match[3] }
}

function getAvailableDates(): string[] {
  if (!fs.existsSync(LOG_DIR)) return []
  const files = fs.readdirSync(LOG_DIR)
  const dates = files
    .filter(f => f.startsWith('gclaw-') && f.endsWith('.log'))
    .map(f => f.replace('gclaw-', '').replace('.log', ''))
    .sort()
    .reverse()
  return dates
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const level = searchParams.get('level') || ''
  const search = searchParams.get('search') || ''
  const rawLimit = parseInt(searchParams.get('limit') || '500', 10)
  const limit = Math.min(Math.max(rawLimit, 1), 2000)

  // 验证日期格式防止路径遍历
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '无效日期格式' }, { status: 400 })
  }

  const logFile = path.join(LOG_DIR, `gclaw-${date}.log`)

  if (!fs.existsSync(logFile)) {
    return NextResponse.json({
      entries: [],
      total: 0,
      availableDates: getAvailableDates(),
    })
  }

  const content = fs.readFileSync(logFile, 'utf-8')
  const lines = content.split('\n').filter(Boolean)

  let entries: LogEntry[] = []
  for (const line of lines) {
    const entry = parseLogLine(line)
    if (!entry) continue
    if (level && entry.level !== level) continue
    if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) continue
    entries.push(entry)
  }

  const total = entries.length
  // 返回最后 limit 条
  entries = entries.slice(-limit)

  return NextResponse.json({
    entries,
    total,
    availableDates: getAvailableDates(),
  })
}
