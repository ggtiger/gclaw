import fs from 'fs'
import path from 'path'
import type { AgentInfo } from '@/types/skills'
import { getProjectDataDir, getProjects, getProjectById } from './projects'

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
 * - 普通项目：只加载本项目 agents
 * - 秘书项目：跨项目加载所有非秘书项目的 agents
 */
export function getEnabledAgentDefinitions(projectId: string): Record<string, {
  description: string
  tools?: string[]
  disallowedTools?: string[]
  prompt: string
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}> {
  const project = getProjectById(projectId)
  // 秘书项目 → 跨项目加载
  if (project?.type === 'secretary') {
    return getSecretaryAgentDefinitions(projectId)
  }

  // 普通项目 → 只加载本项目 agents
  return getProjectAgentDefinitions(projectId)
}

/**
 * 普通项目：加载本项目的 enabled agents
 */
function getProjectAgentDefinitions(projectId: string): Record<string, {
  description: string
  tools?: string[]
  disallowedTools?: string[]
  prompt: string
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}> {
  const agents = getAgents(projectId)
  const enabled = agents.filter(a => a.enabled)

  // 构建子 Agent 描述列表（排除协调人自身）
  const subAgents = enabled.filter(a => !a.isCoordinator)
  const agentsList = subAgents.map(a => `- **${a.name}**: ${a.description}`).join('\n')

  const result: Record<string, {
    description: string
    tools?: string[]
    disallowedTools?: string[]
    prompt: string
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  }> = {}

  for (const agent of enabled) {
    let prompt = agent.prompt

    // 协调人 Agent：动态替换 {agents_list}
    if (agent.isCoordinator && prompt.includes('{agents_list}')) {
      prompt = prompt.replace(/{agents_list}/g, agentsList || '（暂无子智能体）')
    }

    result[agent.name] = {
      description: agent.description,
      prompt,
      model: agent.model === 'inherit' ? undefined : agent.model,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
      disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
    }
  }

  return result
}

/**
 * 秘书项目：跨项目加载所有非秘书项目的 enabled agents
 * 合并为一个扁平 map（key = agent name），SDK 原生支持嵌套 Agent 调用
 */
function getSecretaryAgentDefinitions(secretaryProjectId: string): Record<string, {
  description: string
  tools?: string[]
  disallowedTools?: string[]
  prompt: string
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}> {
  // 先加载秘书项目自身的 agents
  const result = getProjectAgentDefinitions(secretaryProjectId)

  // 遍历所有非秘书项目，合并其 agents
  const allProjects = getProjects()
  for (const project of allProjects) {
    if (project.id === secretaryProjectId) continue
    if (project.type === 'secretary') continue

    const agents = getAgents(project.id)
    const enabled = agents.filter(a => a.enabled)

    // 构建该项目的子 Agent 描述列表
    const subAgents = enabled.filter(a => !a.isCoordinator)
    const agentsList = subAgents.map(a => `- **${a.name}**: ${a.description}`).join('\n')

    for (const agent of enabled) {
      // 跳过重名 agent（先到先得）
      if (result[agent.name]) continue

      let prompt = agent.prompt

      // 协调人 Agent：动态替换 {agents_list} 为同项目的子 Agent 列表
      if (agent.isCoordinator && prompt.includes('{agents_list}')) {
        prompt = prompt.replace(/{agents_list}/g, agentsList || '（暂无子智能体）')
      }

      result[agent.name] = {
        description: agent.description,
        prompt,
        model: agent.model === 'inherit' ? undefined : agent.model,
        tools: agent.tools.length > 0 ? agent.tools : undefined,
        disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
      }
    }
  }

  return result
}
