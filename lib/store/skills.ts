import fs from 'fs'
import path from 'path'
import { getProjectDataDir, DATA_DIR } from './projects'
import { findSeedFile } from './seed-utils'

function getSkillsFile(projectId: string): string {
  return path.join(getProjectDataDir(projectId), 'enabled-skills.json')
}

function ensureProjectDir(projectId: string) {
  getProjectDataDir(projectId)
}

export function getEnabledSkills(projectId: string): string[] {
  const file = getSkillsFile(projectId)
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.enabled) ? data.enabled : []
  } catch {
    return []
  }
}

export function setEnabledSkills(projectId: string, names: string[]) {
  ensureProjectDir(projectId)
  fs.writeFileSync(getSkillsFile(projectId), JSON.stringify({ enabled: names }, null, 2), 'utf-8')
}

// ── 默认技能 ──

const DEFAULT_SKILLS_FILE = path.join(DATA_DIR, 'default-skills.json')

/** 首次运行时从种子数据初始化 default-skills.json */
let seedChecked = false
function ensureSeedDefaultSkills(): void {
  if (seedChecked) return
  seedChecked = true
  if (fs.existsSync(DEFAULT_SKILLS_FILE)) return

  const seedPath = findSeedFile('default-skills.json')
  if (seedPath && seedPath !== DEFAULT_SKILLS_FILE) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    try {
      fs.copyFileSync(seedPath, DEFAULT_SKILLS_FILE)
      console.log('[Skills] Initialized default-skills from seed:', seedPath)
    } catch (err) {
      console.error('[Skills] Failed to copy seed default-skills:', err)
    }
  }
}

export function getDefaultSkills(): string[] {
  ensureSeedDefaultSkills()
  try {
    if (!fs.existsSync(DEFAULT_SKILLS_FILE)) return []
    const raw = fs.readFileSync(DEFAULT_SKILLS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.skills) ? data.skills : []
  } catch {
    return []
  }
}

export function setDefaultSkills(names: string[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DEFAULT_SKILLS_FILE, JSON.stringify({ skills: names }, null, 2), 'utf-8')
}
