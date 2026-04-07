// app/api/focus/route.ts
import { NextRequest } from 'next/server'
import {
  getTodos, getTodosAsync, createTodo, updateTodo, deleteTodo,
  getNotes, getNotesAsync, createNote, updateNote, deleteNote,
  getEvents, getEventsAsync, createEvent, updateEvent, deleteEvent,
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

  // 使用异步版本（支持 skill 数据源）
  const data = type === 'todos' ? await getTodosAsync(projectId)
    : type === 'notes' ? await getNotesAsync(projectId)
    : await getEventsAsync(projectId)
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
