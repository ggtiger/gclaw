---
name: memory-recall
description: "GClaw 记忆系统操作技能。支持记忆的读取、写入、检索和巩固。发现重要事实、偏好、约束时，主动记录到记忆系统。需要回忆之前的知识或模式时，主动检索记忆。"
metadata:
---

# GClaw 记忆系统

通过 HTTP API 操作 GClaw 记忆系统，实现跨会话的知识积累和检索。

## 记忆层级

| 层级 | 说明 | 适用场景 |
|------|------|---------|
| episodic（情节） | 原始事件记录 | 决策、操作、错误、发现 |
| semantic（语义） | 提炼的知识 | 用户偏好、项目知识、环境信息 |
| procedural（程序） | 步骤和模式 | 操作手册、经验教训、错误解决 |

## API 使用指南

### 环境变量

- `$GCLAW_API_BASE` — API 基地址（已注入）
- `$GCLAW_PROJECT_ID` — 当前项目 ID（已注入）
- `$GCLAW_USER_ID` — 当前用户 ID（已注入）

### 写入记忆

```bash
curl -X POST $GCLAW_API_BASE/api/memory/remember \
  -H 'Content-Type: application/json' \
  -d '{
    "level": "episodic",
    "userId": "'$GCLAW_USER_ID'",
    "projectId": "'$GCLAW_PROJECT_ID'",
    "type": "decision",
    "summary": "用户决定使用 Next.js App Router",
    "detail": "用户明确表示倾向 App Router 而非 Pages Router",
    "tags": ["architecture", "frontend"],
    "source": "agent"
  }'
```

**episodic type 取值**：`decision` | `action` | `error` | `discovery` | `preference` | `milestone`

### 写入语义记忆

```bash
curl -X POST $GCLAW_API_BASE/api/memory/remember \
  -H 'Content-Type: application/json' \
  -d '{
    "level": "semantic",
    "userId": "'$GCLAW_USER_ID'",
    "projectId": "'$GCLAW_PROJECT_ID'",
    "semanticType": "preference",
    "title": "代码风格偏好",
    "content": "用户偏好使用 TypeScript strict 模式，函数式编程风格",
    "tags": ["coding-style"],
    "scope": "user",
    "confidence": 0.9
  }'
```

**semanticType 取值**：`user_profile` | `preference` | `project_knowledge` | `environment` | `entity_relation`

### 写入程序记忆

```bash
curl -X POST $GCLAW_API_BASE/api/memory/remember \
  -H 'Content-Type: application/json' \
  -d '{
    "level": "procedural",
    "userId": "'$GCLAW_USER_ID'",
    "projectId": "'$GCLAW_PROJECT_ID'",
    "proceduralType": "best_practice",
    "title": "WebKit input 最小宽度修复",
    "content": "flex 容器中 input 使用 flex-1 时需加 min-w-0",
    "triggers": ["flex", "input", "webkit", "宽度"],
    "steps": ["1. 检查 input 是否在 flex 容器中", "2. 添加 min-w-0 类"],
    "tags": ["css", "compatibility"],
    "scope": "user"
  }'
```

**proceduralType 取值**：`runbook` | `lesson` | `error_resolution` | `best_practice`

### 检索记忆

```bash
curl -X POST $GCLAW_API_BASE/api/memory/recall \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "'$GCLAW_USER_ID'",
    "projectId": "'$GCLAW_PROJECT_ID'",
    "query": "CSS 布局",
    "level": "all",
    "limit": 10
  }'
```

### 触发巩固

```bash
curl -X POST $GCLAW_API_BASE/api/memory/consolidate \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "'$GCLAW_USER_ID'",
    "projectId": "'$GCLAW_PROJECT_ID'"
  }'
```

### 列出记忆条目

```bash
curl "$GCLAW_API_BASE/api/memory/entries?userId=$GCLAW_USER_ID&projectId=$GCLAW_PROJECT_ID&level=all"
```

## 主动记忆原则

### 应该记录的场景

1. **用户明确表达的偏好** → semantic (preference)
2. **技术决策及其理由** → episodic (decision) → semantic (project_knowledge)
3. **遇到的错误和解决方案** → episodic (error) → procedural (error_resolution)
4. **发现的环境/工具特性** → episodic (discovery) → semantic (environment)
5. **项目里程碑** → episodic (milestone)
6. **验证有效的最佳实践** → procedural (best_practice)

### 检索记忆的场景

1. 开始新对话时，检索相关项目知识
2. 遇到类似问题时，检索之前的解决方案
3. 需要了解用户偏好时，检索偏好记忆
4. 做技术决策前，检索历史决策

### 注意事项

- `userId` 使用环境变量 `$GCLAW_USER_ID`（已自动注入）
- `scope` 为 `user` 时所有项目可见，`project` 时仅当前项目可见
- 每次写入/检索后不需要用户确认（记忆操作是低风险的）
- 摘要（summary）控制在 200 字以内，详情（detail）可以更长
