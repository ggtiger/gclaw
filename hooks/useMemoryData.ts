// hooks/useMemoryData.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { EpisodicEntry, SemanticEntry, ProceduralEntry } from '@/types/memory'

interface MemoryStats {
  semanticCount: number
  proceduralCount: number
  episodicCount: number
}

export function useMemoryData(userId: string | undefined, projectId?: string) {
  const [semantic, setSemantic] = useState<SemanticEntry[]>([])
  const [procedural, setProcedural] = useState<ProceduralEntry[]>([])
  const [episodic, setEpisodic] = useState<EpisodicEntry[]>([])
  const [stats, setStats] = useState<MemoryStats>({ semanticCount: 0, proceduralCount: 0, episodicCount: 0 })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchEntries = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ userId, level: 'all' })
      if (projectId) params.set('projectId', projectId)
      const res = await fetch(`/api/memory/entries?${params}`)
      const data = await res.json()
      if (data.success) {
        setSemantic(data.semantic || [])
        setProcedural(data.procedural || [])
        setEpisodic(data.episodic || [])
        setStats({
          semanticCount: (data.semantic || []).length,
          proceduralCount: (data.procedural || []).length,
          episodicCount: (data.episodic || []).length,
        })
      }
    } catch (err) {
      console.error('[useMemoryData] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, projectId])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const recall = useCallback(async (query: string) => {
    if (!userId) return null
    try {
      const res = await fetch('/api/memory/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, query, level: 'all', limit: 20 }),
      })
      const data = await res.json()
      if (data.success) {
        return data.result as {
          episodic: EpisodicEntry[]
          semantic: SemanticEntry[]
          procedural: ProceduralEntry[]
        }
      }
    } catch (err) {
      console.error('[useMemoryData] recall error:', err)
    }
    return null
  }, [userId, projectId])

  const remember = useCallback(async (body: {
    level: 'episodic' | 'semantic' | 'procedural'
    type?: string
    summary?: string
    detail?: string
    title?: string
    content?: string
    tags?: string[]
    scope?: 'user' | 'project'
    semanticType?: string
    proceduralType?: string
  }) => {
    if (!userId) return null
    try {
      const res = await fetch('/api/memory/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, ...body }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchEntries()
        return data.entry
      }
    } catch (err) {
      console.error('[useMemoryData] remember error:', err)
    }
    return null
  }, [userId, projectId, fetchEntries])

  const archiveEntry = useCallback(async (id: string, level: 'semantic' | 'procedural') => {
    if (!userId) return false
    try {
      const params = new URLSearchParams({ userId, id, level })
      if (projectId) params.set('projectId', projectId)
      const res = await fetch(`/api/memory/entries?${params}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        await fetchEntries()
        return true
      }
    } catch (err) {
      console.error('[useMemoryData] archive error:', err)
    }
    return false
  }, [userId, projectId, fetchEntries])

  const verifyEntry = useCallback(async (id: string, level: 'semantic' | 'procedural') => {
    if (!userId) return false
    try {
      const res = await fetch(`/api/memory/verify/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, level, projectId }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchEntries()
        return true
      }
    } catch (err) {
      console.error('[useMemoryData] verify error:', err)
    }
    return false
  }, [userId, projectId, fetchEntries])

  const consolidate = useCallback(async () => {
    if (!userId) return null
    try {
      const res = await fetch('/api/memory/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchEntries()
        return data.result
      }
    } catch (err) {
      console.error('[useMemoryData] consolidate error:', err)
    }
    return null
  }, [userId, projectId, fetchEntries])

  // 搜索过滤
  const filteredSemantic = searchQuery
    ? semantic.filter(e =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : semantic

  const filteredProcedural = searchQuery
    ? procedural.filter(e =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : procedural

  return {
    loading,
    semantic: filteredSemantic,
    procedural: filteredProcedural,
    episodic,
    stats,
    searchQuery,
    setSearchQuery,
    recall,
    remember,
    archiveEntry,
    verifyEntry,
    consolidate,
    refetch: fetchEntries,
  }
}
