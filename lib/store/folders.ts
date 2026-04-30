import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { Folder } from '@/types/skills'
import { DATA_DIR } from './projects'

const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json')

interface FoldersData {
  folders: Record<string, Folder[]>
  projectFolders: Record<string, Record<string, string | null>>
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readData(): FoldersData {
  ensureDataDir()
  try {
    if (!fs.existsSync(FOLDERS_FILE)) return { folders: {}, projectFolders: {} }
    const raw = fs.readFileSync(FOLDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { folders: {}, projectFolders: {} }
  }
}

function writeData(data: FoldersData) {
  ensureDataDir()
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function getUserFolders(userId: string): Folder[] {
  const data = readData()
  return (data.folders[userId] || []).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function createFolder(userId: string, name: string): Folder {
  const data = readData()
  if (!data.folders[userId]) data.folders[userId] = []

  const folder: Folder = {
    id: `fld_${randomUUID().slice(0, 8)}`,
    name: name.trim(),
    sortOrder: data.folders[userId].length,
    createdAt: new Date().toISOString(),
  }
  data.folders[userId].push(folder)
  writeData(data)
  return folder
}

export function renameFolder(userId: string, folderId: string, name: string): boolean {
  const data = readData()
  const folders = data.folders[userId]
  if (!folders) return false

  const folder = folders.find(f => f.id === folderId)
  if (!folder) return false

  folder.name = name.trim()
  writeData(data)
  return true
}

export function deleteFolder(userId: string, folderId: string): boolean {
  const data = readData()
  const folders = data.folders[userId]
  if (!folders) return false

  const idx = folders.findIndex(f => f.id === folderId)
  if (idx === -1) return false

  folders.splice(idx, 1)

  // 该文件夹下的项目回到顶层（设为 null）
  const mapping = data.projectFolders[userId]
  if (mapping) {
    for (const pid of Object.keys(mapping)) {
      if (mapping[pid] === folderId) {
        mapping[pid] = null
      }
    }
  }

  writeData(data)
  return true
}

export function getProjectFolderMap(userId: string): Record<string, string | null> {
  const data = readData()
  return data.projectFolders[userId] || {}
}

export function setProjectFolder(userId: string, projectId: string, folderId: string | null): void {
  const data = readData()
  if (!data.projectFolders[userId]) data.projectFolders[userId] = {}
  data.projectFolders[userId][projectId] = folderId
  writeData(data)
}
