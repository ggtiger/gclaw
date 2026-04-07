/**
 * 记忆系统 JSON 存储层
 * 负责读写 episodic/semantic/procedures 的 JSON 文件
 */

import fs from 'fs'
import path from 'path'
import type { EpisodicDay, EpisodicEntry, SemanticMemory, SemanticEntry, ProceduralMemory, ProceduralEntry } from '@/types/memory'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

// ── 路径工具 ──

/** 用户级记忆根目录 */
function userMemoryDir(userId: string): string {
  return path.join(DATA_DIR, 'memory', userId)
}

/** 项目级记忆根目录 */
function projectMemoryDir(projectId: string): string {
  return path.join(DATA_DIR, 'projects', projectId, '.data', 'memory')
}

/** 情节记忆目录 */
function episodicDir(baseDir: string): string {
  return path.join(baseDir, 'episodic')
}

/** 情节记忆文件路径 */
function episodicFile(baseDir: string, date: string): string {
  return path.join(episodicDir(baseDir), `${date}.json`)
}

/** 语义记忆文件路径 */
function semanticFile(baseDir: string): string {
  return path.join(baseDir, 'semantic.json')
}

/** 程序记忆文件路径 */
function proceduresFile(baseDir: string): string {
  return path.join(baseDir, 'procedures.json')
}

/** 总纲文件路径 */
function overviewFile(baseDir: string): string {
  return path.join(baseDir, 'overview.md')
}

// ── 目录初始化 ──

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function ensureMemoryDirs(baseDir: string): void {
  ensureDir(baseDir)
  ensureDir(episodicDir(baseDir))
}

// ── ID 生成 ──

let entryCounter = 0

function generateId(prefix: string): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  entryCounter = (entryCounter + 1) % 1000
  return `${prefix}-${date}-${String(entryCounter).padStart(3, '0')}`
}

// ── 情节记忆 ──

export function readEpisodicDay(baseDir: string, date: string): EpisodicDay {
  const filePath = episodicFile(baseDir, date)
  try {
    if (!fs.existsSync(filePath)) return { date, entries: [] }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as EpisodicDay
  } catch {
    return { date, entries: [] }
  }
}

export function writeEpisodicDay(baseDir: string, day: EpisodicDay): void {
  ensureDir(episodicDir(baseDir))
  const filePath = episodicFile(baseDir, day.date)
  fs.writeFileSync(filePath, JSON.stringify(day, null, 2), 'utf-8')
}

export function appendEpisodicEntry(baseDir: string, entry: EpisodicEntry): void {
  const date = entry.timestamp.slice(0, 10)
  const day = readEpisodicDay(baseDir, date)
  day.entries.push(entry)
  writeEpisodicDay(baseDir, day)
}

/** 读取最近 N 天的情节点 */
export function readRecentEpisodic(baseDir: string, days: number = 7): EpisodicEntry[] {
  const dir = episodicDir(baseDir)
  if (!fs.existsSync(dir)) return []

  const entries: EpisodicEntry[] = []
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-days)

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      const day = JSON.parse(raw) as EpisodicDay
      entries.push(...day.entries)
    } catch {
      // skip corrupted files
    }
  }
  return entries
}

// ── 语义记忆 ──

const EMPTY_SEMANTIC: SemanticMemory = { entries: [], lastConsolidatedAt: '' }

export function readSemantic(baseDir: string): SemanticMemory {
  const filePath = semanticFile(baseDir)
  try {
    if (!fs.existsSync(filePath)) return { ...EMPTY_SEMANTIC }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as SemanticMemory
  } catch {
    return { ...EMPTY_SEMANTIC }
  }
}

export function writeSemantic(baseDir: string, data: SemanticMemory): void {
  ensureDir(baseDir)
  fs.writeFileSync(semanticFile(baseDir), JSON.stringify(data, null, 2), 'utf-8')
}

export function addSemanticEntry(baseDir: string, entry: SemanticEntry): void {
  const data = readSemantic(baseDir)
  data.entries.push(entry)
  writeSemantic(baseDir, data)
}

export function updateSemanticEntry(baseDir: string, id: string, updates: Partial<SemanticEntry>): SemanticEntry | null {
  const data = readSemantic(baseDir)
  const entry = data.entries.find(e => e.id === id)
  if (!entry) return null
  Object.assign(entry, updates, { updatedAt: new Date().toISOString() })
  writeSemantic(baseDir, data)
  return entry
}

// ── 程序记忆 ──

const EMPTY_PROCEDURAL: ProceduralMemory = { entries: [], lastConsolidatedAt: '' }

export function readProcedural(baseDir: string): ProceduralMemory {
  const filePath = proceduresFile(baseDir)
  try {
    if (!fs.existsSync(filePath)) return { ...EMPTY_PROCEDURAL }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as ProceduralMemory
  } catch {
    return { ...EMPTY_PROCEDURAL }
  }
}

export function writeProcedural(baseDir: string, data: ProceduralMemory): void {
  ensureDir(baseDir)
  fs.writeFileSync(proceduresFile(baseDir), JSON.stringify(data, null, 2), 'utf-8')
}

export function addProceduralEntry(baseDir: string, entry: ProceduralEntry): void {
  const data = readProcedural(baseDir)
  data.entries.push(entry)
  writeProcedural(baseDir, data)
}

export function updateProceduralEntry(baseDir: string, id: string, updates: Partial<ProceduralEntry>): ProceduralEntry | null {
  const data = readProcedural(baseDir)
  const entry = data.entries.find(e => e.id === id)
  if (!entry) return null
  Object.assign(entry, updates, { updatedAt: new Date().toISOString() })
  writeProcedural(baseDir, data)
  return entry
}

// ── 总纲 ──

export function readOverview(userId: string): string {
  const filePath = overviewFile(userMemoryDir(userId))
  try {
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export function writeOverview(userId: string, content: string): void {
  const dir = userMemoryDir(userId)
  ensureDir(dir)
  fs.writeFileSync(overviewFile(dir), content, 'utf-8')
}

// ── 统一接口 ──

export function getMemoryBaseDirs(userId: string, projectId?: string): string[] {
  const dirs: string[] = [userMemoryDir(userId)]
  if (projectId) {
    dirs.push(projectMemoryDir(projectId))
  }
  return dirs
}

/** 初始化记忆目录结构 */
export function initMemoryDirs(userId: string, projectId?: string): void {
  for (const dir of getMemoryBaseDirs(userId, projectId)) {
    ensureMemoryDirs(dir)
  }
}

export const store = {
  userMemoryDir,
  projectMemoryDir,
  generateId,
  // episodic
  readEpisodicDay,
  writeEpisodicDay,
  appendEpisodicEntry,
  readRecentEpisodic,
  // semantic
  readSemantic,
  writeSemantic,
  addSemanticEntry,
  updateSemanticEntry,
  // procedural
  readProcedural,
  writeProcedural,
  addProceduralEntry,
  updateProceduralEntry,
  // overview
  readOverview,
  writeOverview,
  // util
  getMemoryBaseDirs,
  initMemoryDirs,
}
