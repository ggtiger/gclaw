// lib/focus/store.ts
// Focus 数据持久化层
// 支持 file（本地 JSON 文件）和 skill（技能系统）两种数据源
// Skill Provider: lib/focus/providers/skill-provider.ts
// API Provider: TODO（HTTP fetch 外部接口）

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getProjectDir, getProjectDataDir, assertValidProjectId } from '@/lib/store/projects'
import { getFocusDataFromSkill } from '@/lib/focus/providers/skill-provider'
import type { FocusTodo, FocusNote, FocusEvent, FocusSettings, FocusDataType } from '@/types/focus'
import { DEFAULT_FOCUS_SETTINGS } from '@/types/focus'

// ── Focus Settings ──

export function getFocusSettings(projectId: string): FocusSettings {
  assertValidProjectId(projectId)
  const dir = getProjectDataDir(projectId)
  const file = path.join(dir, 'focus-settings.json')
  try {
    if (!fs.existsSync(file)) return { ...DEFAULT_FOCUS_SETTINGS }
    const raw = fs.readFileSync(file, 'utf-8')
    return { ...DEFAULT_FOCUS_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_FOCUS_SETTINGS }
  }
}

export function updateFocusSettings(projectId: string, settings: FocusSettings): FocusSettings {
  assertValidProjectId(projectId)
  const dir = getProjectDataDir(projectId)
  fs.writeFileSync(path.join(dir, 'focus-settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
  return settings
}

// ── Focus Data File Path ──

function getFocusDataPath(projectId: string, type: FocusDataType): string {
  assertValidProjectId(projectId)
  const projectDir = getProjectDir(projectId)
  const settings = getFocusSettings(projectId)
  const config = settings[type]
  if (config?.type === 'file' && config.filePath) {
    return path.join(projectDir, config.filePath)
  }
  // Default path
  return path.join(getProjectDataDir(projectId), 'focus', `${type}.json`)
}

function ensureFocusDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * 判断指定数据类型是否使用 skill 数据源
 */
function isSkillSource(projectId: string, type: FocusDataType): boolean {
  const settings = getFocusSettings(projectId)
  const config = settings[type]
  return config?.type === 'skill' && !!config.skillName
}

/**
 * 获取指定数据类型的 skill 配置
 */
function getSkillConfig(projectId: string, type: FocusDataType): { skillName: string; params?: Record<string, string> } | null {
  const settings = getFocusSettings(projectId)
  const config = settings[type]
  if (config?.type !== 'skill' || !config.skillName) return null
  return { skillName: config.skillName, params: config.skillParams }
}

// ── Generic CRUD helpers ──

function readData<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeData<T>(filePath: string, data: T[]) {
  ensureFocusDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Todo CRUD ──

export function getTodos(projectId: string): FocusTodo[] {
  // skill 数据源：从技能获取数据（同步接口，直接返回空数组，异步版本见 getTodosAsync）
  if (isSkillSource(projectId, 'todos')) return []
  return readData<FocusTodo>(getFocusDataPath(projectId, 'todos'))
}

/**
 * 异步获取 Todos（支持 skill 数据源）
 */
export async function getTodosAsync(projectId: string): Promise<FocusTodo[]> {
  const skillConfig = getSkillConfig(projectId, 'todos')
  if (skillConfig) {
    const result = await getFocusDataFromSkill(skillConfig.skillName, 'todos', skillConfig.params)
    return result.data as FocusTodo[]
  }
  return readData<FocusTodo>(getFocusDataPath(projectId, 'todos'))
}

export function createTodo(projectId: string, input: Omit<FocusTodo, 'id' | 'createdAt' | 'updatedAt'>): FocusTodo {
  const now = new Date().toISOString()
  const todo: FocusTodo = { ...input, id: randomUUID().slice(0, 8), createdAt: now, updatedAt: now }
  const todos = getTodos(projectId)
  todos.unshift(todo)
  writeData(getFocusDataPath(projectId, 'todos'), todos)
  return todo
}

export function updateTodo(projectId: string, todo: FocusTodo): FocusTodo {
  const updated = { ...todo, updatedAt: new Date().toISOString() }
  const todos = getTodos(projectId).map(t => t.id === todo.id ? updated : t)
  writeData(getFocusDataPath(projectId, 'todos'), todos)
  return updated
}

export function deleteTodo(projectId: string, id: string): void {
  const todos = getTodos(projectId).filter(t => t.id !== id)
  writeData(getFocusDataPath(projectId, 'todos'), todos)
}

// ── Note CRUD ──

export function getNotes(projectId: string): FocusNote[] {
  if (isSkillSource(projectId, 'notes')) return []
  return readData<FocusNote>(getFocusDataPath(projectId, 'notes'))
}

/**
 * 异步获取 Notes（支持 skill 数据源）
 */
export async function getNotesAsync(projectId: string): Promise<FocusNote[]> {
  const skillConfig = getSkillConfig(projectId, 'notes')
  if (skillConfig) {
    const result = await getFocusDataFromSkill(skillConfig.skillName, 'notes', skillConfig.params)
    return result.data as FocusNote[]
  }
  return readData<FocusNote>(getFocusDataPath(projectId, 'notes'))
}

export function createNote(projectId: string, input: Omit<FocusNote, 'id' | 'createdAt' | 'updatedAt'>): FocusNote {
  const now = new Date().toISOString()
  const note: FocusNote = { ...input, id: randomUUID().slice(0, 8), createdAt: now, updatedAt: now }
  const notes = getNotes(projectId)
  notes.unshift(note)
  writeData(getFocusDataPath(projectId, 'notes'), notes)
  return note
}

export function updateNote(projectId: string, note: FocusNote): FocusNote {
  const updated = { ...note, updatedAt: new Date().toISOString() }
  const notes = getNotes(projectId).map(n => n.id === note.id ? updated : n)
  writeData(getFocusDataPath(projectId, 'notes'), notes)
  return updated
}

export function deleteNote(projectId: string, id: string): void {
  const notes = getNotes(projectId).filter(n => n.id !== id)
  writeData(getFocusDataPath(projectId, 'notes'), notes)
}

// ── Event CRUD ──

export function getEvents(projectId: string): FocusEvent[] {
  if (isSkillSource(projectId, 'events')) return []
  return readData<FocusEvent>(getFocusDataPath(projectId, 'events'))
}

/**
 * 异步获取 Events（支持 skill 数据源）
 */
export async function getEventsAsync(projectId: string): Promise<FocusEvent[]> {
  const skillConfig = getSkillConfig(projectId, 'events')
  if (skillConfig) {
    const result = await getFocusDataFromSkill(skillConfig.skillName, 'events', skillConfig.params)
    return result.data as FocusEvent[]
  }
  return readData<FocusEvent>(getFocusDataPath(projectId, 'events'))
}

export function createEvent(projectId: string, input: Omit<FocusEvent, 'id'>): FocusEvent {
  const event: FocusEvent = { ...input, id: randomUUID().slice(0, 8) }
  const events = getEvents(projectId)
  events.unshift(event)
  writeData(getFocusDataPath(projectId, 'events'), events)
  return event
}

export function updateEvent(projectId: string, event: FocusEvent): FocusEvent {
  const events = getEvents(projectId).map(e => e.id === event.id ? event : e)
  writeData(getFocusDataPath(projectId, 'events'), events)
  return event
}

export function deleteEvent(projectId: string, id: string): void {
  const events = getEvents(projectId).filter(e => e.id !== id)
  writeData(getFocusDataPath(projectId, 'events'), events)
}
