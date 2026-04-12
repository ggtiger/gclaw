---
name: gclaw-api
description: "GClaw 平台 API 操作技能。提供对项目、会话、设置、技能、智能体、渠道等所有 GClaw REST API 的结构化调用能力。严格要求：每次 API 调用前必须向用户确认操作内容和参数。"
metadata:
---

# GClaw API 操作技能

通过 HTTP API 管理 GClaw 平台的所有资源：项目、会话、设置、技能、智能体和渠道。

## 严格规则

> **每次执行 API 调用前，必须先向用户展示即将执行的操作（方法、URL、参数），获得用户明确确认后才能执行。**
>
> 禁止静默调用、批量免确认、自动重试。每一次 HTTP 请求都需要独立确认。

### 确认格式

每次调用前，按以下格式向用户确认：

```
即将执行 API 调用：
  方法: POST
  地址: $GCLAW_API_BASE/api/projects
  参数: {"name": "新项目"}
  
是否确认执行？
```

用户明确同意后（如"好的"、"确认"、"执行"），再使用 Bash 工具执行 `curl` 命令。

### 调用方式

所有 API 通过 `curl` 调用。平台地址和当前项目 ID 通过环境变量自动注入：

- `$GCLAW_API_BASE` — 平台基础地址（如 `http://localhost:3000`）
- `$GCLAW_PROJECT_ID` — 当前项目 ID
- `$GCLAW_INTERNAL_API_KEY` — 内部 API 密钥（用于技能环境认证）

**重要**：技能环境无法使用浏览器的 Cookie，必须使用内部 API Key 进行认证：

```bash
# GET 请求
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/projects" | jq .

# POST/PUT 请求
curl -s -X POST "$GCLAW_API_BASE/api/chat/stream" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "hello", "projectId": "'$GCLAW_PROJECT_ID'"}'

# DELETE 请求
curl -s -X DELETE "$GCLAW_API_BASE/api/projects?id=xxx" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .
```

> **注意**：所有 API 调用都必须包含 `-H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY"` 请求头，否则会返回 `{"error":"未登录"}` 错误。

---

## API 参考

### 1. 项目管理

#### 获取所有项目

```
GET /api/projects
```

**返回**: `{ projects: [{ id, name, createdAt, updatedAt }] }`

#### 创建项目

```
POST /api/projects
Content-Type: application/json

{ "name": "项目名称" }
```

**返回**: `{ project: { id, name, createdAt, updatedAt } }`

#### 重命名项目

```
PUT /api/projects
Content-Type: application/json

{ "id": "项目ID", "name": "新名称" }
```

#### 删除项目

```
DELETE /api/projects?id={项目ID}
```

---

### 2. 聊天

#### 发送消息（SSE 流）

```
POST /api/chat/stream
Content-Type: application/json

{ "message": "用户消息", "projectId": "项目ID" }
```

**返回**: SSE 流，事件类型：
- `delta` — 增量文本 `{ content: "..." }`
- `done` — 完成 `{ usage, costUsd, model }`
- `permission_request` — 权限请求 `{ requestId, toolName, description }`
- `skill_notify` — 技能通知
- `error` — 错误
- `end` — 流结束

> **注意**: 这是 SSE 流式端点，用 `curl -N` 获取流式输出。

#### 获取消息历史

```
GET /api/chat/messages?projectId={ID}&limit={50}&before={消息ID}
```

**参数**:
- `projectId`（必需）
- `limit`（可选，默认 50）
- `before`（可选，分页游标）

#### 清空消息

```
DELETE /api/chat/messages?projectId={ID}
```

同时清空项目的 sessionId。

#### 中止执行

```
POST /api/chat/abort?projectId={ID}
```

**返回**: `{ success: boolean, message: string }`

#### 权限审批

```
POST /api/chat/permission
Content-Type: application/json

{ "requestId": "请求ID", "decision": "allow" | "deny" }
```

---

### 3. 设置

