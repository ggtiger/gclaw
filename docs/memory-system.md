# GClaw 记忆系统设计文档

> 版本：1.0 | 最后更新：2026-04-08

---

## 1. 概述

GClaw 记忆系统是一套基于文件系统的轻量级记忆管理框架，为 AI Agent 提供跨会话的知识积累和检索能力。系统采用仿人脑的三层记忆架构，自动从对话中提取关键信息，经过巩固提炼后注入到后续对话上下文中。

### 设计目标

- **自动记忆**：对话结束后自动提取偏好、决策、错误等关键信息，无需用户或 Agent 主动操作
- **渐进提炼**：原始对话 → 情节记忆 → 语义/程序记忆 → 总纲摘要，逐层提炼
- **跨会话持久化**：记忆写入 JSON 文件，重启不丢失
- **零依赖**：不使用向量数据库或 LLM，纯关键词 + 规则引擎实现
- **用户维度**：以用户为核心组织记忆，所有项目共享用户级偏好

---

## 2. 架构

### 2.1 三层记忆模型

```
┌─────────────────────────────────────────────────────────┐
│                    注入层 (Injection)                     │
│  overview.md → CLAUDE.md → Agent 每次会话自动加载          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  L3 程序记忆 (Procedural)    L2 语义记忆 (Semantic)       │
│  procedures.json             semantic.json               │
│  · 操作手册                  · 用户画像                    │
│  · 经验教训                  · 偏好与习惯                  │
│  · 错误解决                  · 项目知识                    │
│  · 最佳实践                  · 环境信息                    │
│                              · 实体关系                    │
│         ↑ 巩固 (Consolidation) ↑                         │
│                                                         │
│  L1 情节记忆 (Episodic)                                  │
│  episodic/{date}.json                                    │
│  · 决策 decision                                         │
│  · 偏好 preference                                       │
│  · 错误 error                                            │
│  · 发现 discovery                                        │
│  · 里程碑 milestone                                      │
│  · 操作 action                                           │
│         ↑ 自动提取 (Auto Extraction)                     │
│                                                         │
│  用户对话                                                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户发送消息
    ↓
Agent 回复（SDK query）
    ↓
对话正常结束（gotDone = true）
    ↓
autoRecordAndConsolidate()
    ├─ 1. extractEpisodicFromConversation()  ← 关键词匹配提取
    │      → writeEpisodic()                  → 写入 episodic/{date}.json
    │
    ├─ 2. runConsolidation()                  ← 规则引擎巩固
    │      → hasSimilarEntry() 去重
    │      → addSemantic() / addProcedural()  → 写入 semantic.json / procedures.json
    │      → markPromoted()                    → 标记情节点已巩固
    │      → refreshOverview()                 → 重写 overview.md
    │
    └─ 3. 下次对话
           → syncProjectClaudeMd()            → 将 overview.md 注入 CLAUDE.md
           → SDK 自动加载 CLAUDE.md            → Agent 在上下文中看到用户偏好
```

### 2.3 存储结构

```
data/
├── memory/                                    # 用户级记忆空间
│   └── {userId}/
│       ├── episodic/                          # L1 情节记忆（按天分文件）
│       │   ├── 2026-04-07.json
│       │   └── 2026-04-08.json
│       ├── semantic.json                      # L2 语义记忆
│       ├── procedures.json                    # L3 程序记忆
│       └── overview.md                        # 总纲摘要（注入 CLAUDE.md）
│
└── projects/
    └── {projectId}/
        ├── CLAUDE.md                          # 项目级系统指令（含记忆总纲）
        ├── .learnings/                        # 技能经验文件
        └── .data/
            ├── settings.json                  # 项目设置
            ├── messages.json                  # 消息历史
            └── memory/                        # 项目级记忆（预留，当前未使用）
                ├── episodic/
                ├── semantic.json
                └── procedures.json
```

---

## 3. 数据模型

### 3.1 情节记忆 (Episodic)

