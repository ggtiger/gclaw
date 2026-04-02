import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ChannelConfig, ChannelType } from '@/types/channels'
import { getProjectDir } from './projects'

function getChannelsFile(projectId: string): string {
  return path.join(getProjectDir(projectId), 'channels.json')
}

function ensureProjectDir(projectId: string) {
  const dir = getProjectDir(projectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getChannels(projectId: string): ChannelConfig[] {
  const file = getChannelsFile(projectId)
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.channels) ? data.channels : []
  } catch {
    return []
  }
}

export function saveChannels(projectId: string, channels: ChannelConfig[]) {
  ensureProjectDir(projectId)
  fs.writeFileSync(getChannelsFile(projectId), JSON.stringify({ channels }, null, 2), 'utf-8')
}

export function addChannel(projectId: string, channel: Omit<ChannelConfig, 'id' | 'createdAt'>): ChannelConfig {
  const channels = getChannels(projectId)
  const newChannel: ChannelConfig = {
    ...channel,
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
  }
  channels.push(newChannel)
  saveChannels(projectId, channels)
  return newChannel
}

export function updateChannel(projectId: string, channelId: string, partial: Partial<ChannelConfig>): ChannelConfig | null {
  const channels = getChannels(projectId)
  const idx = channels.findIndex(c => c.id === channelId)
  if (idx === -1) return null
  channels[idx] = { ...channels[idx], ...partial, id: channelId }
  saveChannels(projectId, channels)
  return channels[idx]
}

export function removeChannel(projectId: string, channelId: string): boolean {
  const channels = getChannels(projectId)
  const filtered = channels.filter(c => c.id !== channelId)
  if (filtered.length === channels.length) return false
  saveChannels(projectId, filtered)
  return true
}

/**
 * 通过 webhook key 查找对应的渠道和项目
 * 钉钉用 appKey, 飞书用 appId, 微信用 botId
 */
export function findChannelByWebhookKey(
  type: ChannelType,
  key: string
): { projectId: string; channel: ChannelConfig } | null {
  const DATA_DIR = path.join(process.cwd(), 'data')
  const PROJECTS_DIR = path.join(DATA_DIR, 'projects')

  if (!fs.existsSync(PROJECTS_DIR)) return null

  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue
      const projectId = dir.name
      const channels = getChannels(projectId)

      for (const ch of channels) {
        if (ch.type !== type || !ch.enabled) continue

        let match = false
        switch (type) {
          case 'dingtalk':
            match = ch.dingtalk?.appKey === key
            break
          case 'feishu':
            match = ch.feishu?.appId === key
            break
          case 'wechat':
            match = ch.wechat?.botToken === key
            break
        }

        if (match) return { projectId, channel: ch }
      }
    }
  } catch (err) {
    console.error('[Channels] findChannelByWebhookKey error:', err)
  }

  return null
}