#### 获取设置

```
GET /api/settings?projectId={ID}
```

**返回**: 完整设置对象（AppSettings = GlobalSettings & ProjectSettings）

```typescript
interface AppSettings {
  // 全局
  apiKey: string
  apiBaseUrl: string
  theme: 'light' | 'dark' | 'system'
  // 项目级
  model: string
  effort: 'low' | 'medium' | 'high'
  sessionId: string
  cwd: string
  dangerouslySkipPermissions: boolean
  systemPrompt: string
}
```

#### 更新设置

```
PUT /api/settings?projectId={ID}
Content-Type: application/json

{ "model": "claude-sonnet-4-20250514", "effort": "high" }
```

支持部分更新（Partial）。

---

### 4. 技能管理

#### 获取技能列表

```
GET /api/skills?projectId={ID}
```

**返回**: `{ skills: [{ name, displayName, description, path, enabled }], enabled: string[] }`

#### 更新启用技能

```
PUT /api/skills?projectId={ID}
Content-Type: application/json

{ "enabled": ["self-improving-agent", "gclaw-api"] }
```

#### 搜索技能市场

```
GET /api/skills/market?q={关键词}&page={1}&limit={20}
```

#### 安装技能

```
POST /api/skills/market/install
Content-Type: application/json

{ "skillName": "技能名称" }
```

---

### 5. 智能体管理

#### 获取智能体列表

```
GET /api/agents?projectId={ID}
```

**返回**: `{ agents: [AgentInfo] }`

```typescript
interface AgentInfo {
  name: string
  description: string
  prompt: string
  model: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  tools: string[]
  disallowedTools: string[]
  enabled: boolean
}
```

#### 创建智能体

```
POST /api/agents?projectId={ID}
Content-Type: application/json

{
  "name": "agent-name",
  "prompt": "你是一个专门处理XX的助手",
  "description": "可选描述",
  "model": "inherit",
  "tools": [],
  "disallowedTools": []
}
```

**必需字段**: `name`, `prompt`。名称重复返回 409。

#### 更新智能体

```
PUT /api/agents?projectId={ID}
Content-Type: application/json

{ "name": "agent-name", "description": "更新描述", "prompt": "新指令" }
```

**必需字段**: `name`（用于定位）。

#### 删除智能体

```
DELETE /api/agents?projectId={ID}&name={agent-name}
```

---

### 6. 渠道管理

#### 获取渠道列表

```
GET /api/channels?projectId={ID}
```

**返回**: `{ success: true, channels: [Channel] }`

#### 添加渠道

```
POST /api/channels?projectId={ID}
Content-Type: application/json

{
  "type": "dingtalk" | "feishu" | "wechat",
  "name": "渠道名称",
  "enabled": true,
  "dingtalk": { "appKey": "...", "appSecret": "..." },
  "feishu": { "appId": "...", "appSecret": "..." },
  "wechat": { "botToken": "..." }
}
```

**必需字段**: `type`, `name`。渠道特定配置按类型提供。

#### 更新渠道

```
PUT /api/channels?projectId={ID}&channelId={渠道ID}
Content-Type: application/json

{ "name": "新名称", "enabled": false }
```

#### 删除渠道

```
DELETE /api/channels?projectId={ID}&channelId={渠道ID}
```

#### 订阅渠道事件（SSE）

```
GET /api/channels/events?projectId={ID}
```

SSE 流端点，事件类型：`connected`, `channel_message`, `agent_reply`。每 30 秒心跳保活。

---

### 7. 定时任务

#### 获取任务列表

```
GET /api/schedules?projectId={ID}
```

**参数**:
- `projectId`（可选）— 按项目过滤，返回全局 + 该项目的任务

**返回**: `{ tasks: [ScheduledTask] }`

