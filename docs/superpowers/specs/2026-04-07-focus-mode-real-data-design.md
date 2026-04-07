# Focus Mode Real Data Design

## Overview

Replace FocusPanel mock data with real data sources. Three data areas (todos, notes, calendar events) each support configurable data sources (file, skill, API). Only available for secretary projects.

## Data Model (`types/focus.ts`)

```typescript
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

export type FocusDataSourceType = 'file' | 'skill' | 'api'

export interface FocusDataSourceConfig {
  type: FocusDataSourceType
  enabled: boolean
  filePath?: string
  format?: 'json' | 'markdown' | 'ics'
  skillName?: string
  skillParams?: Record<string, string>
  apiUrl?: string
  apiMethod?: 'GET' | 'POST'
  apiHeaders?: Record<string, string>
}

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
```

FocusSettings stored in project `.data/settings.json` under `focus` key.

## Architecture: Plugin Data Providers

```
FocusPanel (UI) → useFocusData(projectId) → FocusDataProvider → [FileProvider | SkillProvider | ApiProvider]
```

### Provider Interface (`lib/focus/types.ts`)

```typescript
export interface FocusDataProvider<T> {
  fetch(projectId: string, config: FocusDataSourceConfig): Promise<T[]>
  create(projectId: string, config: FocusDataSourceConfig, item: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>
  update(projectId: string, config: FocusDataSourceConfig, item: T): Promise<T>
  delete(projectId: string, config: FocusDataSourceConfig, id: string): Promise<void>
}
```

### Providers

1. **FileProvider** - Read/write JSON/Markdown/ICS files in project directory. Default data source.
2. **SkillProvider** - Invoke a named Skill to fetch data. Read-only initially.
3. **ApiProvider** - HTTP calls to external APIs (Todoist, Notion, Google Calendar). Configurable headers for auth.

### Provider Registry

```typescript
const providers: Record<FocusDataSourceType, FocusDataProvider<any>> = {
  file: new FileFocusProvider(),
  skill: new SkillFocusProvider(),
  api: new ApiFocusProvider(),
}
```

Route layer selects provider based on FocusSettings config.

## API Routes (`app/api/focus/`)

```
GET    /api/focus?projectId=xxx&type=todos|notes|events         — fetch data
POST   /api/focus?projectId=xxx&type=todos|notes|events         — create item
PUT    /api/focus?projectId=xxx&type=todos|notes|events         — update item
DELETE /api/focus?projectId=xxx&type=todos|notes|events&id=xxx  — delete item
GET    /api/focus/settings?projectId=xxx                         — get focus config
PUT    /api/focus/settings?projectId=xxx                         — update focus config
```

## Settings UI

FocusPanel header `...` menu opens a settings modal. Three collapsible sections for todos/notes/events data sources. Each section has:
- Type selector (file/skill/api)
- Enabled toggle
- Dynamic config fields based on type

## FocusPanel Refactor

1. Remove all hardcoded mock data
2. Add `useFocusData` hook: reads FocusSettings, calls API, returns data + CRUD methods
3. Todo section: inline add (input + Enter), checkbox toggle, swipe/delete
4. Notes section: click to expand/edit, add/delete
5. Calendar section: dot indicators on dates with events, click date to show event list, add event
6. Empty states with guidance text

## File Structure

```
types/focus.ts                          — Type definitions
lib/focus/types.ts                      — Provider interface
lib/focus/file-provider.ts              — File data source
lib/focus/skill-provider.ts             — Skill data source (stub)
lib/focus/api-provider.ts               — External API data source (stub)
lib/focus/index.ts                      — Provider registry + helpers
hooks/useFocusData.ts                   — React hook for focus data
app/api/focus/route.ts                  — CRUD API route
app/api/focus/settings/route.ts         — Settings API route
components/panels/FocusPanel.tsx        — Refactored UI (no mock data)
components/panels/focus/TodoList.tsx     — Todo section component
components/panels/focus/NoteList.tsx     — Notes section component
components/panels/focus/CalendarView.tsx — Calendar + events component
components/panels/focus/FocusSettings.tsx — Settings modal component
```

## Phases

1. **Phase 1**: Types + FileProvider + API routes + useFocusData hook + FocusPanel refactor with real data
2. **Phase 2**: Settings UI for configuring data sources
3. **Phase 3**: SkillProvider and ApiProvider implementations
