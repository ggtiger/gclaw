---
name: self-improvement
description: "持续改进技能：捕获错误、纠正和发现，形成经验积累。触发时机：(1) 命令或操作意外失败 (2) 用户纠正 AI ('不对...', '应该是...') (3) 用户需要不存在的功能 (4) 外部 API/工具失败 (5) 发现知识过时或错误 (6) 发现更好的实现方式。重大任务前应先回顾已有经验。"
metadata:
---

# 自我改进技能 (Self-Improvement)

在开发过程中记录错误、纠正和发现，形成可积累的经验库。高价值经验自动提升为项目记忆，供后续会话复用。

## 快速参考

| 场景 | 操作 |
|------|------|
| 命令/操作失败 | 记录到 `.learnings/ERRORS.md` |
| 用户纠正你 | 记录到 `.learnings/LEARNINGS.md`，分类 `correction` |
| 用户需要缺失功能 | 记录到 `.learnings/FEATURE_REQUESTS.md` |
| API/外部工具失败 | 记录到 `.learnings/ERRORS.md`，含集成细节 |
| 知识过时 | 记录到 `.learnings/LEARNINGS.md`，分类 `knowledge_gap` |
| 发现更好方案 | 记录到 `.learnings/LEARNINGS.md`，分类 `best_practice` |
| 相似已有条目 | 用 `**See Also**` 关联，考虑提升优先级 |
| 广泛适用的经验 | 提升为项目记忆（通过 `update_memory` 工具） |

## GClaw 集成

本技能运行在 GClaw 平台上，通过 Claude Code SDK 加载到 Agent 上下文中。

### 目录结构

```
skills/self-improving-agent/      # 技能源目录（通过 symlink 加载）
├── assets/                # 模板文件（首次运行自动复制到项目 .learnings/）
│   ├── LEARNINGS.md       # 经验日志模板
│   ├── ERRORS.md          # 错误日志模板
│   └── FEATURE_REQUESTS.md  # 功能请求模板
├── scripts/               # 辅助脚本
│   ├── activator.sh       # 任务完成后评估提醒
│   ├── error-detector.sh  # 错误检测
│   └── extract-skill.sh   # 从经验提取为新技能
├── references/            # 参考文档
│   └── examples.md        # 条目格式示例
├── gclaw-hooks.json       # GClaw 事件 Hook 声明
└── SKILL.md               # 本文件

{项目工作目录}/                    # SDK cwd（Agent 的工作目录）
├── CLAUDE.md              # 自动生成：系统提示词 + .learnings 摘要
└── .learnings/            # 项目独立的经验日志（Agent 通过相对路径访问）
    ├── LEARNINGS.md       # 纠正、知识缺口、最佳实践
    ├── ERRORS.md          # 命令失败、异常
    └── FEATURE_REQUESTS.md  # 用户请求的功能
```

> **重要**：`.learnings/` 目录位于项目工作目录根目录下（非技能源目录），每个项目独立。
> 首次会话时，模板文件从技能 `assets/` 自动复制到项目 `.learnings/`。
> Agent 直接使用相对路径 `.learnings/ERRORS.md` 等读写即可。

### 事件 Hook 系统

本技能通过 `gclaw-hooks.json` 声明需要的 GClaw 生命周期事件，实现自动触发：

| Hook 事件 | action | 行为 |
|-----------|--------|------|
| `PostToolUseFailure` | notify | Bash/Write/Edit 失败时，通知前端提醒记录错误 |
| `PostToolUse` | log | Bash 执行后，追加到 `.learnings/hook-events.log` |
| `SessionStart` | notify | 新会话开始时，提醒回顾已有经验 |
| `SessionEnd` | notify | 会话结束时，提醒评估未记录的经验 |

**Hook 声明格式**（`gclaw-hooks.json`）：

```json
{
  "version": 1,
  "hooks": {
    "PostToolUseFailure": [{
      "description": "工具执行失败时提醒记录错误",
      "filter": { "tools": ["Bash"] },
      "action": "notify",
      "message": "..."
    }]
  }
}
```

