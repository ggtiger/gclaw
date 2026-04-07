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
