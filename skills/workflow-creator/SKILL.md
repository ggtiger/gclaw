---
name: workflow-creator
description: "通过对话方式创建和管理 GClaw 命令工作流。支持引导式创建、AI 自动生成、工作流优化和管理操作。支持 6 种步骤类型（含 dynamic-exec）、自动执行模式、环境变量注入、命令行传参等。"
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
| `autoExecute` | 可选，布尔值。设为 `true` 时跳过步骤间确认，自动连续执行所有步骤 | `true` |

**提示策略：** 如果用户只给了名称或描述，根据语义自动推导 id 和 category，向用户确认即可。

**autoExecute 使用建议：** 适合全自动流水线任务（如定时构建、批量处理），无需人工干预的场景。默认不设置（等同于 `false`），每步完成后需用户确认才继续。

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

**命令行传参：** 用户可在执行命令时直接传递参数值，格式为 `/command-id arg1 arg2`，参数按定义顺序依次填充。

### Step 3: 设计步骤

这是核心环节。根据用户需求拆分为具体的执行步骤。最多 20 个步骤。

详细的步骤类型说明见下方「步骤类型参考」章节。

**设计策略：**
- 根据用户描述的流程，拆解为最小执行单元
- 需要 AI 处理的环节用 `prompt` 步骤
- 需要执行固定 Shell 命令的用 `script` 步骤
- 需要 AI 根据上下文动态生成并执行命令的用 `dynamic-exec` 步骤
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
- 步骤类型严格为 6 种之一，**不允许** `bash`/`shell`/`exec` 等类型
- 如需自动执行，设置 `autoExecute: true`

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
| `disallowedTools` | 否 | 禁用的工具列表 |
| `maxTurns` | 否 | 最大对话轮次，默认 50 |
| `outputVar` | 否 | 存储输出的变量名 |

### 2. script — Shell 脚本执行

执行固定的系统命令，获取命令行输出。**脚本超时 30 秒。** 项目环境变量会自动注入到执行环境中。

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
| `then` | 是 | 条件为真时执行的步骤 ID（字符串或字符串数组） |
| `else` | 否 | 条件为假时执行的步骤 ID（字符串或字符串数组） |

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

### 6. dynamic-exec — AI 动态生成并执行命令（新增）

让 AI 根据意图描述动态生成 Shell 命令并执行。适合命令不固定、需要 AI 根据上下文智能生成的场景。项目环境变量会自动注入到执行环境中。

**执行流程：**
1. 将 `intent` 中的模板变量解析后发送给 AI
2. AI 生成可直接执行的 Shell 命令
3. 自动执行生成的命令并捕获输出

```json
{
  "id": "smart-search",
  "type": "dynamic-exec",
  "name": "智能搜索项目文件",
  "intent": "在项目中搜索所有包含 '{{params.keyword}}' 的 TypeScript 文件，列出文件名和匹配行",
  "cwd": ".",
  "constraints": "只使用 grep 或 rg 命令，不要执行删除操作",
  "outputVar": "searchResult",
  "onError": "continue"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `intent` | 是 | AI 生成命令的意图描述，支持模板变量 |
| `cwd` | 否 | 命令执行的工作目录 |
| `constraints` | 否 | 约束说明，限制 AI 生成的命令范围（如"只生成 git 命令"、"不要执行删除操作"） |
| `outputVar` | 否 | 存储命令执行输出的变量名 |

**script vs dynamic-exec 选择指南：**
- 命令已确定、固定不变 → 使用 `script`
- 命令需根据上下文动态生成 → 使用 `dynamic-exec`

## 模板变量参考

在步骤的 `userMessage`、`command`、`intent`、`systemPrompt` 等字段中使用 `{{变量}}` 语法引用数据：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{params.参数名}}` 或 `{{参数名}}` | 命令参数值 | `{{params.reportType}}` |
| `{{steps.步骤id.output}}` | 前置步骤的输出 | `{{steps.list-files.output}}` |
| `{{date}}` | 当前日期 | `2026-05-05` |
| `{{projectId}}` | 当前项目 ID | — |
| `{{env.变量名}}` | 环境变量（进程级） | `{{env.HOME}}` |

> **重要：** 模板引擎仅支持简单的 `{{表达式}}` 替换，**不支持** Mustache 块语法（如 `{{#var}}...{{/var}}`）。如需条件逻辑，请使用 `condition` 步骤实现分支。

## 环境变量支持

### 项目级环境变量

在项目设置中配置的 `envVariables`（键值对）会在以下步骤类型执行时**自动注入**到进程环境中：

- `script` 步骤 — 执行 Shell 命令时自动加载
- `dynamic-exec` 步骤 — AI 生成的命令执行时自动加载

这意味着你可以在 `script` 的 `command` 中直接使用 `$MY_VAR` 引用项目环境变量，无需在命令中手动 export。

### 模板变量中的环境变量

使用 `{{env.变量名}}` 可以在模板中引用进程级环境变量（包括已注入的项目环境变量），适用于 `userMessage`、`intent`、`systemPrompt` 等模板字段。

## 验证规则清单

在组装 JSON 前，务必逐项检查：