**文件**：`episodic/{date}.json`
**ID 格式**：`EP-YYYYMMDD-NNN`（如 `EP-20260407-001`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| timestamp | string | ISO-8601 时间戳 |
| projectId | string | 来源项目 ID |
| type | enum | `decision` \| `action` \| `error` \| `discovery` \| `preference` \| `milestone` |
| summary | string | 摘要（≤200字） |
| detail | string? | 详细描述 |
| tags | string[] | 标签 |
| source | enum | `hook`（系统提取）\| `agent`（Agent 主动）\| `user`（用户手动） |
| promotedTo | string? | 巩固后指向的语义/程序记忆 ID |

### 3.2 语义记忆 (Semantic)

**文件**：`semantic.json`
**ID 格式**：`SEM-YYYYMMDD-NNN`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| type | enum | `user_profile` \| `preference` \| `project_knowledge` \| `environment` \| `entity_relation` |
| title | string | 标题 |
| content | string | 内容 |
| scope | enum | `user`（全局）\| `project`（项目级） |
| projectId | string? | scope=project 时 |
| confidence | number | 置信度 0-1 |
| sources | array | 来源情节点（ID + 日期） |
| tags | string[] | 标签 |
| status | enum | `active` \| `superseded` \| `archived` |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |
| lastVerifiedAt | string? | 最后验证时间 |
| accessCount | number | 访问次数 |

### 3.3 程序记忆 (Procedural)

**文件**：`procedures.json`
**ID 格式**：`PROC-YYYYMMDD-NNN`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| type | enum | `runbook` \| `lesson` \| `error_resolution` \| `best_practice` |
| title | string | 标题 |
| content | string | 内容 |
| scope | enum | `user` \| `project` |
| projectId | string? | scope=project 时 |
| triggers | string[] | 触发条件关键词 |
| steps | string[]? | 操作步骤 |
| tags | string[] | 标签 |
| status | enum | `active` \| `review_needed` \| `superseded` \| `archived` |
| verification | enum | `unverified` \| `verified` \| `outdated` |
| confidence | number | 置信度 0-1 |
| sources | array | 来源情节点 |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |
| accessCount | number | 访问次数 |

---

## 4. 核心模块

### 4.1 自动提取（双层架构）

对话结束后，采用 **LLM 提取 + 正则降级** 的双层架构提取情节记忆：

#### L1：LLM 辅助提取（llm-extractor.ts）

调用轻量模型 Claude Haiku 从对话中提取结构化记忆：

- 模型：`claude-haiku-4-20250414`（最低成本）
- 输入：用户消息前 500 字 + AI 回复前 1000 字
- 输出：结构化 JSON `{type, summary, detail, tags}`
- 超时：8 秒，失败时返回 null 触发降级
- 优势：可以理解上下文语义、从 AI 回复中提取解决方案、精准判断是否值得记忆
- 成本：~$0.0001/次（约万分之一美元）

#### L2：正则降级（process-manager.ts）

当 LLM 提取失败（API Key 缺失、超时、调用异常）时，降级到关键词匹配：

| 检测类型 | 匹配规则 | 情节类型 |
|----------|----------|----------|
| 否定偏好 | `不要` `别` `禁止` + 目标 | `preference` |
| 肯定偏好 | `使用` `喜欢` `偏好` + 目标 | `preference` |
| 身份声明 | `我是` `我用` + 技术栈/职业 | `preference` |
| 技术决策 | `决定` `采用` `切换到` `迁移到` | `decision` |
| 错误报告 | `报错` `崩溃` + 自然语言上下文 | `error` |
| 通用对话 | 其他所有消息（>5字符） | `action` |

**优先级**：preference > decision > error > action，每条消息最多提取一个类型。

### 4.2 巩固引擎（consolidation.ts）

将情节记忆提炼为语义/程序记忆的规则：

| 情节类型 | 目标层级 | 目标类型 | 提升条件 |
|----------|----------|----------|----------|
| preference | 语义 | preference | 单条即提升 |
| error | 程序 | error_resolution | 单条即提升 |
| milestone | 语义 | project_knowledge | 单条即提升 |
| decision | 语义 | project_knowledge | 单条即提升 |
| discovery | 语义 | environment | 单条即提升 |