```typescript
interface ScheduledTask {
  id: string               // task_{uuid8}
  name: string
  type: 'chat-message' | 'execute-skill' | 'webhook' | 'script' | 'custom'
  schedule: {
    mode: 'once' | 'interval' | 'cron'
    runAt?: string           // once: ISO 时间戳
    intervalMs?: number      // interval: 间隔毫秒
    cron?: string            // cron: 5 位标准表达式
  }
  config: Record<string, unknown>  // 由执行器解析
  projectId?: string
  enabled: boolean
  status: 'idle' | 'running' | 'error'
  lastRunAt?: string
  lastResult?: { success: boolean; startedAt: string; finishedAt: string; error?: string }
  nextRunAt?: string
  runCount: number
  createdAt: string
  updatedAt: string
  createdBy?: string       // userId 或 'skill:xxx'
}
```

#### 创建定时任务

```
POST /api/schedules
Content-Type: application/json

{
  "name": "每日总结",
  "type": "chat-message",
  "schedule": { "mode": "cron", "cron": "0 9 * * *" },
  "config": { "message": "请总结今天的工作进展" },
  "projectId": "项目ID",
  "enabled": true
}
```

**必需字段**: `name`, `type`, `schedule.mode`

**type 对应的 config**:
| type | config 字段 | 说明 |
|------|-------------|------|
| `chat-message` | `{ message, agentName? }` | 向项目发送聊天消息 |
| `script` | `{ command, cwd?, timeout? }` | 执行 shell 命令 |
| `webhook` | `{ url, method?, headers?, body? }` | 发送 HTTP 请求 |
| `execute-skill` | `{ scriptPath, args? }` | 执行技能脚本 |

**返回**: `{ task: ScheduledTask }`

#### 更新定时任务

```
PUT /api/schedules?id={任务ID}
Content-Type: application/json

{ "enabled": false, "name": "新名称" }
```

支持部分更新。可更新 `name`, `type`, `schedule`, `config`, `enabled` 等字段。

#### 删除定时任务

```
DELETE /api/schedules?id={任务ID}
```

**返回**: `{ success: true }`

#### 手动触发任务

```
POST /api/schedules/trigger?id={任务ID}
```

异步执行，立即返回。

**返回**: `{ success: true, message: "Task \"xxx\" triggered" }`

---

### 8. 待办 / 笔记 / 日程管理（专注模式）

专注模式提供三种数据的管理：`todos`（待办）、`notes`（笔记）、`events`（日程事件）。

每种数据类型支持三种数据源：`file`（文件）、`skill`（技能）、`api`（外部接口）。

#### 获取专注数据

```
GET /api/focus?projectId={ID}&type={todos|notes|events}
```

**参数**:
- `projectId`（必需）
- `type`（必需）— 数据类型：`todos`、`notes`、`events`

**返回**: 数据数组，结构因类型而异

```typescript
// todos 返回
[{ id, title, status: 'pending'|'in_progress'|'completed', priority?: 'low'|'medium'|'high', dueDate?, createdAt, updatedAt }]

// notes 返回
[{ id, title, content, tags?, createdAt, updatedAt }]

// events 返回
[{ id, title, description?, startTime, endTime?, location?, color? }]
```

#### 创建数据项

```
POST /api/focus?projectId={ID}&type={todos|notes|events}
Content-Type: application/json
```

**todos 示例**: `{ "title": "完成任务", "priority": "high", "dueDate": "2026-04-15" }`
**notes 示例**: `{ "title": "会议纪要", "content": "讨论了...", "tags": ["会议"] }`
**events 示例**: `{ "title": "项目评审", "startTime": "2026-04-15T10:00:00Z", "endTime": "2026-04-15T11:00:00Z" }`

**返回**: 创建的完整数据项

#### 更新数据项

```
PUT /api/focus?projectId={ID}&type={todos|notes|events}
Content-Type: application/json

{ "id": "项目ID", ...其他更新字段 }
```

**必需字段**: `id`

#### 删除数据项

```
DELETE /api/focus?projectId={ID}&type={todos|notes|events}&id={数据项ID}
```

