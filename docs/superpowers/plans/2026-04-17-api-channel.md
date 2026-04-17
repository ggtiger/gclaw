# API 渠道（第三方系统接入）实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `api` 渠道类型，允许第三方系统通过 HTTP API 发送消息并接收 Agent 执行结果（SSE 推送 done 事件）。

**Architecture:** 新建 API 专属事件总线（`apiEventBus`）和异步消息处理函数（`handleApiMessage`），与现有渠道系统并行运行。第三方系统通过 Bearer API Key 认证，POST 发送消息立即返回 202，Agent 完成后通过 SSE 长连接推送结果。

**Tech Stack:** Next.js App Router, SSE (ReadableStream), globalThis 单例模式

---

## Chunk 1: 类型定义与数据层

### Task 1: 更新渠道类型定义

**Files:**
- Modify: `types/channels.ts`

- [ ] **Step 1: 修改 `types/channels.ts`**

在 `ChannelType` 中增加 `'api'`，新增 `ApiChannelConfig` 接口，更新 `ChannelConfig` 和 `CHANNEL_LABELS`：

```typescript
export type ChannelType = 'dingtalk' | 'feishu' | 'wechat' | 'api'

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

export interface ApiChannelConfig {
  apiKey: string
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
  api?: ApiChannelConfig
}

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
  wechat: '微信 ClawBot',
  api: 'API 接入',
}
```

- [ ] **Step 2: 修改 `lib/store/channels.ts`**

在 `findChannelByWebhookKey` 的 `switch` 语句中增加 `api` 分支：

```typescript
case 'api':
  match = ch.api?.apiKey === key
  break
```

- [ ] **Step 3: 修改 `app/api/channels/route.ts`**

在 POST handler 中解构新增的 `api` 字段，传入 `addChannel`：

```typescript
// 第 24 行，解构新增 api
const { type, name, enabled = true, dingtalk, feishu, wechat, api } = body

// 第 30 行，addChannel 传入 api
const channel = addChannel(projectId, { type, name, enabled, dingtalk, feishu, wechat, api })
```

- [ ] **Step 4: 提交**

```bash
git add types/channels.ts lib/store/channels.ts app/api/channels/route.ts
git commit -m "feat: 新增 api 渠道类型定义和数据层支持"
```

---

## Chunk 2: API 事件总线

### Task 2: 创建 API 专属事件总线

**Files:**
- Create: `lib/channels/api-events.ts`

- [ ] **Step 1: 创建 `lib/channels/api-events.ts`**

遵循 `lib/channels/channel-events.ts` 的 globalThis 单例模式，按 `channelId` 分组：

```typescript
/**
 * API 渠道专属事件总线
 * 按 channelId 精确推送到对应第三方 SSE 连接
 * 全局单例，挂载到 globalThis 防止 HMR 丢失
 */

export type ApiEventType = 'api_done' | 'api_error'

export interface ApiEvent {
  type: ApiEventType
  data: {
    requestId: string
    content?: string
    message?: string
    usage?: {
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      model: string
      costUsd: number
    }
  }
}

type ApiEventListener = (event: ApiEvent) => void

class ApiEventBus {
  /** key = channelId, value = listeners */
  private subscribers = new Map<string, Set<ApiEventListener>>()

  subscribe(channelId: string, listener: ApiEventListener): () => void {
    let listeners = this.subscribers.get(channelId)
    if (!listeners) {
      listeners = new Set()
      this.subscribers.set(channelId, listeners)
    }
    listeners.add(listener)

    return () => {
      listeners!.delete(listener)
      if (listeners!.size === 0) {
        this.subscribers.delete(channelId)
      }
    }
  }

  emit(channelId: string, event: ApiEvent): void {
    const listeners = this.subscribers.get(channelId)
    if (!listeners) return
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[ApiEventBus] listener error:', err)
      }
    }
  }
}

/** 全局单例 */
const GLOBAL_KEY = '__gclaw_api_event_bus__'
export const apiEventBus: ApiEventBus =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ApiEventBus ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new ApiEventBus())
```

- [ ] **Step 2: 提交**

```bash
git add lib/channels/api-events.ts
git commit -m "feat: 创建 API 渠道专属事件总线"
```

---

## Chunk 3: 核心服务层

### Task 3: 创建 API 渠道服务

**Files:**
- Create: `lib/channels/api-service.ts`

- [ ] **Step 1: 创建 `lib/channels/api-service.ts`**

