/**
 * 轻量文件日志系统
 * 同时输出到 console 和文件（data/logs/gclaw-{date}.log）
 * 按天滚动，自动清理 7 天前的日志
 */

import fs from 'fs'
import path from 'path'

// 不从 projects.ts 导入 DATA_DIR，避免循环依赖（projects.ts → logger.ts → projects.ts）
const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const LOG_DIR = path.join(DATA_DIR, 'logs')
const MAX_LOG_DAYS = 7

type LogLevel = 'info' | 'warn' | 'error'

/** 缓冲区：同一秒内的多次写入合并为一次 writeSync */
let buffer: string[] = []
let bufferTimer: ReturnType<typeof setTimeout> | null = null

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function getLogFilePath(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(LOG_DIR, `gclaw-${date}.log`)
}

function formatTime(): string {
  const now = new Date()
  return now.toTimeString().slice(0, 8) // HH:mm:ss
}

function flushBuffer(): void {
  if (buffer.length === 0) return
  const data = buffer.join('\n') + '\n'
  buffer = []
  bufferTimer = null

  try {
    ensureLogDir()
    fs.appendFileSync(getLogFilePath(), data, 'utf-8')
  } catch {
    // 写入失败时静默，console 已输出
  }
}

function writeToFile(level: LogLevel, ...args: unknown[]): void {
  const tag = level === 'info' ? 'INFO' : level === 'warn' ? 'WARN' : 'ERROR'
  const timestamp = formatTime()
  const message = args.map(a =>
    typeof a === 'string' ? a : (a instanceof Error ? a.stack || a.message : String(a))
  ).join(' ')
  const line = `[${timestamp}] [${tag}] ${message}`

  buffer.push(line)

  // 同一秒内的写入合并
  if (!bufferTimer) {
    bufferTimer = setTimeout(flushBuffer, 0)
  }
}

/** 清理超过 MAX_LOG_DAYS 天的日志文件 */
function cleanOldLogs(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) return
    const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000
    for (const file of fs.readdirSync(LOG_DIR)) {
      if (!file.startsWith('gclaw-') || !file.endsWith('.log')) continue
      const filePath = path.join(LOG_DIR, file)
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // 忽略单个文件清理错误
      }
    }
  } catch {
    // 忽略清理错误
  }
}

// 启动时清理旧日志
cleanOldLogs()

export const logger = {
  info(...args: unknown[]): void {
    console.log(...args)
    writeToFile('info', ...args)
  },

  warn(...args: unknown[]): void {
    console.warn(...args)
    writeToFile('warn', ...args)
  },

  error(...args: unknown[]): void {
    console.error(...args)
    writeToFile('error', ...args)
  },
}
