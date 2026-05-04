---
name: workflow-creator
description: "通过对话方式创建和管理 GClaw 命令工作流。支持引导式创建、AI 自动生成、工作流优化和管理操作。"
allowed-tools:
  - Bash(curl:*)
read_when:
  - 用户想要创建新的命令或工作流
  - 用户描述了一个自动化流程需求
  - 用户说"创建工作流"、"新建命令"、"自动化流程"
  - 用户想要修改或优化现有工作流
metadata:
  openclaw:
    emoji: "🔧"
---

# Workflow Creator - 命令工作流创建助手

## 概述

本 Skill 用于在对话中帮助用户创建、优化和管理 GClaw 命令工作流。你需要根据用户的自然语言描述，组装出符合 `CommandDefinition` 规范的 JSON，并通过 API 完成创建。

支持两种创建模式：
1. **AI 自动生成** — 用户描述需求，调用生成 API 一键产出完整命令
2. **引导式创建** — 分步引导用户定义命令各部分，适合复杂或精细控制场景

## 环境变量

所有 API 调用依赖以下环境变量（运行时已注入，无需用户提供）：
- `$GCLAW_API_BASE` — API 根地址
- `$GCLAW_INTERNAL_API_KEY` — 内部认证密钥
- `$GCLAW_PROJECT_ID` — 当前项目 ID

## 模式一：AI 自动生成

当用户给出简短的需求描述时，优先使用此模式快速生成。

**流程：**
1. 提取用户需求描述
2. 调用生成 API
3. 展示生成结果，让用户确认或调整
4. 确认后调用创建 API 保存

**API 调用：**

```bash
curl -s -X POST "${GCLAW_API_BASE}/api/commands/generate" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}" \
  -d '{
    "action": "generate",
    "description": "用户的需求描述文本",
    "projectId": "'"${GCLAW_PROJECT_ID}"'"
  }'
```

如果用户对生成结果不满意，可以调用优化 API：

```bash
curl -s -X POST "${GCLAW_API_BASE}/api/commands/generate" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}" \
  -d '{
    "action": "optimize",
    "command": { ... 已有的 CommandDefinition ... },
    "instruction": "用户的优化指令"
  }'
```

## 模式二：引导式创建

适用于用户需要精细控制或需求较复杂的场景。按以下 6 个步骤依次进行。

### Step 1: 收集基本信息

向用户询问并确定以下字段：

| 字段 | 规则 | 示例 |
|------|------|------|
| `id` | kebab-case，仅小写字母/数字/连字符，不可与内置命令冲突（clear, theme, project, skills, agents, settings） | `daily-report` |
| `name` | 显示名称，简洁明了 | `每日报告生成器` |
| `description` | 一句话描述命令功能 | `自动收集项目进展并生成日报` |
| `category` | 可选值：`development`, `analysis`, `writing`, `automation`, `other` | `automation` |
| `scope` | `global`（全局可用）或 `project`（仅当前项目） | `project` |

**提示策略：** 如果用户只给了名称或描述，根据语义自动推导 id 和 category，向用户确认即可。

### Step 2: 定义参数（可选）

询问用户命令是否需要输入参数。每个参数结构：

```json
{
  "name": "reportType",
  "type": "enum",
  "required": true,
  "default": "daily",
  "description": "报告类型",
  "values": ["daily", "weekly", "monthly"],
  "placeholder": "选择报告类型"
}
```

**参数类型说明：**
- `string` — 文本输入
- `number` — 数值输入
- `boolean` — 布尔开关
- `enum` — 枚举选择，必须提供 `values` 数组
- `file` — 文件路径

**验证规则：** 参数名仅允许字母、数字、下划线，不能以数字开头。

### Step 3: 设计步骤

这是核心环节。根据用户需求拆分为具体的执行步骤。最多 20 个步骤。

详细的步骤类型说明见下方「步骤类型参考」章节。

**设计策略：**
- 根据用户描述的流程，拆解为最小执行单元
- 需要 AI 处理的环节用 `prompt` 步骤
- 需要执行系统命令的用 `script` 步骤
- 有分支逻辑的用 `condition` 步骤
- 可复用已有命令的用 `command-ref` 步骤
- 互不依赖可并行的用 `parallel` 步骤
- 步骤间通过 `outputVar` 和模板变量 `{{steps.stepId.output}}` 传递数据

### Step 4: 配置输出格式（可选）

```json
{
  "output": {
    "format": "markdown",
    "saveTo": "reports/{{date}}-report.md"
  }
}
```

`format` 可选值：`markdown`、`json`、`text`。`saveTo` 支持模板变量。

### Step 5: 组装 CommandDefinition

将以上信息组装为完整的 JSON。确保：
- `enabled` 设为 `true`
- `createdAt` 和 `updatedAt` 设为当前 ISO 时间字符串
- 所有步骤 id 为 kebab-case 格式
- 步骤类型严格为 5 种之一，**不允许** `bash`/`shell`/`exec` 等类型

