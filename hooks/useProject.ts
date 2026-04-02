'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ProjectInfo } from '@/types/skills'

const STORAGE_KEY = 'gclaw-current-project'

export function useProject() {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [currentId, setCurrentId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // 加载项目列表
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      const list: ProjectInfo[] = data.projects || []
      setProjects(list)

      // 恢复上次选中的项目，或使用第一个
      const savedId = localStorage.getItem(STORAGE_KEY)
      if (savedId && list.some(p => p.id === savedId)) {
        setCurrentId(savedId)
      } else if (list.length > 0) {
        setCurrentId(list[0].id)
        localStorage.setItem(STORAGE_KEY, list[0].id)
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // 切换项目
  const switchProject = useCallback((id: string) => {
    setCurrentId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  // 创建项目
  const createProject = useCallback(async (name: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      const project: ProjectInfo = data.project
      setProjects(prev => [...prev, project])
      switchProject(project.id)
      return project
    } catch (err) {
      console.error('Failed to create project:', err)
      return null
    }
  }, [switchProject])

  // 删除项目
  const deleteProject = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      setProjects(prev => {
        const updated = prev.filter(p => p.id !== id)
        // 如果删除的是当前项目，切换到第一个
        if (id === currentId && updated.length > 0) {
          switchProject(updated[0].id)
        }
        return updated
      })
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }, [currentId, switchProject])

  // 重命名
  const renameProject = useCallback(async (id: string, name: string) => {
    try {
      await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      setProjects(prev =>
        prev.map(p => (p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p))
      )
    } catch (err) {
      console.error('Failed to rename project:', err)
    }
  }, [])

  return {
    projects,
    currentId,
    loading,
    switchProject,
    createProject,
    deleteProject,
    renameProject,
    refreshProjects: fetchProjects,
  }
}
