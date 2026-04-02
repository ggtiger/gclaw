import fs from 'fs'
import path from 'path'
import {
  type AppSettings,
  type GlobalSettings,
  type ProjectSettings,
  DEFAULT_GLOBAL,
  DEFAULT_PROJECT,
  DEFAULT_SETTINGS,
} from '@/types/skills'
import { getProjectDir } from './projects'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const GLOBAL_FILE = path.join(DATA_DIR, 'global.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// ── 全局设置 ──

export function getGlobalSettings(): GlobalSettings {
  ensureDataDir()
  try {
    if (!fs.existsSync(GLOBAL_FILE)) return { ...DEFAULT_GLOBAL }
    const raw = fs.readFileSync(GLOBAL_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return { ...DEFAULT_GLOBAL, ...data }
  } catch {
    return { ...DEFAULT_GLOBAL }
  }
}

export function updateGlobalSettings(partial: Partial<GlobalSettings>): GlobalSettings {
  const current = getGlobalSettings()
  const updated = { ...current, ...partial }
  ensureDataDir()
  fs.writeFileSync(GLOBAL_FILE, JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

// ── 项目设置 ──

export function getProjectSettings(projectId: string): ProjectSettings {
  const dir = getProjectDir(projectId)
  const file = path.join(dir, 'settings.json')
  try {
    if (!fs.existsSync(file)) return { ...DEFAULT_PROJECT }
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return { ...DEFAULT_PROJECT, ...data }
  } catch {
    return { ...DEFAULT_PROJECT }
  }
}

export function updateProjectSettings(projectId: string, partial: Partial<ProjectSettings>): ProjectSettings {
  const dir = getProjectDir(projectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const current = getProjectSettings(projectId)
  const updated = { ...current, ...partial }
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

// ── 合并接口（向后兼容）──

const GLOBAL_KEYS = new Set<string>(['apiKey', 'apiBaseUrl', 'theme'])

export function getSettings(projectId: string): AppSettings {
  const global = getGlobalSettings()
  const project = getProjectSettings(projectId)
  return { ...global, ...project }
}

export function updateSettings(projectId: string, partial: Partial<AppSettings>): AppSettings {
  const globalPart: Partial<GlobalSettings> = {}
  const projectPart: Partial<ProjectSettings> = {}

  for (const [key, value] of Object.entries(partial)) {
    if (GLOBAL_KEYS.has(key)) {
      ;(globalPart as Record<string, unknown>)[key] = value
    } else {
      ;(projectPart as Record<string, unknown>)[key] = value
    }
  }

  if (Object.keys(globalPart).length > 0) updateGlobalSettings(globalPart)
  if (Object.keys(projectPart).length > 0) updateProjectSettings(projectId, projectPart)

  return getSettings(projectId)
}