### Step 6: 调用 API 创建

```bash
curl -s -X POST "${GCLAW_API_BASE}/api/commands" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}" \
  -d '{
    "command": { ...完整的 CommandDefinition JSON... },
    "scope": "project",
    "projectId": "'"${GCLAW_PROJECT_ID}"'"
  }'
```

创建成功后告知用户命令已就绪，可通过 `/命令名` 执行。

## 步骤类型参考

### 1. prompt — AI 对话步骤

让 AI 处理文本、分析、生成等任务。

```json
{
  "id": "analyze-code",
  "type": "prompt",
  "name": "分析代码质量",
  "userMessage": "请分析以下代码的质量问题：\n{{steps.read-source.output}}",
  "systemPrompt": "你是一位资深代码审查专家",
  "agent": "claude-sonnet",
  "skills": ["code-review"],
  "tools": [],
  "maxTurns": 10,
  "outputVar": "analysis",
  "onError": "stop"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `userMessage` | 是 | 发送给 AI 的消息，支持模板变量 |
| `systemPrompt` | 否 | 系统提示词，定义 AI 角色 |
| `agent` | 否 | 指定 Agent |
| `skills` | 否 | 启用的技能列表 |
| `tools` | 否 | 可用工具列表 |
| `maxTurns` | 否 | 最大对话轮次，默认 50 |
| `outputVar` | 否 | 存储输出的变量名 |

### 2. script — Shell 脚本执行

执行系统命令，获取命令行输出。**脚本超时 30 秒。**

```json
{
  "id": "list-files",
  "type": "script",
  "name": "列出项目文件",
  "command": "find . -name '*.ts' -not -path './node_modules/*' | head -50",
  "cwd": ".",
  "outputVar": "fileList",
  "onError": "continue"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `command` | 是 | Shell 命令，禁止危险命令（rm -rf, sudo, mkfs 等） |
| `cwd` | 否 | 工作目录 |
| `outputVar` | 否 | 存储命令输出的变量名 |

### 3. condition — 条件分支

根据条件执行不同的步骤分支。

```json
{
  "id": "check-result",
  "type": "condition",
  "name": "检查分析结果",
  "if": "steps.analyze-code.output contains '严重问题'",
  "then": ["alert"],
  "else": ["summary"],
  "onError": "stop"
}
```

> **注意：** `then`/`else` 引用的目标步骤（如 `alert`、`summary`）必须在 `steps` 数组中定义为独立步骤。

| 字段 | 必填 | 说明 |
|------|------|------|
| `if` | 是 | 条件表达式字符串，如 `steps.xx.output contains '文本'` |
| `then` | 是 | 条件为真时执行的步骤 ID 字符串数组 |
| `else` | 否 | 条件为假时执行的步骤 ID 字符串数组 |

**条件表达式语法：**
- `steps.xxx.output contains '文本'`
- `steps.xxx.output == '值'`
- `steps.xxx.output != '值'`
- `steps.xxx.output isEmpty`

### 4. command-ref — 引用其他命令

复用已有命令，避免重复定义。

```json
{
  "id": "run-lint",
  "type": "command-ref",
  "name": "执行代码检查",
  "commandId": "code-lint",
  "params": {
    "target": "{{params.filePath}}",
    "fix": "true"
  },
  "outputVar": "lintResult",
  "onError": "continue"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `commandId` | 是 | 被引用命令的 ID |
| `params` | 否 | 传递给被引用命令的参数 |
| `outputVar` | 否 | 存储引用命令输出的变量名 |

### 5. parallel — 并行执行

同时执行多个独立分支，提升效率。

```json
{
  "id": "parallel-analysis",
  "type": "parallel",
  "name": "并行分析",
  "branches": [
    [
      { "id": "analyze-perf", "type": "prompt", "userMessage": "分析性能问题：{{steps.read-source.output}}" }
    ],
    [
      { "id": "analyze-security", "type": "prompt", "userMessage": "分析安全问题：{{steps.read-source.output}}" }
    ]
  ],
  "outputVar": "parallelResults",
  "onError": "continue"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `branches` | 是 | 步骤数组的数组，每个子数组为一个并行分支 |
| `outputVar` | 否 | 存储所有分支输出的变量名 |

## 模板变量参考

在步骤的 `userMessage`、`command`、`systemPrompt` 等字段中使用 `{{变量}}` 语法引用数据：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{params.参数名}}` 或 `{{参数名}}` | 命令参数值 | `{{params.reportType}}` |
| `{{steps.步骤id.output}}` | 前置步骤的输出 | `{{steps.list-files.output}}` |
| `{{date}}` | 当前日期 | `2026-05-05` |
| `{{projectId}}` | 当前项目 ID | — |
| `{{env.变量名}}` | 环境变量 | `{{env.HOME}}` |

> **重要：** 模板引擎仅支持简单的 `{{表达式}}` 替换，**不支持** Mustache 块语法（如 `{{#var}}...{{/var}}`）。如需条件逻辑，请使用 `condition` 步骤实现分支。

## 验证规则清单

在组装 JSON 前，务必逐项检查：

1. **ID 格式** — kebab-case，仅小写字母、数字、连字符
2. **ID 唯一性** — 不可与内置命令冲突：`clear`, `theme`, `project`, `skills`, `agents`, `settings`
3. **步骤类型** — 仅允许 `prompt`, `script`, `condition`, `command-ref`, `parallel`
4. **步骤数量** — 最多 20 个
5. **参数名** — 字母/数字/下划线，不以数字开头
6. **危险命令** — script 步骤中禁止 `rm -rf /`, `sudo`, `mkfs`, `dd if=` 等危险命令
7. **必填字段** — prompt 需要 `userMessage`；script 需要 `command`；condition 需要 `if` 和 `then`；command-ref 需要 `commandId`；parallel 需要 `branches`
8. **模板变量引用** — 确保引用的步骤 id 存在且在当前步骤之前

## 完整示例：创建「项目日报生成器」

**用户需求：** "帮我创建一个每日项目报告工作流，先获取今天的 git 提交记录，然后让 AI 生成日报摘要"

**Step 1 — 确定基本信息：**
- id: `daily-report`
- name: `每日项目报告`
- description: `获取当日 Git 提交记录并生成日报摘要`
- category: `writing`
- scope: `project`

**Step 2 — 定义参数：**

```json
[
  {
    "name": "author",
    "type": "string",
    "required": false,
    "description": "筛选指定作者的提交",
    "placeholder": "留空则包含所有作者"
  }
]
```

**Step 3 — 设计步骤：**

步骤 1（script）：获取 Git 提交日志
步骤 2（condition）：检查是否有提交记录
步骤 3（prompt）：AI 生成日报摘要

**Step 4-5 — 组装完整 JSON：**

```json
{
  "id": "daily-report",
  "name": "每日项目报告",
  "description": "获取当日 Git 提交记录并生成日报摘要",
  "category": "writing",
  "scope": "project",
  "enabled": true,
  "parameters": [
    {
      "name": "author",
      "type": "string",
      "required": false,
      "description": "筛选指定作者的提交",
      "placeholder": "留空则包含所有作者"
    }
  ],
  "steps": [
    {
      "id": "get-commits",
      "type": "script",
      "name": "获取今日提交记录",
      "command": "git log --since='1 day ago' --pretty=format:'%h %s (%an)'",
      "outputVar": "commits",
      "onError": "stop"
    },
    {
      "id": "check-commits",
      "type": "condition",
      "name": "检查提交记录",
      "if": "steps.get-commits.output isEmpty",
      "then": ["no-commits"],
      "else": ["generate-report"]
    },
    {
      "id": "no-commits",
      "type": "prompt",
      "userMessage": "今天暂无 Git 提交记录，请生成一份简短说明。"
    },
    {
      "id": "generate-report",
      "type": "prompt",
      "name": "生成日报",
      "userMessage": "请根据以下 Git 提交记录生成一份结构化的项目日报，包含：工作摘要、主要变更、明日计划建议。\n\n提交记录：\n{{steps.get-commits.output}}",
      "systemPrompt": "你是一位专业的项目经理助手，擅长从提交记录中提炼工作成果。",
      "outputVar": "report"
    }
  ],
  "output": {
    "format": "markdown",
    "saveTo": "reports/{{date}}-daily-report.md"
  },
  "createdAt": "2026-05-05T00:00:00.000Z",
  "updatedAt": "2026-05-05T00:00:00.000Z"
}
```

**Step 6 — 调用创建 API：**

```bash
curl -s -X POST "${GCLAW_API_BASE}/api/commands" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}" \
  -d '{
    "command": { ...上述完整 JSON... },
    "scope": "project",
    "projectId": "'"${GCLAW_PROJECT_ID}"'"
  }'
```

## 工作流管理操作

### 查看现有命令

```bash
curl -s "${GCLAW_API_BASE}/api/commands?projectId=${GCLAW_PROJECT_ID}" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}"
```

### 更新命令

```bash
curl -s -X PUT "${GCLAW_API_BASE}/api/commands/COMMAND_ID" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}" \
  -d '{
    "updates": { "description": "更新后的描述", "enabled": false },
    "scope": "project",
    "projectId": "'"${GCLAW_PROJECT_ID}"'"
  }'
```

### 删除命令

```bash
curl -s -X DELETE "${GCLAW_API_BASE}/api/commands/COMMAND_ID?scope=project&projectId=${GCLAW_PROJECT_ID}" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}"
```

## 交互策略

1. **简单需求** — 直接使用 AI 自动生成模式，生成后展示给用户确认
2. **复杂需求** — 使用引导式创建，逐步与用户确认每个部分
3. **优化请求** — 获取现有命令 JSON，调用优化 API 改进
4. **始终确认** — 在调用创建/更新 API 前，先向用户展示完整 JSON 并获得确认
5. **错误处理** — API 返回错误时，解析错误信息，修正后重试
