// hooks/useFocusData.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FocusTodo, FocusNote, FocusEvent, FocusDataType, FocusSettings } from '@/types/focus'
import { DEFAULT_FOCUS_SETTINGS } from '@/types/focus'

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
  const crud = useCallback(async <T>(
    type: FocusDataType,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: unknown
  ): Promise<T | null> => {
    const params = new URLSearchParams({ projectId, type })
    if (method === 'DELETE' && body && typeof body === 'object' && 'id' in body) params.set('id', String(body.id))
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
