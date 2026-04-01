import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const SKILLS_FILE = path.join(DATA_DIR, 'enabled-skills.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function getEnabledSkills(): string[] {
  ensureDataDir()
  try {
    if (!fs.existsSync(SKILLS_FILE)) return []
    const raw = fs.readFileSync(SKILLS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.enabled) ? data.enabled : []
  } catch {
    return []
  }
}

export function setEnabledSkills(names: string[]) {
  ensureDataDir()
  fs.writeFileSync(SKILLS_FILE, JSON.stringify({ enabled: names }, null, 2), 'utf-8')
}
