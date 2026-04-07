# Focus Mode Real Data Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FocusPanel mock data with real data sources (file/skill/API), supporting full CRUD for todos, notes, and calendar events, configurable per data source.

**Architecture:** Plugin-based data provider pattern. Each data area (todos/notes/events) has a configurable data source. A unified API route dispatches CRUD operations to the appropriate provider. FocusPanel consumes data via a React hook.

**Tech Stack:** Next.js 15 API routes, React hooks, TypeScript, file-system JSON storage

**Spec:** `docs/superpowers/specs/2026-04-07-focus-mode-real-data-design.md`

---

## Chunk 1: Types & Data Layer

### Task 1: Create focus type definitions

**Files:**
- Create: `types/focus.ts`

- [ ] **Step 1: Create `types/focus.ts`**

```typescript
// types/focus.ts

// ── 专注数据类型 ──

export interface FocusTodo {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
  createdAt: string
  updatedAt: string
}

export interface FocusNote {
  id: string
  title: string
  content: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface FocusEvent {
  id: string
  title: string
  description?: string
  startTime: string
  endTime?: string
  location?: string
  color?: string
}

// ── 数据源配置 ──

export type FocusDataSourceType = 'file' | 'skill' | 'api'

export interface FocusDataSourceConfig {
  type: FocusDataSourceType
  enabled: boolean
  // file
  filePath?: string
  format?: 'json' | 'markdown' | 'ics'
  // skill
  skillName?: string
  skillParams?: Record<string, string>
  // api
  apiUrl?: string
  apiMethod?: 'GET' | 'POST'
  apiHeaders?: Record<string, string>
}

// ── 专注模式设置 ──

export interface FocusSettings {
  todos: FocusDataSourceConfig
  notes: FocusDataSourceConfig
  events: FocusDataSourceConfig
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  todos:   { type: 'file', enabled: true, filePath: '.data/focus/todos.json', format: 'json' },
  notes:   { type: 'file', enabled: true, filePath: '.data/focus/notes.json', format: 'json' },
  events:  { type: 'file', enabled: true, filePath: '.data/focus/events.json', format: 'json' },
}

// ── 数据类型映射 ──

export type FocusDataType = 'todos' | 'notes' | 'events'
export type FocusDataItem = FocusTodo | FocusNote | FocusEvent
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to focus types

---

### Task 2: Create focus data store (file provider)

**Files:**
- Create: `lib/focus/store.ts`

This handles reading/writing JSON data files for the file data source, plus focus settings persistence.

- [ ] **Step 1: Create `lib/focus/store.ts`**

```typescript
// lib/focus/store.ts
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getProjectDir, getProjectDataDir, assertValidProjectId } from '@/lib/store/projects'
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

// ── Generic CRUD ──

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
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 3: Create focus API routes

**Files:**
- Create: `app/api/focus/route.ts`
- Create: `app/api/focus/settings/route.ts`

- [ ] **Step 1: Create `app/api/focus/route.ts`**

