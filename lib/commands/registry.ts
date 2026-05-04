import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { CommandDefinition } from '@/types/commands'
import { DATA_DIR } from '@/lib/store/projects'
import { findSeedFile } from '@/lib/store/seed-utils'
import { logger } from '@/lib/logger'

const GLOBAL_COMMANDS_FILE = path.join(DATA_DIR, 'commands.json')

/** 检查是否需要初始化默认命令（生产环境首次运行时 DATA_DIR 为空） */
let defaultCommandsInitialized = false
function ensureDefaultCommands(): void {
  if (defaultCommandsInitialized) return
  defaultCommandsInitialized = true

  if (fs.existsSync(GLOBAL_COMMANDS_FILE)) return

  // 查找种子数据文件（多级回退：开发环境 / 打包后相对于 server.js）
  const seedPath = findSeedFile('commands.json')
  if (seedPath && seedPath !== GLOBAL_COMMANDS_FILE) {
    logger.info('[Commands] Seeding default commands from:', seedPath)
    try {
      const dir = path.dirname(GLOBAL_COMMANDS_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(seedPath, GLOBAL_COMMANDS_FILE)
      return
    } catch (err) {
      logger.error('[Commands] Failed to copy seed commands:', err)
    }
  }

  // 如果没有 fallback，创建一个空的 commands.json
  logger.info('[Commands] Creating empty global commands file:', GLOBAL_COMMANDS_FILE)
  try {
    const dir = path.dirname(GLOBAL_COMMANDS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(GLOBAL_COMMANDS_FILE, '[]', 'utf-8')
  } catch (err) {
    logger.error('[Commands] Failed to create commands file:', err)
  }
}

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
  if (!fs.existsSync(dir)) {
    logger.info('[Commands] Creating directory:', dir)
    fs.mkdirSync(dir, { recursive: true })
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(commands, null, 2), 'utf-8')
    logger.info('[Commands] Written commands file:', filePath)
  } catch (err) {
    logger.error('[Commands] Failed to write commands file:', filePath, err)
    throw new Error(`无法写入命令文件: ${filePath} - ${(err as Error).message}`)
  }
}

/** 读取全局命令 */
function readGlobalCommands(): CommandDefinition[] {
  ensureDefaultCommands()
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

  logger.info('[Commands] Creating command:', newCmd.id, 'scope:', scope, 'projectId:', projectId)

  if (scope === 'project' && projectId) {
    const filePath = getProjectCommandsFile(projectId)
    logger.info('[Commands] Target file:', filePath)
    const commands = readProjectCommands(projectId)
    commands.push(newCmd)
    writeCommandsFile(filePath, commands)
  } else {
    logger.info('[Commands] Target file:', GLOBAL_COMMANDS_FILE)
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