**去重机制**：巩固前用 `hasSimilarEntry()` 比较关键词重叠率，≥60% 视为重复，跳过并标记 `promotedTo = 'skipped-duplicate'`。

**标记机制**：巩固后的情节点被标记 `promotedTo` 字段（指向语义/程序记忆 ID），使用 timestamp + summary 双重匹配避免 ID 冲突导致的误标记。

### 4.3 检索引擎（retrieval.ts）

统一检索入口 `retrieve()`，支持跨层级检索，带评分排序：

**评分规则**：

| 层级 | 评分因素 |
|------|----------|
| 情节 | 时间衰减（每天 -5%）+ 标签匹配（+0.3/个）+ 类型权重（decision 1.3, milestone 1.2, preference 1.1, action 1.0, discovery 0.9, error 0.7） |
| 语义 | confidence 基础分 + 访问次数加分 + 标签匹配 + 来源数量加分 |
| 程序 | confidence 基础分 + 验证状态（verified +0.3, outdated -0.3）+ 访问次数 + 标签 + trigger 匹配 |

### 4.4 总纲生成（overview-generator.ts）

将语义/程序记忆浓缩为 Markdown 总纲：

- 默认上限：语义 20 条、程序 15 条、单条 120 字符
- 按类型分组输出（用户画像、偏好与习惯、项目知识等）
- 仅包含 `status = active` 的条目

### 4.5 注入策略（injection.ts + claude-md.ts）

CLAUDE.md 的构成：

```
CLAUDE.md = systemPrompt + 用户记忆总纲 + .learnings/ 摘要
```

各部分的作用和加载方式：

| 内容 | Token 预算 | 说明 |
|------|-----------|------|
| systemPrompt | 用户自定义 | 项目设置中的系统提示词 |
| 用户记忆总纲 | ≤800 token | 从 overview.md 读取 |
| .learnings/ 摘要 | ≤300 token | pending 状态的经验条目 |

**注入时机**：每次 `executeChat()` 调用前，`syncProjectClaudeMd()` 检查内容是否变化，仅在变化时写入。

---

## 5. ID 生成策略

ID 格式：`{PREFIX}-{YYYYMMDD}-{NNN}`

- PREFIX：`EP` / `SEM` / `PROC`
- NNN：三位序号（001-999）

**防冲突机制**：

- 维护模块级 `maxCounterCache` Map，缓存每个 prefix+date 的当前最大计数器
- 首次生成时扫描所有用户/项目目录的记忆文件，找到当天最大序号
- 后续生成递增，不重复扫描
- 进程重启后缓存丢失，下次首次生成时重新扫描

---

## 6. API 接口

### 6.1 写入记忆

```
POST /api/memory/remember
```

```json
{
  "level": "episodic | semantic | procedural",
  "userId": "string (required)",
  "projectId": "string (optional)",

  // episodic 字段
  "type": "decision | action | error | discovery | preference | milestone",
  "summary": "string",
  "detail": "string",
  "tags": ["string"],

  // semantic 字段
  "semanticType": "user_profile | preference | project_knowledge | environment | entity_relation",
  "title": "string",
  "content": "string",
  "scope": "user | project",
  "confidence": 0.0-1.0,

  // procedural 字段
  "proceduralType": "runbook | lesson | error_resolution | best_practice",
  "triggers": ["string"],
  "steps": ["string"]
}
```

### 6.2 检索记忆

```
POST /api/memory/recall
```

```json
{
  "userId": "string (required)",
  "projectId": "string (optional)",
  "query": "string",
  "level": "episodic | semantic | procedural | all",
  "scope": "user | project | all",
  "tags": ["string"],
  "limit": 10
}
```

返回带评分排序的结果集。

