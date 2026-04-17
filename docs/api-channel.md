# GClaw API 渠道接口文档

第三方系统通过 HTTP API 与 GClaw Agent 交互，支持持久 SSE 会话模式。

## 接入流程

```
1. 在 GClaw Web UI 中添加「API 接入」渠道，获取 API Key
2. 建立 SSE 长连接（保持连接不断）
3. 通过 POST 接口发送消息
4. 通过 SSE 连接接收 Agent 执行结果
```

## 认证

所有请求使用 Bearer Token 认证，在 HTTP Header 中携带 API Key：

```
Authorization: Bearer <your-api-key>
```

## 接口列表

### 1. 建立 SSE 连接

建立持久 SSE 长连接，用于接收 Agent 执行结果。

```
GET /api/channels/webhook/api/stream
Authorization: Bearer <api-key>
```

**响应：** `Content-Type: text/event-stream`

连接成功后立即收到 `connected` 事件，之后每 30 秒发送心跳包保持连接。

**SSE 事件格式：**

| 事件类型 | 说明 | 数据结构 |
|---------|------|---------|
| `connected` | 连接建立成功 | `{ "channelId": "xxx" }` |
| `api_done` | Agent 执行完成 | DoneEvent |
| `api_error` | 执行出错 | ErrorEvent |
| `heartbeat` | 心跳（SSE 注释行） | 无 |

**DoneEvent：**

```json
{
  "requestId": "req_1744867200000_a1b2c3",
  "content": "Agent 的完整回复文本",
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 567,
    "cachedTokens": 890,
    "model": "claude-sonnet-4-6",
    "costUsd": 0.012
  }
}
```

**ErrorEvent：**

```json
{
  "requestId": "req_1744867200000_a1b2c3",
  "message": "错误描述"
}
```

### 2. 发送消息

向 Agent 发送一条消息，Agent 在后台异步执行，结果通过 SSE 连接推送。

```
POST /api/channels/webhook/api/message
Authorization: Bearer <api-key>
Content-Type: application/json
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 发送给 Agent 的消息内容 |

**请求示例：**

```json
{
  "message": "帮我分析一下这个项目的架构"
}
```

**响应：**

| 状态码 | 说明 | 响应体 |
|--------|------|--------|
| 202 | 已接受，Agent 异步执行中 | `{ "requestId": "req_xxx" }` |
| 400 | 请求参数错误 | `{ "error": "message is required" }` |
| 401 | 认证失败（API Key 无效或缺失） | `{ "error": "Unauthorized" }` |

## 完整调用示例

### curl

```bash
# 终端 1：建立 SSE 连接，持续监听结果
curl -N -H "Authorization: Bearer your-api-key-here" \
  http://localhost:3000/api/channels/webhook/api/stream

# 终端 2：发送消息
curl -X POST http://localhost:3000/api/channels/webhook/api/message \
  -H "Authorization: Bearer your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，请介绍一下你自己"}'
```

**SSE 输出：**

```
event: connected
data: {"channelId":"a1b2c3d4"}

: heartbeat

event: api_done
data: {"requestId":"req_1744867200000_a1b2c3","content":"你好！我是 GClaw Agent...","usage":{"inputTokens":150,"outputTokens":80,"cachedTokens":0,"model":"claude-sonnet-4-6","costUsd":0.005}}
```

### Python

```python
import requests
import sseclient

API_KEY = "your-api-key-here"
BASE_URL = "http://localhost:3000"

# 1. 建立 SSE 连接（在独立线程中运行）
def listen_sse():
    resp = requests.get(
        f"{BASE_URL}/api/channels/webhook/api/stream",
        headers={"Authorization": f"Bearer {API_KEY}"},
        stream=True,
    )
    client = sseclient.SSEClient(resp)
    for event in client.events():
        if event.event == "api_done":
            data = json.loads(event.data)
            print(f"完成 [{data['requestId']}]: {data['content']}")
        elif event.event == "api_error":
            data = json.loads(event.data)
            print(f"错误 [{data['requestId']}]: {data['message']}")

# 2. 发送消息
def send_message(text: str) -> str:
    resp = requests.post(
        f"{BASE_URL}/api/channels/webhook/api/message",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={"message": text},
    )
    return resp.json()["requestId"]

# 使用示例
import threading, json

# 启动 SSE 监听线程
t = threading.Thread(target=listen_sse, daemon=True)
t.start()

# 发送消息
request_id = send_message("你好，请介绍一下你自己")
print(f"已发送，requestId={request_id}")
```

### Node.js

```javascript
const API_KEY = "your-api-key-here";
const BASE_URL = "http://localhost:3000";

// 1. 建立 SSE 连接
const eventSource = new EventSource(
  `${BASE_URL}/api/channels/webhook/api/stream`,
  { headers: { Authorization: `Bearer ${API_KEY}` } }
);

// 注意：标准 EventSource 不支持自定义 Header，需用 fetch 实现：
async function listenSSE() {
  const resp = await fetch(`${BASE_URL}/api/channels/webhook/api/stream`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    // 解析 SSE 格式的 text...
    console.log(text);
  }
}

// 2. 发送消息
async function sendMessage(text) {
  const resp = await fetch(`${BASE_URL}/api/channels/webhook/api/message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: text }),
  });
  return await resp.json(); // { requestId: "req_xxx" }
}
```

## 注意事项

- SSE 连接需保持活跃，断开后需要重新建立
- `requestId` 用于关联发送的消息与 SSE 推送的结果
- 同一项目的新消息会终止 Agent 正在执行的查询
- Agent 执行结果同时会同步显示在 GClaw Web UI 中
- API Key 在 GClaw Web UI 的渠道设置中创建时自动生成，无法修改，需更换时请删除后重新创建
