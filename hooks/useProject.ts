'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ProjectInfo, ProjectMode, ProjectType, Folder } from '@/types/skills'

const STORAGE_KEY = 'gclaw-current-project'

export function useProject() {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [currentId, setCurrentId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [folders, setFolders] = useState<Folder[]>([])
  const [projectFolderMap, setProjectFolderMap] = useState<Record<string, string | null>>({})
  const [ownerMeta, setOwnerMeta] = useState<Record<string, { username: string; role: string; avatarUrl?: string }>>({})
  const [projectAssistantIcons, setProjectAssistantIcons] = useState<Record<string, { assistantIcon?: string; assistantAvatar?: string }>>({})

  // 加载项目列表
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      const list: ProjectInfo[] = data.projects || []
      setProjects(list)
      setFolders(data.folders || [])
      setProjectFolderMap(data.projectFolderMap || {})
      setOwnerMeta(data.ownerMeta || {})
      setProjectAssistantIcons(data.projectAssistantIcons || {})

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
  const createProject = useCallback(async (name: string, type?: ProjectType, mode?: ProjectMode) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, mode }),
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
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '删除失败')
        return
      }
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

  // 文件夹操作
  const createFolderAction = useCallback(async (name: string) => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.folder) {
        setFolders(prev => [...prev, data.folder])
      }
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }, [])

  const renameFolderAction = useCallback(async (id: string, name: string) => {
    try {
      await fetch('/api/folders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      setFolders(prev => prev.map(f => (f.id === id ? { ...f, name } : f)))
    } catch (err) {
      console.error('Failed to rename folder:', err)
    }
  }, [])

  const deleteFolderAction = useCallback(async (id: string) => {
    try {
      await fetch(`/api/folders?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      setFolders(prev => prev.filter(f => f.id !== id))
      // 该文件夹下的项目回到顶层
      setProjectFolderMap(prev => {
        const updated = { ...prev }
        for (const pid of Object.keys(updated)) {
          if (updated[pid] === id) updated[pid] = null
        }
        return updated
      })
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }, [])

  const moveProjectToFolder = useCallback(async (projectId: string, folderId: string | null) => {
    try {
      await fetch('/api/folders/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, folderId }),
      })
      setProjectFolderMap(prev => ({ ...prev, [projectId]: folderId }))
    } catch (err) {
      console.error('Failed to move project to folder:', err)
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
    folders,
    projectFolderMap,
    ownerMeta,
    projectAssistantIcons,
    createFolder: createFolderAction,
    renameFolder: renameFolderAction,
    deleteFolder: deleteFolderAction,
    moveProjectToFolder,
  }
}