包含认证函数和异步消息处理函数。认证函数被两个 API 端点共用，消息处理函数异步执行 Agent 并通过两个事件总线推送结果：

```typescript
/**
 * API 渠道服务
 * 认证 + 异步消息处理
 */

import { executeChat } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import { findChannelByWebhookKey } from '@/lib/store/channels'
import { apiEventBus } from './api-events'
import { channelEventBus } from './channel-events'
import type { ChatMessage } from '@/types/chat'
import type { ChannelConfig } from '@/types/channels'
import { logger } from '@/lib/logger'

/**
 * 从请求中提取 Bearer Token，认证 API 渠道
 * 返回 projectId + channel，失败返回 null
 */
export function authenticateApiChannel(
  authHeader: string | null
): { projectId: string; channel: ChannelConfig } | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const apiKey = authHeader.slice(7).trim()
  if (!apiKey) return null
  return findChannelByWebhookKey('api', apiKey)
}

/**
 * 异步处理 API 渠道消息
 * 1. 持久化用户消息
 * 2. 调用 Agent
 * 3. 持久化助手消息
 * 4. 通过 apiEventBus 推送给第三方 SSE
 * 5. 通过 channelEventBus 推送给 Web UI
 */
export async function handleApiMessage(
  projectId: string,
  channel: ChannelConfig,
  requestId: string,
  message: string,
): Promise<void> {
  // 持久化用户消息
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_api_user`,
    role: 'user',
    content: message,
    messageType: 'text',
    createdAt: new Date().toISOString(),
  }
  addMessage(projectId, userMsg)

  // 通知 Web UI 收到消息
  channelEventBus.emit(projectId, {
    type: 'channel_user_message',
    data: { message: userMsg },
  })
  channelEventBus.emit(projectId, {
    type: 'channel_start',
    data: {},
  })

  // 调用 Agent，收集完整回复
  let fullContent = ''

  try {
    for await (const event of executeChat(message, { projectId })) {
      if (event.event === 'delta' && typeof event.data.content === 'string') {
        fullContent += event.data.content
      }

      if (event.event === 'done') {
        if (fullContent.trim()) {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_api_assistant`,
            role: 'assistant',
            content: fullContent,
            messageType: 'text',
            createdAt: new Date().toISOString(),
            stats: event.data.usage
              ? {
                  costUsd: (event.data.costUsd as number) || 0,
                  inputTokens: (event.data.usage as Record<string, number>).inputTokens || 0,
                  outputTokens: (event.data.usage as Record<string, number>).outputTokens || 0,
                  cachedTokens: (event.data.usage as Record<string, number>).cachedTokens || 0,
                  model: (event.data.model as string) || '',
                }
              : undefined,
          }
          addMessage(projectId, assistantMsg)

          // 推送给第三方 SSE
          apiEventBus.emit(channel.id, {
            type: 'api_done',
            data: {
              requestId,
              content: fullContent,
              usage: assistantMsg.stats,
            },
          })

          // 推送给 Web UI
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: { message: assistantMsg },
          })
        } else {
          apiEventBus.emit(channel.id, {
            type: 'api_done',
            data: { requestId },
          })
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: {},
          })
        }
      }

      if (event.event === 'error') {
        const errMsg = (event.data.message as string) || '处理失败'
        logger.error(`[ApiService] Agent error: ${errMsg}`)
        apiEventBus.emit(channel.id, {
          type: 'api_error',
          data: { requestId, message: errMsg },
        })
        channelEventBus.emit(projectId, {
          type: 'channel_error',
          data: { message: errMsg },
        })
      }
    }
  } catch (err) {
    logger.error('[ApiService] executeChat error:', err)
    apiEventBus.emit(channel.id, {
      type: 'api_error',
      data: { requestId, message: 'Agent 执行异常' },
    })
    channelEventBus.emit(projectId, {
      type: 'channel_error',
      data: { message: 'Agent 执行异常' },
    })
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add lib/channels/api-service.ts
git commit -m "feat: 创建 API 渠道服务 - 认证与异步消息处理"
```

---

## Chunk 4: API 端点

### Task 4: 创建消息发送端点

**Files:**
- Create: `app/api/channels/webhook/api/message/route.ts`

- [ ] **Step 1: 创建目录和文件**

```bash
mkdir -p app/api/channels/webhook/api/message
```

- [ ] **Step 2: 创建 `app/api/channels/webhook/api/message/route.ts`**

```typescript
/**
 * API 渠道 - 发送消息端点
 * POST /api/channels/webhook/api/message
 * 认证后异步执行 Agent，立即返回 202
 */

import { NextRequest } from 'next/server'
import { authenticateApiChannel, handleApiMessage } from '@/lib/channels/api-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 认证
  const authHeader = request.headers.get('authorization')
  const result = authenticateApiChannel(authHeader)
  if (!result) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, channel } = result

  // 解析请求体
  let body: { message?: string; attachments?: unknown[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = body.message?.trim()
  if (!message) {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // 异步执行，不阻塞响应
  handleApiMessage(projectId, channel, requestId, message).catch(err => {
    console.error('[ApiMessage] handleApiMessage unhandled error:', err)
  })

  return Response.json({ requestId }, { status: 202 })
}
```

- [ ] **Step 3: 提交**

```bash
git add app/api/channels/webhook/api/message/route.ts
git commit -m "feat: 创建 API 渠道消息发送端点"
```

### Task 5: 创建 SSE 流端点

**Files:**
- Create: `app/api/channels/webhook/api/stream/route.ts`

- [ ] **Step 1: 创建目录和文件**

```bash
mkdir -p app/api/channels/webhook/api/stream
```

- [ ] **Step 2: 创建 `app/api/channels/webhook/api/stream/route.ts`**

遵循 `app/api/channels/events/route.ts` 的 SSE 模式，但用 `apiEventBus` 按 `channelId` 订阅，只推送 `api_done` / `api_error`：

```typescript
/**
 * API 渠道 - SSE 流端点
 * GET /api/channels/webhook/api/stream
 * 认证后建立 SSE 长连接，推送 done/error 事件
 */

import { NextRequest } from 'next/server'
import { authenticateApiChannel } from '@/lib/channels/api-service'
import { apiEventBus } from '@/lib/channels/api-events'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // 认证
  const authHeader = request.headers.get('authorization')
  const result = authenticateApiChannel(authHeader)
  if (!result) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel } = result
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 发送连接成功事件
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ channelId: channel.id })}\n\n`))

      // 心跳保活（每 30 秒）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      // 订阅 API 事件（按 channelId 精确推送）
      const unsubscribe = apiEventBus.subscribe(channel.id, (event) => {
        try {
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch {
          // 连接已关闭
        }
      })

      // 客户端断开时清理
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

- [ ] **Step 3: 提交**

```bash
git add app/api/channels/webhook/api/stream/route.ts
git commit -m "feat: 创建 API 渠道 SSE 流端点"
```

---

## Chunk 5: 前端渠道配置界面

### Task 6: 更新 ChannelsPanel 支持 API 渠道

**Files:**
- Modify: `components/channels/ChannelsPanel.tsx`

- [ ] **Step 1: 在 `CHANNEL_TYPES` 数组中增加 API 类型**

在 `CHANNEL_TYPES` 数组（约第 9 行）末尾添加：

```typescript
const CHANNEL_TYPES: { type: ChannelType; label: string; icon: string }[] = [
  { type: 'dingtalk', label: '钉钉', icon: '🔵' },
  { type: 'feishu', label: '飞书', icon: '🟣' },
  { type: 'wechat', label: '微信 ClawBot', icon: '🟢' },
  { type: 'api', label: 'API 接入', icon: '🔌' },
]
```

- [ ] **Step 2: 修改 `handleAdd` 函数，增加 api 分支**

在 `handleAdd` 函数的 switch 语句（约第 140 行）中增加：

```typescript
case 'api':
  body.api = { apiKey: '' }  // 由后端生成
  break
```

- [ ] **Step 3: 修改后端 `app/api/channels/route.ts` POST handler**

在 POST handler 中，当 `type === 'api'` 且 `!body.api?.apiKey` 时自动生成 apiKey：

```typescript
// 在 const { type, name, enabled = true, dingtalk, feishu, wechat, api } = body 之后添加：
const channelData: Record<string, unknown> = { type, name, enabled, dingtalk, feishu, wechat }
if (type === 'api') {
  const { randomBytes } = await import('crypto')
  channelData.api = { apiKey: randomBytes(16).toString('hex') }
} else {
  channelData.api = api
}
const channel = addChannel(projectId, channelData as Omit<ChannelConfig, 'id' | 'createdAt'>)
```

- [ ] **Step 4: 修改 `renderNewFields` 函数，增加 api case**

在 `renderNewFields` 函数中增加：

```typescript
case 'api':
  return (
    <div className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>
      <p>API Key 将在创建后自动生成。</p>
      <p className="mt-1 opacity-75">第三方系统通过 HTTP API + SSE 与 Agent 交互。</p>
    </div>
  )
```

- [ ] **Step 5: 修改 `renderEditFields` 函数，增加 api case**

在 `renderEditFields` 函数中增加：

```typescript
case 'api':
  return (
    <div className="text-xs py-1" style={{ color: 'var(--color-text-muted)' }}>
      API Key 创建后不可修改，如需更换请删除后重新创建。
    </div>
  )
```

- [ ] **Step 6: 修改渠道卡片中的 Webhook URL 显示区域**

在渠道列表渲染中（约第 551-571 行的 `{/* Webhook URL */}` 区域），对 api 类型显示 API Key 和端点信息而非 Webhook URL。找到以下代码块：

```tsx
{/* Webhook URL */}
<div className="flex items-center gap-1.5">
  <input
    readOnly
    value={webhookUrl}
    ...
  />
  <button
    onClick={() => copyToClipboard(webhookUrl, ch.id)}
    ...
  >
    ...
  </button>
</div>
```

替换为条件渲染：

```tsx
{/* API 渠道：显示 Key + 端点 */}
{ch.type === 'api' ? (
  <div className="space-y-1.5">
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Key:</span>
      <input
        readOnly
        value={ch.api?.apiKey || ''}
        className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-mono border outline-none"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-muted)',
        }}
      />
      <button
        onClick={() => copyToClipboard(ch.api?.apiKey || '', `key_${ch.id}`)}
        className="p-1 rounded cursor-pointer transition-colors flex-shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
        title="复制 API Key"
      >
        {copiedId === `key_${ch.id}` ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
      </button>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>POST:</span>
      <input
        readOnly
        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/channels/webhook/api/message`}
        className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-mono border outline-none"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-muted)',
        }}
      />
      <button
        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/channels/webhook/api/message`, `url_${ch.id}`)}
        className="p-1 rounded cursor-pointer transition-colors flex-shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
        title="复制端点 URL"
      >
        {copiedId === `url_${ch.id}` ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
      </button>
    </div>
  </div>
) : (
  <div className="flex items-center gap-1.5">
    <input
      readOnly
      value={webhookUrl}
      className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-mono border outline-none"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        color: 'var(--color-text-muted)',
      }}
    />
    <button
      onClick={() => copyToClipboard(webhookUrl, ch.id)}
      className="p-1 rounded cursor-pointer transition-colors flex-shrink-0"
      style={{ color: 'var(--color-text-muted)' }}
      title="复制 Webhook URL"
    >
      {copiedId === ch.id ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
    </button>
  </div>
)}
```

