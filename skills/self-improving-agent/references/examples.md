# 条目格式示例

GClaw 项目中的实际条目示例。

## 经验：纠正

```markdown
## [LRN-20260401-001] correction

**Logged**: 2026-04-01T10:30:00Z
**Priority**: high
**Status**: resolved
**Area**: backend

### 摘要
JSON 配置文件编辑需保留字段间逗号

### 详情
使用 search_replace 工具编辑 JSON 配置文件时，忘记保留字段之间的逗号分隔符，
导致 JSON 解析错误。这在手动拼接 JSON 字符串时特别容易出现。

### 建议操作
编辑 JSON 文件后，确认字段间的逗号是否正确。优先使用结构化 JSON 操作而非文本替换。

### 元数据
- Source: error
- Related Files: lib/store/settings.json
- Tags: json, config, search_replace

### 解决方案
- **Resolved**: 2026-04-01T10:45:00Z
- **Notes**: 已提升为项目记忆 (common_pitfalls_experience)

---
```

## 经验：知识缺口

```markdown
## [LRN-20260401-002] knowledge_gap

**Logged**: 2026-04-01T14:22:00Z
**Priority**: medium
**Status**: promoted
**Area**: backend

### 摘要
Next.js 中全局单例必须挂载到 globalThis

### 详情
在 Next.js SSE 端点中使用全局事件总线时，HMR 热重载会导致模块重新执行，
之前通过 `const bus = new EventBus()` 创建的实例会丢失。必须使用
`globalThis.__key__ = globalThis.__key__ || new EventBus()` 模式。

### 建议操作
所有需要跨请求持久的单例，都使用 globalThis 模式。

### 元数据
- Source: error
- Related Files: lib/channels/channel-events.ts
- Tags: nextjs, hmr, singleton, globalThis

---
```

## 经验：最佳实践（已提升）

```markdown
## [LRN-20260401-003] best_practice

**Logged**: 2026-04-01T16:00:00Z
**Priority**: high
**Status**: promoted
**Area**: backend

### 摘要
符号链接创建前需彻底清理目标路径

### 详情
在技能同步中创建符号链接时，如果目标路径已存在（文件或目录），
fs.symlinkSync 会抛出 EEXIST 错误。必须先检查并清理目标路径。

### 建议操作
在 fs.symlinkSync 前，使用 fs.rmSync 清理目标路径（含 recursive + force）。

### 元数据
- Source: error
- Related Files: lib/claude/skills-dir.ts
- Tags: symlink, fs, eexist

---
```

## 错误条目

```markdown
## [ERR-20260401-A3F] next_build

**Logged**: 2026-04-01T09:15:00Z
**Priority**: medium
**Status**: resolved
**Area**: infra

### 摘要
Next.js build 间歇性报 PageNotFoundError

### 错误信息
```
[Error [PageNotFoundError]: Cannot find module for page: /api/channels]
```

### 上下文
- 命令: `npx next build`
- 文件确实存在于 app/api/channels/ 下
- .next 缓存可能损坏

### 建议修复
删除 .next 目录后重新 build: `rm -rf .next && npx next build`

### 元数据
- Reproducible: no（间歇性）
- Related Files: .next/, app/api/channels/

### 解决方案
- **Resolved**: 2026-04-01T09:20:00Z
- **Notes**: 清除 .next 缓存后 build 成功

---
```

## 功能请求条目

```markdown
## [FEAT-20260401-001] custom_background

**Logged**: 2026-04-01T16:45:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### 请求的功能
支持自定义背景图和毛玻璃效果

### 用户上下文
用户希望界面更美观，参考 genvis 项目的 HomeDashboard 组件，
支持设置背景图后自动启用毛玻璃效果。

### 复杂度评估
medium

### 建议实现
通过 CSS 变量和条件类实现毛玻璃效果，使用 localStorage 持久化背景图 URL。
无背景图时保持原样式，有背景图时启用 backdrop-filter: blur()。

### 元数据
- Frequency: first_time
- Related Features: 主题系统, useTheme hook

### 解决方案
- **Resolved**: 2026-04-01T18:00:00Z
- **Notes**: 已实现 glass/glass-heavy/glass-surface 三级毛玻璃效果

---
```
