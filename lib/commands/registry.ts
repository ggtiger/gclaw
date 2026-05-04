import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { CommandDefinition } from '@/types/commands'
import { DATA_DIR } from '@/lib/store/projects'
import { logger } from '@/lib/logger'

const GLOBAL_COMMANDS_FILE = path.join(DATA_DIR, 'commands.json')

function getProjectCommandsFile(projectId: string): string {
  if (projectId.includes('..') || projectId.includes('/') || projectId.includes('\\')) {
    throw new Error(`Invalid projectId: ${projectId}`)
  }
  return path.join(DATA_DIR, 'projects', projectId, 'commands.json')
}

/** 读取 JSON 文件中的命令列表，文件不存在或解析失败时返回空数组 */
function readCommandsFile(filePath: string): CommandDefinition[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 写入命令列表到 JSON 文件 */
function writeCommandsFile(filePath: string, commands: CommandDefinition[]): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(commands, null, 2), 'utf-8')
}

/** 读取全局命令 */
function readGlobalCommands(): CommandDefinition[] {
  return readCommandsFile(GLOBAL_COMMANDS_FILE)
}

/** 读取项目级命令 */
function readProjectCommands(projectId: string): CommandDefinition[] {
  return readCommandsFile(getProjectCommandsFile(projectId))
}

/**
 * 获取合并后的可用命令（全局 + 项目级，项目级覆盖同 ID 全局命令，仅返回 enabled 的）
 */
export function getCommands(projectId: string): CommandDefinition[] {
  try {
    const globalCmds = readGlobalCommands()
    const projectCmds = readProjectCommands(projectId)

    // 项目级覆盖全局：按 id 去重，项目级优先
    const merged = new Map<string, CommandDefinition>()
    for (const cmd of globalCmds) {
      merged.set(cmd.id, cmd)
    }
    for (const cmd of projectCmds) {
      merged.set(cmd.id, cmd)
    }

    return Array.from(merged.values()).filter(cmd => cmd.enabled)
  } catch (err) {
    logger.error('[Commands] Failed to get commands:', err)
    return []
  }
}

/**
 * 获取所有命令（含禁用的，用于管理面板）
 */
export function getAllCommands(projectId: string): CommandDefinition[] {
  try {
    const globalCmds = readGlobalCommands()
    const projectCmds = readProjectCommands(projectId)

    const merged = new Map<string, CommandDefinition>()
    for (const cmd of globalCmds) {
      merged.set(cmd.id, cmd)
    }
    for (const cmd of projectCmds) {
      merged.set(cmd.id, cmd)
    }

    return Array.from(merged.values())
  } catch (err) {
    logger.error('[Commands] Failed to get all commands:', err)
    return []
  }
}

/**
 * 按 ID 查找命令（项目级优先）
 */
export function resolveCommand(id: string, projectId: string): CommandDefinition | undefined {
  try {
    // 先查项目级
    const projectCmds = readProjectCommands(projectId)
    const projectCmd = projectCmds.find(c => c.id === id)
    if (projectCmd) return projectCmd

    // 再查全局
    const globalCmds = readGlobalCommands()
    return globalCmds.find(c => c.id === id)
  } catch (err) {
    logger.error(`[Commands] Failed to resolve command ${id}:`, err)
    return undefined
  }
}

/**
 * 创建命令
 */
export function createCommand(
  cmd: Omit<CommandDefinition, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  scope: 'global' | 'project',
  projectId?: string
): CommandDefinition {
  const now = new Date().toISOString()
  const newCmd: CommandDefinition = {
    ...cmd,
    id: cmd.id || randomUUID().slice(0, 8),
    scope,
    createdAt: now,
    updatedAt: now,
  }

  if (scope === 'project' && projectId) {
    const commands = readProjectCommands(projectId)
    commands.push(newCmd)
    writeCommandsFile(getProjectCommandsFile(projectId), commands)
  } else {
    const commands = readGlobalCommands()
    commands.push(newCmd)
    writeCommandsFile(GLOBAL_COMMANDS_FILE, commands)
  }

  return newCmd
}

/**
 * 更新命令
 */
export function updateCommand(
  id: string,
  updates: Partial<CommandDefinition>,
  scope: 'global' | 'project',
  projectId?: string
): CommandDefinition | null {
  const filePath = scope === 'project' && projectId
    ? getProjectCommandsFile(projectId)
    : GLOBAL_COMMANDS_FILE

  const commands = readCommandsFile(filePath)
  const index = commands.findIndex(c => c.id === id)
  if (index === -1) return null

  commands[index] = {
    ...commands[index],
    ...updates,
    id, // id 不可变
    updatedAt: new Date().toISOString(),
  }
  writeCommandsFile(filePath, commands)
  return commands[index]
}

/**
 * 删除命令
 */
export function deleteCommand(
  id: string,
  scope: 'global' | 'project',
  projectId?: string
): boolean {
  const filePath = scope === 'project' && projectId
    ? getProjectCommandsFile(projectId)
    : GLOBAL_COMMANDS_FILE

  const commands = readCommandsFile(filePath)
  const filtered = commands.filter(c => c.id !== id)
  if (filtered.length === commands.length) return false

  writeCommandsFile(filePath, filtered)
  return true
}