### 6.3 其他接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/memory/entries` | 列出条目（支持 level/scope 筛选） |
| PUT | `/api/memory/entries` | 更新条目 |
| DELETE | `/api/memory/entries` | 归档条目（status → archived） |
| POST | `/api/memory/consolidate` | 手动触发巩固 |
| GET | `/api/memory/overview` | 获取总纲（?refresh=true 强制刷新） |
| POST | `/api/memory/verify/{id}` | 标记条目为已验证 |

---

## 7. 触发时机

| 事件 | 触发逻辑 | 代码位置 |
|------|----------|----------|
| 自动提取 | 每次对话正常结束后（`gotDone && userId`） | `process-manager.ts` → `autoRecordAndConsolidate()` |
| 自动巩固 | 紧随自动提取之后 | `process-manager.ts` → `runConsolidation()` |
| 总纲刷新 | 巩固产生新记忆时 / API 更新/归档/验证条目后 | `consolidation.ts` / 各 API route |
| CLAUDE.md 注入 | 每次对话开始前（`executeChat()` 调用 `syncProjectClaudeMd()`） | `claude-md.ts` |
| Agent 提醒 | 会话结束/停止时（通过 memory-recall 技能的 gclaw-hooks.json） | SessionEnd / Stop hook |

---

## 8. 安全机制

| 机制 | 说明 |
|------|------|
| 路径遍历防护 | `assertSafeId()` 校验所有 ID 参数，仅允许 `[a-zA-Z0-9_.\-]+` |
| 无物理删除 | DELETE 操作标记 `status=archived`，数据可恢复 |
| 内容清洗 | 错误消息通过 `sanitizeForLog()` 过滤敏感信息 |
| 边界检查 | 文件写操作验证路径在项目 cwd 内（`validateToolPath()`） |

---

## 9. 模块清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `types/memory.ts` | 121 | 所有记忆相关类型定义 |
| `lib/memory/llm-extractor.ts` | ~150 | LLM 辅助提取（Haiku） |
| `lib/memory/store.ts` | ~360 | JSON 存储层：读写、ID 生成、路径计算 |
| `lib/memory/episodic-writer.ts` | 37 | 情节记忆写入接口 |
| `lib/memory/semantic-manager.ts` | 156 | 语义记忆 CRUD + 搜索 |
| `lib/memory/procedural-manager.ts` | ~156 | 程序记忆 CRUD + 搜索 |
| `lib/memory/consolidation.ts` | ~270 | 巩固引擎：情节 → 语义/程序 |
| `lib/memory/retrieval.ts` | 235 | 统一检索：评分排序 |
| `lib/memory/overview-generator.ts` | 127 | 总纲 Markdown 生成 |
| `lib/memory/injection.ts` | 32 | 总纲缓存 + 刷新 |
| `lib/claude/process-manager.ts` | ~815 | 核心调度 + 自动提取逻辑 |
| `lib/claude/claude-md.ts` | ~221 | CLAUDE.md 生成 + 注入 |
| `app/api/memory/*/route.ts` | ×6 | REST API 路由 |
| `skills/memory-recall/` | 3 文件 | Agent 记忆技能 + Hook |
| `hooks/useMemoryData.ts` | 188 | 前端记忆数据 Hook |
| `components/panels/memory/MemoryList.tsx` | 261 | 记忆面板 UI |

---

## 10. 已知局限与演进方向

### 当前局限

1. **无语义去重**：去重仅靠关键词重叠率，语义相同但用词不同的偏好（如“别用websearch”和“不用网页搜索”）可能创建重复条目
2. **action 类型不参与巩固**：通用 action 类情节记忆只保存不提炼，长期累积但无价值
3. **单轮提取**：只看当前消息，无法结合多轮对话理解隐含偏好

### 演进方向

| 方向 | 说明 |
|------|------|
| 向量化检索 | 引入嵌入模型，支持语义相似度搜索 |
| 记忆衰减 | 基于 accessCount 和时间自动降权长期未使用的记忆 |
| 主动检索 | 对话开始时根据话题自动召回相关记忆，而非仅靠总纲注入 |
| 记忆合并 | 自动识别语义相同的条目并合并，提升 confidence |