注意：所有 `flex-1` 的 `<input>` 都需要加 `min-w-0`（Tauri WebKit 兼容性，见项目 CLAUDE.md）。

- [ ] **Step 7: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 8: 提交**

```bash
git add components/channels/ChannelsPanel.tsx app/api/channels/route.ts
git commit -m "feat: 前端渠道配置界面支持 API 渠道类型"
```

---

## Chunk 6: 集成验证

### Task 7: 编译检查与手动测试

- [ ] **Step 1: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 2: 运行 ESLint**

```bash
npm run lint
```

Expected: 无新增 lint 错误

- [ ] **Step 3: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 4: 手动测试 - 创建 API 渠道**

在 Web UI 中：
1. 进入项目设置 → 渠道管理
2. 点击添加渠道，选择「API 接入」
3. 输入名称，确认添加
4. 验证卡片显示 API Key + 端点 URL + 复制按钮

- [ ] **Step 5: 手动测试 - API 调用**

使用 curl 测试（替换实际的 apiKey）：

```bash
# 先建立 SSE 连接
curl -N -H "Authorization: Bearer <apiKey>" http://localhost:3000/api/channels/webhook/api/stream

# 另一个终端发送消息
curl -X POST http://localhost:3000/api/channels/webhook/api/message \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'

# 预期：SSE 连接收到 event: done + 完整回复
```

- [ ] **Step 6: 验证 Web UI 同步可见**

在 Web UI 聊天界面中，确认第三方发来的消息和 Agent 回复都可见。

- [ ] **Step 7: 最终提交**

```bash
git add -A
git commit -m "feat: API 渠道（第三方系统接入）功能完成"
```