**返回**: `{ success: true }`

#### 获取专注模式设置

```
GET /api/focus/settings?projectId={ID}
```

**返回**: 三种数据类型的配置

```typescript
{
  todos:   { type: 'file'|'skill'|'api', enabled: boolean, filePath?, format?, skillName?, skillParams?, apiUrl?, apiMethod?, apiHeaders? },
  notes:   { ... },
  events:  { ... }
}
```

#### 更新专注模式设置

```
PUT /api/focus/settings?projectId={ID}
Content-Type: application/json
```

支持部分更新，例如切换数据源：

```json
{ "todos": { "type": "skill", "enabled": true, "skillName": "tencent-docs", "skillParams": { "docId": "xxx" } } }
```

#### 从技能获取专注数据

```
GET /api/focus/skill?projectId={ID}&type={todos|notes|events}&skillName={技能名}
```

直接从指定技能获取数据，绕过 FocusSettings 配置。

**查询技能 Hooks 信息**:

```
GET /api/focus/skill?projectId={ID}&skillName={技能名}&info=hooks
```

支持额外参数（前缀 `param_`）：`&param_key=value`

---

### 9. 渠道 Webhook

> 以下端点由外部平台回调，通常不需要手动调用。

#### 钉钉 Webhook

```
POST /api/channels/webhook/dingtalk?key={appKey}
Headers: timestamp, sign (HMAC-SHA256)
```

#### 飞书 Webhook

```
POST /api/channels/webhook/feishu?key={appId}
```

支持 URL 验证 challenge。

#### 微信 ClawBot Webhook

```
POST /api/channels/webhook/wechat?key={botToken}
Headers: Authorization: Bearer {botToken}
```

---

### 10. 微信连接管理

#### 查询连接状态

```
GET /api/channels/webhook/wechat/connect?projectId={ID}&channelId={ID}
```

不带参数返回所有连接状态。

#### 启动/重连

```
POST /api/channels/webhook/wechat/connect
Content-Type: application/json

{ "projectId": "...", "channelId": "..." }
```

#### 断开连接

```
DELETE /api/channels/webhook/wechat/connect?projectId={ID}&channelId={ID}
```

#### 扫码登录

```
POST /api/channels/webhook/wechat/login
Content-Type: application/json

// 获取 QR 码
{ "action": "start" }

// 轮询登录状态
{ "action": "poll", "qrcode": "qr-data" }

// 保存 Token
{ "action": "save", "botToken": "...", "projectId": "...", "channelId": "..." }
```

---

## 错误处理

所有 API 使用统一的 HTTP 状态码：

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 参数缺失或无效 |
| 403 | 认证失败 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如名称重复）|
| 500 | 服务器内部错误 |

错误响应格式：`{ error: "错误描述" }` 或 `{ success: false, error: "..." }`

## 常见操作示例

> **重要提示**：以下所有示例都省略了 `-H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY"` 请求头以保持简洁。
> **实际使用时，每个 curl 命令都必须添加此请求头！**

### 创建项目并配置

```bash
# 1. 创建项目
curl -s -X POST "$GCLAW_API_BASE/api/projects" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "我的项目"}' | jq .

# 2. 配置设置（使用返回的 project.id）
curl -s -X PUT "$GCLAW_API_BASE/api/settings?projectId=PROJECT_ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-20250514", "effort": "high"}' | jq .

# 3. 启用技能
curl -s -X PUT "$GCLAW_API_BASE/api/skills?projectId=PROJECT_ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": ["self-improving-agent"]}' | jq .
```

### 发送消息并获取回复

```bash
curl -N -X POST "$GCLAW_API_BASE/api/chat/stream" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "projectId": "'$GCLAW_PROJECT_ID'"}'
```

### 管理智能体

