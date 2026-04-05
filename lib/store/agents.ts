import fs from 'fs'
import path from 'path'
import type { AgentInfo } from '@/types/skills'
import { getProjectDataDir } from './projects'

function getAgentsFile(projectId: string): string {
  return path.join(getProjectDataDir(projectId), 'agents.json')
}

function ensureProjectDir(projectId: string) {
  getProjectDataDir(projectId)
}

export function getAgents(projectId: string): AgentInfo[] {
  const file = getAgentsFile(projectId)
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.agents) ? data.agents : []
  } catch {
    return []
  }
}

export function saveAgents(projectId: string, agents: AgentInfo[]) {
  ensureProjectDir(projectId)
  fs.writeFileSync(getAgentsFile(projectId), JSON.stringify({ agents }, null, 2), 'utf-8')
}

/**
 * 返回启用的 agent，转为 SDK AgentDefinition 格式
 */
export function getEnabledAgentDefinitions(projectId: string): Record<string, {
  description: string
  tools?: string[]
  disallowedTools?: string[]
  prompt: string
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}> {
  const agents = getAgents(projectId)
  const result: Record<string, {
    description: string
    tools?: string[]
    disallowedTools?: string[]
    prompt: string
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  }> = {}

  for (const agent of agents) {
    if (!agent.enabled) continue
    result[agent.name] = {
      description: agent.description,
      prompt: agent.prompt,
      model: agent.model === 'inherit' ? undefined : agent.model,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
      disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
    }
  }

  return result
}
