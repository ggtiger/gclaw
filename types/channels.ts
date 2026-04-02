export type ChannelType = 'dingtalk' | 'feishu' | 'wechat'

export interface DingtalkConfig {
  appKey: string
  appSecret: string
}

export interface FeishuConfig {
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey?: string
}

export interface WechatConfig {
  botToken: string
  accountId: string
}

export interface ChannelConfig {
  id: string
  type: ChannelType
  name: string
  enabled: boolean
  createdAt: string
  dingtalk?: DingtalkConfig
  feishu?: FeishuConfig
  wechat?: WechatConfig
}

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
  wechat: '微信 ClawBot',
}