**支持的 action 类型**：
- `notify` — 推送通知到前端 UI（SSE 事件）
- `script` — 执行技能目录下的脚本（事件上下文通过 stdin 传入）
- `log` — 追加到指定日志文件

### 经验提升机制

GClaw 使用内置的记忆系统管理长期知识。当经验被证明广泛适用时，应提升为项目记忆：

| 经验类型 | 提升目标（记忆分类） | 示例 |
|----------|---------------------|------|
| 常见错误陷阱 | `common_pitfalls_experience` | "JSON 编辑需保留逗号" |
| 开发实践 | `development_practice_specification` | "符号链接创建前先清理" |
| 项目环境 | `project_environment_configuration` | "技能目录路径配置" |
| 技术栈知识 | `project_tech_stack` | "SDK 技能加载需目录映射" |
| 任务经验 | `task_summary_experience` | "SSE 流项目隔离修复总结" |
| 专家经验 | `expert_experience` | "Next.js HMR 全局单例模式" |

**提升方式：** 使用 `update_memory` 工具创建记忆条目，将经验以简洁规则的形式固化。

## 日志格式

### 经验条目

追加到 `.learnings/LEARNINGS.md`：

```markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 时间戳
**Priority**: low | medium | high | critical
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### 摘要
一句话描述学到了什么

### 详情
完整上下文：发生了什么，哪里错了，正确的是什么

### 建议操作
具体的修复或改进措施

### 元数据
- Source: conversation | error | user_feedback
- Related Files: path/to/file.ext
- Tags: tag1, tag2
- See Also: LRN-20250110-001（如关联已有条目）
- Pattern-Key: simplify.dead_code | harden.input_validation（可选，用于追踪重复模式）
- Recurrence-Count: 1（可选）

---
```

### 错误条目

追加到 `.learnings/ERRORS.md`：

```markdown
## [ERR-YYYYMMDD-XXX] skill_or_command_name

**Logged**: ISO-8601 时间戳
**Priority**: high
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### 摘要
简述失败内容

### 错误信息
```
实际错误消息或输出
```

### 上下文
- 尝试的命令/操作
- 使用的输入或参数
- 相关环境细节

### 建议修复
如果可识别，如何解决

### 元数据
- Reproducible: yes | no | unknown
- Related Files: path/to/file.ext
- See Also: ERR-20250110-001（如为重复问题）

---
```

### 功能请求条目

追加到 `.learnings/FEATURE_REQUESTS.md`：

```markdown
## [FEAT-YYYYMMDD-XXX] capability_name

**Logged**: ISO-8601 时间戳
**Priority**: medium
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### 请求的功能
用户想要做什么

### 用户上下文
为什么需要，解决什么问题

### 复杂度评估
simple | medium | complex

### 建议实现
如何构建，可以扩展什么

### 元数据
- Frequency: first_time | recurring
- Related Features: existing_feature_name

---
```

## ID 生成规则

格式：`TYPE-YYYYMMDD-XXX`
- TYPE：`LRN`（经验）、`ERR`（错误）、`FEAT`（功能请求）
- YYYYMMDD：当前日期
- XXX：顺序编号或随机 3 字符（如 `001`、`A7B`）

示例：`LRN-20250115-001`、`ERR-20250115-A3F`、`FEAT-20250115-002`

## 条目解决

问题修复后，更新条目：

1. 将 `**Status**: pending` 改为 `**Status**: resolved`
2. 在元数据后添加：

```markdown
### 解决方案
- **Resolved**: 2025-01-16T09:00:00Z
- **Notes**: 简述做了什么
```

其他状态值：
- `in_progress` — 正在处理
- `wont_fix` — 决定不修复（在解决方案中说明原因）
- `promoted` — 已提升为项目记忆

## 提升为项目记忆

当经验广泛适用（不是一次性修复），提升为永久记忆。

### 何时提升

- 经验适用于多个文件/功能
- 所有贡献者（人类或 AI）都应知道的知识
- 防止重复犯错
- 记录项目特有的约定

### 如何提升