```typescript
// app/api/focus/route.ts
import { NextRequest } from 'next/server'
import {
  getTodos, createTodo, updateTodo, deleteTodo,
  getNotes, createNote, updateNote, deleteNote,
  getEvents, createEvent, updateEvent, deleteEvent,
} from '@/lib/focus/store'
import { isValidProjectId } from '@/lib/store/projects'
import type { FocusDataType } from '@/types/focus'

export const dynamic = 'force-dynamic'

function getParams(request: NextRequest) {
  const url = new URL(request.url)
  return {
    projectId: url.searchParams.get('projectId') || '',
    type: (url.searchParams.get('type') || '') as FocusDataType,
    id: url.searchParams.get('id') || '',
  }
}

const VALID_TYPES: FocusDataType[] = ['todos', 'notes', 'events']

export async function GET(request: NextRequest) {
  const { projectId, type } = getParams(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return Response.json({ error: 'Invalid type' }, { status: 400 })

  const data = type === 'todos' ? getTodos(projectId)
    : type === 'notes' ? getNotes(projectId)
    : getEvents(projectId)
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const { projectId, type } = getParams(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return Response.json({ error: 'Invalid type' }, { status: 400 })

  const body = await request.json()
  const item = type === 'todos' ? createTodo(projectId, body)
    : type === 'notes' ? createNote(projectId, body)
    : createEvent(projectId, body)
  return Response.json(item)
}

export async function PUT(request: NextRequest) {
  const { projectId, type } = getParams(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return Response.json({ error: 'Invalid type' }, { status: 400 })

  const body = await request.json()
  if (!body.id) return Response.json({ error: 'Missing id' }, { status: 400 })
  const item = type === 'todos' ? updateTodo(projectId, body)
    : type === 'notes' ? updateNote(projectId, body)
    : updateEvent(projectId, body)
  return Response.json(item)
}

export async function DELETE(request: NextRequest) {
  const { projectId, type, id } = getParams(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return Response.json({ error: 'Invalid type' }, { status: 400 })
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  if (type === 'todos') deleteTodo(projectId, id)
  else if (type === 'notes') deleteNote(projectId, id)
  else deleteEvent(projectId, id)
  return Response.json({ success: true })
}
```

- [ ] **Step 2: Create `app/api/focus/settings/route.ts`**

```typescript
// app/api/focus/settings/route.ts
import { NextRequest } from 'next/server'
import { getFocusSettings, updateFocusSettings } from '@/lib/focus/store'
import { isValidProjectId } from '@/lib/store/projects'
import type { FocusSettings } from '@/types/focus'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  return Response.json(getFocusSettings(projectId))
}

export async function PUT(request: NextRequest) {
  const projectId = getProjectId(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  const body: FocusSettings = await request.json()
  const settings = updateFocusSettings(projectId, body)
  return Response.json(settings)
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add types/focus.ts lib/focus/store.ts app/api/focus/route.ts app/api/focus/settings/route.ts
git commit -m "feat: add focus data types, store, and API routes"
```

---

## Chunk 2: Frontend Hook & Components

### Task 4: Create useFocusData hook

**Files:**
- Create: `hooks/useFocusData.ts`

- [ ] **Step 1: Create `hooks/useFocusData.ts`**

