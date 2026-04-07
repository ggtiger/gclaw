/**
 * L1 情节记忆写入器
 * 提供统一的情节记忆写入接口
 */

import type { EpisodicEntry } from '@/types/memory'
import { store } from './store'

/**
 * 写入一条情节记忆
 */
export function writeEpisodic(
  userId: string,
  entry: Omit<EpisodicEntry, 'id' | 'timestamp'>,
  projectId?: string
): EpisodicEntry {
  const fullEntry: EpisodicEntry = {
    ...entry,
    id: store.generateId('EP'),
    timestamp: new Date().toISOString(),
  }

  // 写入用户级记忆
  const userDir = store.userMemoryDir(userId)
  store.initMemoryDirs(userId)
  store.appendEpisodicEntry(userDir, fullEntry)

  // 如果指定了项目，也写入项目级
  if (projectId) {
    const projDir = store.projectMemoryDir(projectId)
    store.initMemoryDirs(userId, projectId)
    store.appendEpisodicEntry(projDir, fullEntry)
  }

  return fullEntry
}