```bash
# 创建
curl -s -X POST "$GCLAW_API_BASE/api/agents?projectId=$GCLAW_PROJECT_ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "code-reviewer", "prompt": "你是代码审查专家"}' | jq .

# 列表
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/agents?projectId=$GCLAW_PROJECT_ID" | jq .

# 删除
curl -s -X DELETE "$GCLAW_API_BASE/api/agents?projectId=$GCLAW_PROJECT_ID&name=code-reviewer" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .
```

### 管理定时任务

```bash
# 创建定时消息（每早9点发送）
curl -s -X POST "$GCLAW_API_BASE/api/schedules" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "每日总结",
    "type": "chat-message",
    "schedule": { "mode": "cron", "cron": "0 9 * * *" },
    "config": { "message": "请总结今天的工作进展" },
    "projectId": "'$GCLAW_PROJECT_ID'"
  }' | jq .

# 创建延迟5分钟的单次消息
curl -s -X POST "$GCLAW_API_BASE/api/schedules" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "提醒",
    "type": "chat-message",
    "schedule": { "mode": "once", "runAt": "'$(date -u -v+5M +%Y-%m-%dT%H:%M:%S.000Z)'" },
    "config": { "message": "5分钟到了！" },
    "projectId": "'$GCLAW_PROJECT_ID'"
  }' | jq .

# 查看任务列表
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/schedules?projectId=$GCLAW_PROJECT_ID" | jq .

# 手动触发
curl -s -X POST "$GCLAW_API_BASE/api/schedules/trigger?id=task_xxxxxxxx" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .

# 禁用任务
curl -s -X PUT "$GCLAW_API_BASE/api/schedules?id=task_xxxxxxxx" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' | jq .

# 删除任务
curl -s -X DELETE "$GCLAW_API_BASE/api/schedules?id=task_xxxxxxxx" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .
```

### 管理待办 / 笔记 / 日程

```bash
# ── 待办（todos）──

# 获取待办列表
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=todos" | jq .

# 创建待办
curl -s -X POST "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=todos" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "完成报告", "priority": "high", "dueDate": "2026-04-15"}' | jq .

# 更新待办状态为已完成
curl -s -X PUT "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=todos" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "待办ID", "status": "completed"}' | jq .

# 删除待办
curl -s -X DELETE "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=todos&id=待办ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .

# ── 笔记（notes）──

# 获取笔记列表
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=notes" | jq .

# 创建笔记
curl -s -X POST "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=notes" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "会议纪要", "content": "讨论了项目进度...", "tags": ["会议", "项目"]}' | jq .

# 更新笔记
curl -s -X PUT "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=notes" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "笔记ID", "content": "更新后的内容"}' | jq .

# 删除笔记
curl -s -X DELETE "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=notes&id=笔记ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .

# ── 日程事件（events）──

# 获取日程列表
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=events" | jq .

# 创建日程
curl -s -X POST "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=events" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "项目评审", "startTime": "2026-04-15T10:00:00Z", "endTime": "2026-04-15T11:00:00Z", "location": "会议室A"}' | jq .

# 更新日程
curl -s -X PUT "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=events" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "日程ID", "location": "线上会议", "description": "周会"}' | jq .

# 删除日程
curl -s -X DELETE "$GCLAW_API_BASE/api/focus?projectId=$GCLAW_PROJECT_ID&type=events&id=日程ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" | jq .

# ── 专注模式设置 ──

# 获取设置
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/focus/settings?projectId=$GCLAW_PROJECT_ID" | jq .

# 切换待办数据源为技能
curl -s -X PUT "$GCLAW_API_BASE/api/focus/settings?projectId=$GCLAW_PROJECT_ID" \
  -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"todos": {"type": "skill", "enabled": true, "skillName": "tencent-docs", "skillParams": {"docId": "xxx"}}}' | jq .

# 直接从技能获取数据
curl -s -H "x-internal-api-key: $GCLAW_INTERNAL_API_KEY" \
  "$GCLAW_API_BASE/api/focus/skill?projectId=$GCLAW_PROJECT_ID&type=todos&skillName=tencent-docs" | jq .
```