1. **ID 格式** — kebab-case，仅小写字母、数字、连字符
2. **ID 唯一性** — 不可与内置命令冲突：`clear`, `theme`, `project`, `skills`, `agents`, `settings`
3. **步骤类型** — 仅允许 `prompt`, `script`, `condition`, `command-ref`, `parallel`, `dynamic-exec`（共 6 种）
4. **步骤数量** — 最多 20 个
5. **参数名** — 字母/数字/下划线，不以数字开头
6. **危险命令** — script 步骤中禁止 `rm -rf /`, `sudo`, `mkfs`, `dd if=` 等危险命令
7. **必填字段** — prompt 需要 `userMessage`；script 需要 `command`；condition 需要 `if` 和 `then`；command-ref 需要 `commandId`；parallel 需要 `branches`；dynamic-exec 需要 `intent`
8. **模板变量引用** — 确保引用的步骤 id 存在且在当前步骤之前

## 完整示例

### 示例 1：项目日报生成器

**用户需求：** "帮我创建一个每日项目报告工作流，先获取今天的 git 提交记录，然后让 AI 生成日报摘要"

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

### 示例 2：智能代码分析（使用 dynamic-exec + autoExecute）

**用户需求：** "创建一个全自动代码分析工作流，自动找出项目中最大的文件，然后 AI 分析优化建议"

```json
{
  "id": "smart-code-analysis",
  "name": "智能代码分析",
  "description": "AI 动态搜索项目大文件并给出优化建议",
  "category": "development",
  "scope": "project",
  "enabled": true,
  "autoExecute": true,
  "parameters": [
    {
      "name": "fileType",
      "type": "string",
      "required": false,
      "default": "ts",
      "description": "要分析的文件类型",
      "placeholder": "如 ts, js, py"
    }
  ],
  "steps": [
    {
      "id": "find-large-files",
      "type": "dynamic-exec",
      "name": "查找大文件",
      "intent": "找出项目中最大的 10 个 .{{params.fileType}} 文件，按文件大小降序排列，显示文件路径和行数",
      "constraints": "只使用 find、wc、sort 等安全命令，不要删除任何文件",
      "outputVar": "largeFiles",
      "onError": "stop"
    },
    {
      "id": "analyze-files",
      "type": "prompt",
      "name": "分析优化建议",
      "userMessage": "以下是项目中最大的源代码文件：\n\n{{steps.find-large-files.output}}\n\n请分析这些大文件可能存在的问题（如职责过多、可拆分模块等），并给出具体的重构建议。",
      "systemPrompt": "你是一位资深软件架构师，擅长代码重构和模块化设计。",
      "outputVar": "analysis"
    }
  ],
  "output": {
    "format": "markdown"
  },
  "createdAt": "2026-05-05T00:00:00.000Z",
  "updatedAt": "2026-05-05T00:00:00.000Z"
}
```

### 调用创建 API

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

## 修改现有工作流（重要）

当用户要求修改已有的命令/工作流时，**必须**遵循以下流程避免命令重复：

### 修改流程

1. **先查询现有命令** — 使用 GET API 获取当前命令列表，确认目标命令是否已存在
2. **存在则用 PUT 更新** — 如果命令 ID 已存在，**必须使用 PUT 更新**，而非 POST 创建
3. **修改后验证无重复** — 更新完成后再次 GET 查询，确认没有产生重复命令

### 判断规则

- 命令 ID 已存在 → 使用 `PUT /api/commands/COMMAND_ID` 更新
- 命令 ID 不存在 → 使用 `POST /api/commands` 创建

### 修改示例

```bash
# 1. 先查询现有命令
curl -s "${GCLAW_API_BASE}/api/commands?projectId=${GCLAW_PROJECT_ID}" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}"

# 2. 如果命令已存在，使用 PUT 更新
curl -s -X PUT "${GCLAW_API_BASE}/api/commands/COMMAND_ID" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}" \
  -d '{
    "updates": { ...完整的更新字段... },
    "scope": "project",
    "projectId": "'"${GCLAW_PROJECT_ID}"'"
  }'

# 3. 验证无重复
curl -s "${GCLAW_API_BASE}/api/commands?projectId=${GCLAW_PROJECT_ID}" \
  -H "x-internal-api-key: ${GCLAW_INTERNAL_API_KEY}"
```

> **警告：** 对已有 ID 使用 POST 创建会导致命令重复。后端有去重保护（自动转为更新），但最佳实践仍是主动使用 PUT。

## 交互策略

1. **简单需求** — 直接使用 AI 自动生成模式，生成后展示给用户确认
2. **复杂需求** — 使用引导式创建，逐步与用户确认每个部分
3. **优化请求** — 获取现有命令 JSON，调用优化 API 改进
4. **修改请求** — 先 GET 查询确认命令存在，再用 PUT 更新，避免重复创建
5. **始终确认** — 在调用创建/更新 API 前，先向用户展示完整 JSON 并获得确认
6. **错误处理** — API 返回错误时，解析错误信息，修正后重试

## 目录结构规范

每个项目的命令相关文件统一存放在 `.commands/` 目录下：

```
项目数据目录/
└── .commands/
    ├── commands.json          # 命令定义文件
    └── scripts/               # 命令引用的脚本文件
        ├── build.sh
        ├── deploy.sh
        └── ...
```

### 创建脚本文件的规范
- 当工作流步骤需要执行较长的脚本时，建议将脚本保存到 `.commands/scripts/` 目录
- `script` 步骤的 `command` 字段可以引用脚本文件路径，格式为 `scripts/文件名`（如 `scripts/build.sh`）
- 执行器会自动从 `.commands/scripts/` 目录查找并执行对应脚本
- 脚本文件名应该有意义，与工作流/步骤名相关联
- 短命令（单行）直接写在 `command` 字段中即可，无需创建脚本文件