1. **提炼** 经验为简洁的规则或事实
2. **使用 `update_memory` 工具** 创建记忆，选择合适的分类
3. **更新** 原始条目：`**Status**: promoted`

### 提升示例

**经验**（详细）：
> 项目使用 Next.js。在 SSE 端点中使用全局变量时，HMR 会导致实例丢失。
> 必须使用 globalThis 模式保持单例。

**提升为记忆**（简洁）：
```
分类: expert_experience
标题: Next.js HMR 全局单例模式
内容: 在 Next.js 中使用全局单例（如事件总线），必须挂载到 globalThis 上，
防止 HMR 热重载导致实例丢失。
```

## 重复模式检测

如果记录了与已有条目相似的内容：

1. **先搜索**：`grep -r "关键词" .learnings/`
2. **关联条目**：在元数据中添加 `**See Also**: ERR-20250110-001`
3. **提升优先级** 如果问题反复出现
4. **考虑系统性修复**：重复问题通常意味着：
   - 缺少文档（→ 提升为项目记忆）
   - 缺少自动化（→ 创建脚本或工具）
   - 架构问题（→ 创建技术债务条目）

## 周期性回顾

在自然断点处回顾 `.learnings/`：

### 何时回顾
- 开始新的重大任务前
- 完成功能后
- 在有历史经验的领域工作时

### 快速状态检查
```bash
# 统计待处理条目（在项目工作目录下执行）
grep -h "Status\*\*: pending" .learnings/*.md | wc -l

# 列出高优先级待处理条目
grep -B5 "Priority\*\*: high" .learnings/*.md | grep "^## \["
```

## 检测触发器

遇到以下情况时自动记录：

**纠正**（→ 经验，分类 `correction`）：
- "不对，不是这样..."
- "应该是..."
- "你搞错了..."
- "这个过时了..."

**功能请求**（→ 功能请求条目）：
- "能不能..."
- "有没有办法..."
- "为什么不能..."

**知识缺口**（→ 经验，分类 `knowledge_gap`）：
- 用户提供了你不知道的信息
- 参考的文档已过时
- API 行为与理解不符

**错误**（→ 错误条目）：
- 命令返回非零退出码
- 异常或堆栈跟踪
- 意外输出或行为
- 超时或连接失败

## 优先级指南

| 优先级 | 使用场景 |
|--------|----------|
| `critical` | 阻断核心功能、数据丢失风险、安全问题 |
| `high` | 重大影响、影响常见工作流、重复出现 |
| `medium` | 中等影响、有变通方案 |
| `low` | 轻微不便、边界情况 |

## 区域标签

| 区域 | 范围 |
|------|------|
| `frontend` | UI、组件、客户端代码 |
| `backend` | API、服务、服务端代码 |
| `infra` | CI/CD、部署、Docker、云服务 |
| `tests` | 测试文件、测试工具 |
| `docs` | 文档、注释 |
| `config` | 配置文件、环境、设置 |

## 最佳实践

1. **立即记录** — 问题发生后上下文最完整
2. **要具体** — 未来的 Agent 需要快速理解
3. **包含复现步骤** — 特别是错误
4. **关联文件** — 方便修复
5. **建议具体修复** — 不要只写 "调查"
6. **使用一致分类** — 便于过滤
7. **积极提升** — 有疑问就提升为项目记忆
8. **定期回顾** — 过时的经验会失去价值

## 技能提取

当一个经验足够有价值，可以提取为独立的可复用技能：

### 提取条件

| 条件 | 说明 |
|------|------|
| **重复** | 有 2+ 个 `See Also` 关联 |
| **已验证** | 状态为 `resolved`，修复可用 |
| **非显而易见** | 需要实际调试/调查才能发现 |
| **广泛适用** | 不是项目特定的，跨项目有用 |
| **用户标记** | 用户说 "保存为技能" 等 |

### 提取方法

```bash
./skills/self-improving-agent/scripts/extract-skill.sh skill-name --dry-run
./skills/self-improving-agent/scripts/extract-skill.sh skill-name
```