```typescript
// hooks/useFocusData.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FocusTodo, FocusNote, FocusEvent, FocusDataType, FocusSettings } from '@/types/focus'
import { DEFAULT_FOCUS_SETTINGS } from '@/types/focus'

type FocusDataMap = {
  todos: FocusTodo[]
  notes: FocusNote[]
  events: FocusEvent[]
}

export function useFocusData(projectId: string) {
  const [todos, setTodos] = useState<FocusTodo[]>([])
  const [notes, setNotes] = useState<FocusNote[]>([])
  const [events, setEvents] = useState<FocusEvent[]>([])
  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS)
  const [loading, setLoading] = useState(true)

  // Fetch all data
  const fetchAll = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [todosRes, notesRes, eventsRes, settingsRes] = await Promise.all([
        fetch(`/api/focus?projectId=${projectId}&type=todos`),
        fetch(`/api/focus?projectId=${projectId}&type=notes`),
        fetch(`/api/focus?projectId=${projectId}&type=events`),
        fetch(`/api/focus/settings?projectId=${projectId}`),
      ])
      setTodos(await todosRes.json())
      setNotes(await notesRes.json())
      setEvents(await eventsRes.json())
      const s = await settingsRes.json()
      if (s && !s.error) setSettings(s)
    } catch (err) {
      console.error('[useFocusData] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Generic CRUD helper
  const crud = useCallback(async <T extends { id?: string }>(
    type: FocusDataType,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: T
  ): Promise<T | null> => {
    const params = new URLSearchParams({ projectId, type })
    if (method === 'DELETE' && body?.id) params.set('id', body.id)
    const res = await fetch(`/api/focus?${params}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'DELETE' ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) return null
    return res.json()
  }, [projectId])

  // Todo actions
  const addTodo = useCallback(async (title: string) => {
    const item = await crud<FocusTodo>('todos', 'POST', { title, status: 'pending' })
    if (item) setTodos(prev => [item, ...prev])
    return item
  }, [crud])

  const toggleTodo = useCallback(async (todo: FocusTodo) => {
    const checked = todo.status === 'completed'
    const updated = { ...todo, status: checked ? 'pending' : 'completed' as const }
    const item = await crud<FocusTodo>('todos', 'PUT', updated)
    if (item) setTodos(prev => prev.map(t => t.id === item.id ? item : t))
  }, [crud])

  const removeTodo = useCallback(async (id: string) => {
    await crud('todos', 'DELETE', { id } as FocusTodo)
    setTodos(prev => prev.filter(t => t.id !== id))
  }, [crud])

  // Note actions
  const addNote = useCallback(async (title: string, content: string) => {
    const item = await crud<FocusNote>('notes', 'POST', { title, content })
    if (item) setNotes(prev => [item, ...prev])
    return item
  }, [crud])

  const saveNote = useCallback(async (note: FocusNote) => {
    const item = await crud<FocusNote>('notes', 'PUT', note)
    if (item) setNotes(prev => prev.map(n => n.id === item.id ? item : n))
  }, [crud])

  const removeNote = useCallback(async (id: string) => {
    await crud('notes', 'DELETE', { id } as FocusNote)
    setNotes(prev => prev.filter(n => n.id !== id))
  }, [crud])

  // Event actions
  const addEvent = useCallback(async (event: Omit<FocusEvent, 'id'>) => {
    const item = await crud<FocusEvent>('events', 'POST', event as FocusEvent)
    if (item) setEvents(prev => [item, ...prev])
    return item
  }, [crud])

  const removeEvent = useCallback(async (id: string) => {
    await crud('events', 'DELETE', { id } as FocusEvent)
    setEvents(prev => prev.filter(e => e.id !== id))
  }, [crud])

  // Settings actions
  const saveSettings = useCallback(async (newSettings: FocusSettings) => {
    const res = await fetch(`/api/focus/settings?projectId=${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    })
    const saved = await res.json()
    if (saved && !saved.error) {
      setSettings(saved)
      await fetchAll() // Re-fetch data with new settings
    }
  }, [projectId, fetchAll])

  return {
    loading,
    todos, notes, events, settings,
    addTodo, toggleTodo, removeTodo,
    addNote, saveNote, removeNote,
    addEvent, removeEvent,
    saveSettings, refetch: fetchAll,
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

---

### Task 5: Create TodoList component

**Files:**
- Create: `components/panels/focus/TodoList.tsx`

- [ ] **Step 1: Create `components/panels/focus/TodoList.tsx`**

```tsx
// components/panels/focus/TodoList.tsx
'use client'

import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { FocusTodo } from '@/types/focus'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
}
const statusLabels: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
}

interface Props {
  todos: FocusTodo[]
  loading: boolean
  onToggle: (todo: FocusTodo) => void
  onAdd: (title: string) => Promise<FocusTodo | null>
  onRemove: (id: string) => void
}

export default function TodoList({ todos, loading, onToggle, onAdd, onRemove }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title || submitting) return
    setSubmitting(true)
    await onAdd(title)
    setNewTitle('')
    setSubmitting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleAdd()
    }
  }

  return (
    <div className="bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/40 dark:border-white/[0.06] p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">待办任务</span>
        <span className="text-[10px] text-gray-400">
          {todos.filter(t => t.status !== 'completed').length} 项待处理
        </span>
      </div>

      {/* 内联添加 */}
      <div className="flex items-center gap-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="添加新待办..."
          className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-400 placeholder:text-gray-400"
        />
        <button
          onClick={handleAdd}
          disabled={!newTitle.trim() || submitting}
          className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 hover:bg-purple-200 dark:hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-xs text-gray-400 text-center py-4">加载中...</div>
      ) : todos.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">暂无待办，添加一个吧</p>
      ) : (
        <div className="max-h-[220px] overflow-y-auto thin-scrollbar flex flex-col gap-2">
          {todos.slice(0, 10).map(todo => {
            const done = todo.status === 'completed'
            return (
              <div key={todo.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => onToggle(todo)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                    done ? 'bg-purple-600 border-purple-600' : 'border-gray-300 dark:border-gray-600 hover:border-purple-400'
                  }`}
                >
                  {done && <Check className="w-3 h-3 text-white" />}
                </button>
                <span className={`flex-1 text-sm truncate transition-all ${
                  done ? 'line-through opacity-50 text-gray-400' : 'text-gray-900 dark:text-white font-medium group-hover:text-purple-600'
                }`}>
                  {todo.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusColors[todo.status]}`}>
                  {statusLabels[todo.status]}
                </span>
                <button
                  onClick={() => onRemove(todo.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

---

### Task 6: Create NoteList component

**Files:**
- Create: `components/panels/focus/NoteList.tsx`

- [ ] **Step 1: Create `components/panels/focus/NoteList.tsx`**

```tsx
// components/panels/focus/NoteList.tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2, X, ChevronRight } from 'lucide-react'
import type { FocusNote } from '@/types/focus'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

interface Props {
  notes: FocusNote[]
  loading: boolean
  onAdd: (title: string, content: string) => Promise<FocusNote | null>
  onSave: (note: FocusNote) => void
  onRemove: (id: string) => void
}

export default function NoteList({ notes, loading, onAdd, onSave, onRemove }: Props) {
  const [editing, setEditing] = useState<FocusNote | 'new' | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  const startNew = () => {
    setEditing('new')
    setEditTitle('')
    setEditContent('')
  }

  const startEdit = (note: FocusNote) => {
    setEditing(note)
    setEditTitle(note.title)
    setEditContent(note.content)
  }

  const handleSave = async () => {
    const title = editTitle.trim()
    const content = editContent.trim()
    if (!title) return

    if (editing === 'new') {
      await onAdd(title, content)
    } else if (editing && typeof editing === 'object') {
      onSave({ ...editing, title, content })
    }
    setEditing(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditing(null)
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-amber-500">📝</span> 近期笔记
        </h2>
        <button
          onClick={startNew}
          className="text-purple-600 hover:opacity-80 text-xs font-medium bg-purple-100 dark:bg-purple-500/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> 添加笔记
        </button>
      </div>

      {/* 编辑态 */}
      {editing && (
        <div className="bg-purple-50 dark:bg-purple-500/10 rounded-lg p-3 mb-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="笔记标题"
              className="flex-1 text-sm font-medium bg-transparent outline-none placeholder:text-gray-400 text-gray-900 dark:text-white"
              autoFocus
            />
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="笔记内容..."
            rows={3}
            className="text-xs bg-transparent outline-none resize-none placeholder:text-gray-400 text-gray-600 dark:text-gray-300"
          />
          <button
            onClick={handleSave}
            disabled={!editTitle.trim()}
            className="self-end text-xs font-medium px-3 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            保存
          </button>
        </div>
      )}

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto thin-scrollbar min-h-0">
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="text-xs text-gray-400 text-center py-4">加载中...</div>
          ) : notes.length === 0 ? (
            <div className="bg-gray-100 dark:bg-white/5 rounded-lg p-3 text-xs text-gray-400 text-center">
              暂无笔记
            </div>
          ) : (
            notes.slice(0, 8).map(note => (
              <div
                key={note.id}
                onClick={() => startEdit(note)}
                className="bg-gray-100 dark:bg-white/5 rounded-lg p-3 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {note.title}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(note.createdAt)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); onRemove(note.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{note.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

---

### Task 7: Create CalendarView component

**Files:**
- Create: `components/panels/focus/CalendarView.tsx`

- [ ] **Step 1: Create `components/panels/focus/CalendarView.tsx`**

```tsx
// components/panels/focus/CalendarView.tsx
'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import type { FocusEvent } from '@/types/focus'

interface Props {
  events: FocusEvent[]
  loading: boolean
  onAdd: (event: Omit<FocusEvent, 'id'>) => Promise<FocusEvent | null>
  onRemove: (id: string) => void
}

export default function CalendarView({ events, loading, onAdd, onRemove }: Props) {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  // Build calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

  const cells: { day: number; isCurrentMonth: boolean; isToday: boolean; dateStr: string }[] = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const m = currentMonth === 0 ? 11 : currentMonth - 1
    const y = currentMonth === 0 ? currentYear - 1 : currentYear
    cells.push({ day: d, isCurrentMonth: false, isToday: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear()
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, isCurrentMonth: true, isToday, dateStr })
  }

  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1
    const y = currentMonth === 11 ? currentYear + 1 : currentYear
    cells.push({ day: d, isCurrentMonth: false, isToday: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }

  // Event dates set for dot indicators
  const eventDates = useMemo(() => {
    const set = new Set<string>()
    events.forEach(e => {
      const date = e.startTime.slice(0, 10)
      set.add(date)
    })
    return set
  }, [events])

  // Events for selected date
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return []
    return events.filter(e => e.startTime.startsWith(selectedDate))
  }, [events, selectedDate])

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const handleAddEvent = async () => {
    if (!newTitle.trim() || !selectedDate) return
    await onAdd({
      title: newTitle.trim(),
      startTime: `${selectedDate}T${newStartTime}:00`,
      endTime: `${selectedDate}T${newEndTime}:00`,
    })
    setNewTitle('')
    setShowAddForm(false)
  }

  return (
    <div className="bg-white/30 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/40 dark:border-white/[0.06] p-4 shadow-sm flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {currentYear}年 {monthNames[currentMonth]}
        </span>
        <div className="flex gap-1">
          <button onClick={handlePrevMonth} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={handleNextMonth} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week headers */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 dark:text-gray-500 mb-1">
        {weekDays.map(d => <span key={d}>{d}</span>)}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 text-center text-xs font-medium gap-y-1">
        {cells.map((cell, idx) => (
          <button
            key={idx}
            onClick={() => cell.isCurrentMonth && setSelectedDate(cell.dateStr)}
            className={`py-1 relative transition-colors rounded-full ${
              !cell.isCurrentMonth ? 'opacity-30 cursor-default' : 'cursor-pointer'
              } ${cell.isToday ? 'bg-purple-600 text-white' : 'hover:bg-purple-50 dark:hover:bg-purple-500/10'
              } ${selectedDate === cell.dateStr ? 'ring-2 ring-purple-400' : ''
              }`}
          >
            {cell.day}
            {eventDates.has(cell.dateStr) && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-500" />
            )}
          </button>
        ))}
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="mt-2 border-t border-gray-200 dark:border-white/10 pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {selectedDate} 日程
            </span>
            <button
              onClick={() => setShowAddForm(true)}
              className="p-1 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-600 hover:bg-purple-200 dark:hover:bg-purple-500/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {showAddForm && (
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2 mb-2 flex flex-col gap-1.5">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="日程标题"
                className="text-xs bg-white dark:bg-white/10 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-purple-400"
                autoFocus
              />
              <div className="flex gap-2 text-xs">
                <input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} className="flex-1 bg-white dark:bg-white/10 rounded px-2 py-1 outline-none" />
                <span className="text-gray-400">-</span>
                <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} className="flex-1 bg-white dark:bg-white/10 rounded px-2 py-1 outline-none" />
              </div>
              <div className="flex gap-1 self-end">
                <button onClick={() => setShowAddForm(false)} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">取消</button>
                <button onClick={handleAddEvent} disabled={!newTitle.trim()} className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40">添加</button>
              </div>
            </div>
          )}

          {selectedEvents.length === 0 && !showAddForm ? (
            <p className="text-[10px] text-gray-400 text-center py-1">当日无日程</p>
          ) : (
            <div className="flex flex-col gap-1">
              {selectedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 text-xs group">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-gray-400 shrink-0">{ev.startTime.slice(11, 16)}</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{ev.title}</span>
                  <button
                    onClick={() => onRemove(ev.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

---

### Task 8: Create FocusSettings modal component

**Files:**
- Create: `components/panels/focus/FocusSettings.tsx`

- [ ] **Step 1: Create `components/panels/focus/FocusSettings.tsx`**

```tsx
// components/panels/focus/FocusSettings.tsx
'use client'

import { useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import type { FocusSettings, FocusDataSourceType } from '@/types/focus'
import { DEFAULT_FOCUS_SETTINGS } from '@/types/focus'

interface Props {
  settings: FocusSettings
  onSave: (settings: FocusSettings) => void
  onClose: () => void
}

const typeLabels: Record<FocusDataSourceType, string> = {
  file: '文件',
  skill: 'Skill',
  api: 'API 接口',
}

const typeOptions: FocusDataSourceType[] = ['file', 'skill', 'api']

const sectionConfig = [
  { key: 'todos' as const, label: '📋 待办数据源', icon: '📋' },
  { key: 'notes' as const, label: '📝 笔记数据源', icon: '📝' },
  { key: 'events' as const, label: '📅 日程数据源', icon: '📅' },
]

export default function FocusSettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<FocusSettings>({ ...settings })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ todos: true })

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const updateSource = (key: keyof FocusSettings, field: string, value: unknown) => {
    setDraft(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-[380px] max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">专注模式设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          {sectionConfig.map(({ key, label }) => {
            const source = draft[key]
            const isOpen = expanded[key]
            return (
              <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(key)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 flex flex-col gap-2">
                    {/* Enabled toggle */}
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onChange={e => updateSource(key, 'enabled', e.target.checked)}
                        className="rounded"
                      />
                      已启用
                    </label>

                    {/* Type selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10">类型</span>
                      <select
                        value={source.type}
                        onChange={e => updateSource(key, 'type', e.target.value)}
                        className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                      >
                        {typeOptions.map(t => (
                          <option key={t} value={t}>{typeLabels[t]}</option>
                        ))}
                      </select>
                    </div>

                    {/* File config */}
                    {source.type === 'file' && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10">路径</span>
                          <input
                            value={source.filePath || ''}
                            onChange={e => updateSource(key, 'filePath', e.target.value)}
                            placeholder=".data/focus/todos.json"
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10">格式</span>
                          <select
                            value={source.format || 'json'}
                            onChange={e => updateSource(key, 'format', e.target.value)}
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          >
                            <option value="json">JSON</option>
                            <option value="markdown">Markdown</option>
                            <option value="ics">iCalendar (ICS)</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* Skill config */}
                    {source.type === 'skill' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-10">Skill</span>
                        <input
                          value={source.skillName || ''}
                          onChange={e => updateSource(key, 'skillName', e.target.value)}
                          placeholder="skill-name"
                          className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                        />
                      </div>
                    )}

                    {/* API config */}
                    {source.type === 'api' && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10">URL</span>
                          <input
                            value={source.apiUrl || ''}
                            onChange={e => updateSource(key, 'apiUrl', e.target.value)}
                            placeholder="https://api.example.com/todos"
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 9: Refactor FocusPanel to use real data

**Files:**
- Modify: `components/panels/FocusPanel.tsx` (full rewrite)
- Modify: `components/chat/ChatLayout.tsx:269` (pass projectId to FocusPanel)

- [ ] **Step 1: Rewrite `components/panels/FocusPanel.tsx`**

```tsx
// components/panels/FocusPanel.tsx
'use client'

import { useState } from 'react'
import { Settings, MoreVertical } from 'lucide-react'
import { useFocusData } from '@/hooks/useFocusData'
import TodoList from './focus/TodoList'
import NoteList from './focus/NoteList'
import CalendarView from './focus/CalendarView'
import FocusSettingsModal from './focus/FocusSettings'

interface Props {
  projectId: string
}

export default function FocusPanel({ projectId }: Props) {
  const {
    loading, todos, notes, events, settings,
    addTodo, toggleTodo, removeTodo,
    addNote, saveNote, removeNote,
    addEvent, removeEvent,
    saveSettings,
  } = useFocusData(projectId)

  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex flex-col overflow-hidden h-full bg-white dark:bg-transparent">
      {/* Header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">专注模式</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="专注模式设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Todos */}
      <div className="px-3 py-3 pt-0 pb-3 shrink-0">
        <TodoList todos={todos} loading={loading} onToggle={toggleTodo} onAdd={addTodo} onRemove={removeTodo} />
      </div>

      {/* Notes */}
      <div className="px-3 py-3 pt-0 pb-0 flex-1 min-h-0 overflow-hidden flex flex-col">
        <NoteList notes={notes} loading={loading} onAdd={addNote} onSave={saveNote} onRemove={removeNote} />
      </div>

      {/* Calendar */}
      <div className="px-3 py-3 pt-0 pb-3 shrink-0">
        <CalendarView events={events} loading={loading} onAdd={addEvent} onRemove={removeEvent} />
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <FocusSettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `components/chat/ChatLayout.tsx` line ~269**

Change `<FocusPanel />` to `<FocusPanel projectId={project.currentId} />`:

```tsx
{isSecretary ? <FocusPanel projectId={project.currentId} /> : <FilesPanel ... />}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add hooks/useFocusData.ts components/panels/focus/ components/panels/FocusPanel.tsx components/chat/ChatLayout.tsx
git commit -m "feat: replace FocusPanel mock data with real CRUD via useFocusData hook"
```

---

## Chunk 3: Skill & API Provider Stubs

### Task 10: Create provider interface and stubs

**Files:**
- Create: `lib/focus/providers/types.ts`
- Create: `lib/focus/providers/file-provider.ts`
- Create: `lib/focus/providers/skill-provider.ts`
- Create: `lib/focus/providers/api-provider.ts`
- Create: `lib/focus/providers/index.ts`

This task is deferred — the current file-provider via `lib/focus/store.ts` is sufficient for v1. The provider abstraction will be added when Skill or API data sources are needed.

- [ ] **Step 1: Add TODO comments to `lib/focus/store.ts`**

Add a comment at the top of `lib/focus/store.ts`:

```typescript
// TODO: When Skill/API providers are needed, refactor this into:
// lib/focus/providers/file-provider.ts (move current CRUD logic)
// lib/focus/providers/skill-provider.ts (call Skill system)
// lib/focus/providers/api-provider.ts (HTTP fetch)
// All implementing a common FocusDataProvider<T> interface.
```

- [ ] **Step 2: Commit**

```bash
git add lib/focus/store.ts
git commit -m "chore: add provider refactor TODO for future Skill/API data sources"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Type definitions | `types/focus.ts` |
| 2 | Data store (file provider) | `lib/focus/store.ts` |
| 3 | API routes | `app/api/focus/route.ts`, `app/api/focus/settings/route.ts` |
| 4 | React hook | `hooks/useFocusData.ts` |
| 5 | TodoList component | `components/panels/focus/TodoList.tsx` |
| 6 | NoteList component | `components/panels/focus/NoteList.tsx` |
| 7 | CalendarView component | `components/panels/focus/CalendarView.tsx` |
| 8 | FocusSettings modal | `components/panels/focus/FocusSettings.tsx` |
| 9 | FocusPanel refactor + ChatLayout update | `components/panels/FocusPanel.tsx`, `components/chat/ChatLayout.tsx` |
| 10 | Provider stubs TODO | `lib/focus/store.ts` |

Commits: 3 (one per chunk)
