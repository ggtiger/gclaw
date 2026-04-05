import fs from 'fs'
import path from 'path'
import { getProjectDataDir } from './projects'

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
