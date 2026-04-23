import Anthropic from '@anthropic-ai/sdk'
import { getGlobalSettings, resolveProviderConfig } from '@/lib/store/settings'
import type { ModelProvider } from '@/types/skills'

export const dynamic = 'force-dynamic'

/**
 * 根据 base URL 检测提供商，返回对应的方式获取模型列表
 */
const PROVIDERS: {
  match: (url: string) => boolean
  fetch: (url: string, apiKey: string) => Promise<{ id: string; name: string }[]>
}[] = [
  // 阿里百炼 DashScope — Anthropic 兼容路径不支持 /v1/models，需走 OpenAI 兼容接口
  {
    match: (url) => url.includes('dashscope.aliyuncs.com'),
    fetch: async (url, apiKey) => {
      const endpoint = `${url.replace(/\/+$/, '').replace(/\/apps\/anthropic$/, '')}/compatible-mode/v1/models`
      const resp = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (!resp.ok) throw new Error(`DashScope API ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      const data = await resp.json()
      return (data.data || [])
        .map((m: { id: string }) => ({ id: m.id, name: m.id }))
        .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
    },
  },
  // DeepSeek — OpenAI 兼容接口
  {
    match: (url) => url.includes('api.deepseek.com'),
    fetch: async (url, apiKey) => {
      const resp = await fetch(`${url.replace(/\/+$/, '')}/v1/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (!resp.ok) throw new Error(`DeepSeek API ${resp.status}`)
      const data = await resp.json()
      return (data.data || [])
        .map((m: { id: string }) => ({ id: m.id, name: m.id }))
        .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
    },
  },
  // 默认：Anthropic 兼容接口（Anthropic 官方、智谱、各类代理）
  {
    match: () => true,
    fetch: async (url, apiKey) => {
      const client = new Anthropic({ apiKey, baseURL: url || undefined })
      const res = await client.models.list()
      return res.data
        .map(m => ({ id: m.id, name: m.display_name || m.id }))
        .sort((a, b) => a.id.localeCompare(b.id))
    },
  },
]

/** OpenAI 兼容接口获取模型列表 */
async function fetchOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<{ id: string; name: string }[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!resp.ok) throw new Error(`OpenAI Compatible API ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = await resp.json()
  return (data.data || [])
    .map((m: { id: string }) => ({ id: m.id, name: m.id }))
    .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
}

export async function GET() {
  const config = resolveProviderConfig()
  if (!config.apiKey) {
    return Response.json({ error: '未配置 API Key' }, { status: 400 })
  }

  const baseUrl = config.baseUrl.trim()
  return fetchModels(baseUrl, config.apiKey, 'anthropic')
}

export async function POST(request: Request) {
  const body = await request.json()

  // 如果前端传了 providerId，从 provider 列表获取配置
  if (body.providerId) {
    const settings = getGlobalSettings()
    const provider = (settings.providers || []).find((p: ModelProvider) => p.id === body.providerId)
    if (provider) {
      return fetchModels(provider.baseUrl, provider.apiKey, provider.type)
    }
  }

  // 优先用前端传入的 key → 已存储的 key → 环境变量
  const config = resolveProviderConfig()
  const apiKey = body.apiKey || config.apiKey
  if (!apiKey) {
    return Response.json({ error: '未配置 API Key' }, { status: 400 })
  }

  const baseUrl = (body.apiBaseUrl || config.baseUrl || '').trim()
  return fetchModels(baseUrl, apiKey, body.providerType || 'anthropic')
}

async function fetchModels(baseUrl: string, apiKey: string, providerType: string) {
  try {
    // openai-compatible 类型直接走 /v1/models
    if (providerType === 'openai-compatible') {
      const models = await fetchOpenAICompatibleModels(baseUrl, apiKey)
      return Response.json({ models })
    }

    // Anthropic 类型：按 URL 匹配提供商
    const provider = PROVIDERS.find(p => p.match(baseUrl))
    if (!provider) {
      return Response.json({ error: '无法识别的 API 地址' }, { status: 400 })
    }
    const models = await provider.fetch(baseUrl, apiKey)
    return Response.json({ models })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `获取模型列表失败: ${msg}` }, { status: 500 })
  }
}
