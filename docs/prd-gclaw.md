# PRD: GClaw — AI 对话应用平台

**Date:** 2026-04-02
**Author:** GClaw Team
**Status:** Draft
**Version:** 1.0.0
**Project Level:** 2 (中等功能集)
**Based on:** `docs/product-brief-gclaw.md`, `docs/architecture-gclaw.md`

---

## 1. 产品概述

GClaw 是基于 Claude Agent SDK 的企业级 AI 对话应用平台。通过 Web UI 可视化 Claude 的完整能力（对话、工具调用、思考过程），并统一接入钉钉、飞书、微信等企业 IM 渠道。支持技能（Skills）扩展系统、多项目并行管理、智能体（Agents）定义。

### 1.1 产品愿景

让企业业务人员在熟悉的 IM 工具中直接使用 Claude 的强大能力，无需技术背景。

### 1.2 目标用户

| 用户 | 场景 | 首要需求 |
|------|------|---------|
| 企业业务人员（张经理） | 通过钉钉/飞书向 AI 提问 | 在 IM 中直接获取 AI 回复 |
| 平台管理员（李工） | Web UI 配置管理 | 可视化配置技能/渠道/权限 |
| 技能开发者（王工） | 开发部署 AI 技能 | 低门槛技能打包和分发 |

### 1.3 版本规划

| 阶段 | 范围 | 状态 |
|------|------|------|
| **v0.1 MVP** | Web UI 对话 + 多项目 + 技能 + 渠道 + 权限审批 | 已完成 |
| **v0.2 增强版** | 多用户认证 + 对话管理增强 + UI/交互/安全性优化 | 规划中 |

---

## 2. 功能需求

### 2.1 Epic 1: 流式对话系统（MVP 基线）

**Business Value:** 核心功能，将 Claude Agent SDK 的能力可视化呈现

**用户故事:**

> FR-101: MUST — 用户可通过 Web UI 发送消息，实时接收 Claude 的流式回复
> - Acceptance Criteria:
>   - 发送消息后 SSE 连接建立延迟 < 500ms
>   - 文本内容逐 token 渲染，无卡顿
>   - 支持中英文混排，Markdown 格式正确渲染
>   - 网络中断时显示错误提示，不丢失已接收内容

> FR-102: MUST — 用户可实时查看 Claude 的工具调用过程
> - Acceptance Criteria:
>   - 工具调用（Read/Write/Edit/Bash/Glob/Grep 等）以摘要卡片展示
>   - 显示工具名称、输入参数摘要、执行耗时
>   - 工具结果（成功/失败）实时更新
>   - 支持展开查看完整工具输入和输出

> FR-103: SHOULD — 用户可查看 Claude 的思考（thinking）过程
> - Acceptance Criteria:
>   - 思考内容在可折叠区域展示
>   - 默认折叠，用户可点击展开
>   - 思考过程不影响主对话内容的渲染

> FR-104: MUST — 用户可中止正在进行的查询
> - Acceptance Criteria:
>   - 点击中止按钮后查询立即停止
>   - 已接收的内容保留在对话中
>   - 中止操作不影响其他项目的查询

### 2.2 Epic 2: 多项目管理（MVP 基线）

**Business Value:** 支持不同业务场景隔离，多项目并发操作

**用户故事:**

> FR-201: MUST — 用户可创建、切换、删除项目
> - Acceptance Criteria:
>   - 项目列表显示在左侧边栏，包含项目名称和状态
>   - 活跃项目显示运行中标识（有流式查询时）
>   - 删除项目需二次确认
>   - 项目切换时状态无缝恢复（流不中断）

> FR-202: MUST — 每个项目独立管理消息、技能、智能体、渠道配置
> - Acceptance Criteria:
>   - 切换项目后只显示该项目的消息历史
>   - 技能启用/禁用按项目独立
>   - 渠道配置按项目独立
>   - 项目数据持久化在 `data/projects/{id}/` 目录

> FR-203: MUST — 支持多项目并发流式对话
> - Acceptance Criteria:
>   - 同时多个项目的查询可并行运行
>   - 切换到其他项目时，后台项目流继续运行
>   - 切回项目时从 buffer 恢复完整状态（含离线期间产生的消息）

### 2.3 Epic 3: 技能系统（MVP 基线）

**Business Value:** 模块化扩展 Claude 能力，技能可复用、可分享

**用户故事:**

> FR-301: MUST — 管理员可启用/禁用技能
> - Acceptance Criteria:
>   - 技能面板列出所有可用技能（名称、描述、版本）
>   - 开关式启用/禁用，即时生效
>   - 启用后技能自动 symlink 到项目 `.claude/skills/` 目录
>   - 禁用后 symlink 自动清理

> FR-302: MUST — 管理员可通过技能市场安装新技能
> - Acceptance Criteria:
>   - 技能市场展示可用技能列表
>   - 点击安装后技能文件下载到 `skills/` 目录
>   - 安装后自动出现在技能管理面板

> FR-303: SHOULD — 技能可声明 Hook（事件触发动作）
> - Acceptance Criteria:
>   - 通过 `gclaw-hooks.json` 声明 Hook（支持 PostToolUse/SessionStart 等事件）
>   - 支持 notify（推送通知）、script（执行脚本）、log（写日志）三种 action
>   - 支持工具名过滤和 response 正则匹配
>   - notify/script action 可返回 agentMessage 注入 Agent 上下文

> FR-304: SHOULD — 技能支持经验积累（.learnings 系统）
> - Acceptance Criteria:
>   - 技能 `.learnings/` 目录中的文件自动注入到项目 CLAUDE.md
>   - Hook log action 可追加经验到 `.learnings/` 目录
>   - 经验内容供后续 Agent 查询时参考

### 2.4 Epic 4: 渠道集成（MVP 基线）

**Business Value:** 让业务人员在熟悉的 IM 中直接使用 AI

**用户故事:**

> FR-401: MUST — 支持钉钉渠道消息接入
> - Acceptance Criteria:
>   - 配置 AppKey/AppSecret 后可接收钉钉机器人消息回调
>   - 回调签名验证通过
>   - AI 回复通过钉钉 API 推送回用户
>   - 同时通过 SSE 推送到 Web UI

> FR-402: MUST — 支持飞书渠道消息接入
> - Acceptance Criteria:
>   - 配置 AppId/AppSecret 后可接收飞书事件订阅
>   - 事件订阅验证通过
>   - AI 回复通过飞书 API 推送
>   - 同时通过 SSE 推送到 Web UI

> FR-403: MUST — 支持微信 ClawBot 渠道接入
> - Acceptance Criteria:
>   - 配置 BotToken/AccountId 后可通过消息轮询接收消息
>   - 支持登录二维码展示
>   - AI 回复通过微信 API 推送
>   - 同时通过 SSE 推送到 Web UI

> FR-404: MUST — 渠道消息处理采用统一流程
> - Acceptance Criteria:
>   - 三种渠道消息统一经过 ChannelService.handleChannelMessage()
>   - 用户消息和 AI 回复都持久化到项目 messages.json
>   - 渠道事件通过 ChannelEventBus 实时推送到 Web UI

### 2.5 Epic 5: 权限与安全（MVP 基线）

**Business Value:** AI 操作在人工监督下执行，降低安全风险

**用户故事:**

> FR-501: MUST — 危险工具操作需人工审批
> - Acceptance Criteria:
>   - Bash/Write/Edit/MultiEdit/Skill 工具触发前弹出审批对话框
>   - 对话框显示工具名称、操作描述、输入参数摘要
>   - 用户可选择"允许"或"拒绝"
>   - 60 秒无响应自动拒绝

> FR-502: MUST — 用户可通过 API 回复权限决策
> - Acceptance Criteria:
>   - POST /api/chat/permission 接受 {requestId, decision}
>   - decision 为 'allow' 或 'deny'
>   - 有效 requestId 才能被解析

> FR-503: SHOULD — 管理员可配置跳过权限审批
> - Acceptance Criteria:
>   - 项目设置中有"跳过权限审批"开关
>   - 开启后所有工具直接执行，不弹出审批对话框
>   - 默认关闭

### 2.6 Epic 6: 智能体定义（MVP 基线）

**Business Value:** 为不同场景配置不同的 AI 行为和系统提示

**用户故事:**

> FR-601: MUST — 管理员可定义智能体（Agents）
> - Acceptance Criteria:
>   - 可创建智能体（名称、系统提示词、描述）
>   - 智能体配置持久化到项目 agents.json
>   - 启用的智能体定义注入 SDK query() 的 agents 参数
>   - 支持启用/禁用

### 2.7 Epic 7: 设置管理（MVP 基线）

**Business Value:** 集中管理全局和项目级配置

**用户故事:**

> FR-701: MUST — 支持全局和项目级设置
> - Acceptance Criteria:
>   - 全局设置：API Key、API Base URL、默认模型、主题
>   - 项目设置：模型、系统提示词、工作目录、Session ID
>   - 项目设置继承全局设置，可覆盖
>   - API Key 通过环境变量传递给 SDK

---

## 3. 增量需求（v0.2）

### 3.1 Epic 8: 多用户认证

**Business Value:** 支持多用户使用平台，实现权限隔离和数据安全

**用户故事:**

> FR-801: MUST — 支持用户注册和登录
> - Acceptance Criteria:
>   - 支持用户名/密码注册
>   - 登录后生成 Session Token（JWT 或 Cookie）
>   - 未登录用户只能访问登录页
>   - 支持记住登录状态

> FR-802: MUST — 支持用户角色和权限隔离
> - Acceptance Criteria:
>   - 定义角色：管理员（admin）、普通用户（user）
>   - 管理员可管理所有项目、用户、全局设置
>   - 普通用户只能访问自己的项目
>   - 用户数据隔离：消息、项目、技能配置按用户隔离

> FR-803: SHOULD — 支持项目管理权限
> - Acceptance Criteria:
>   - 项目创建者为项目管理员
>   - 可邀请其他用户加入项目（只读/编辑权限）
>   - 项目成员列表可管理

> FR-804: COULD — 支持第三方 OAuth 登录
> - Acceptance Criteria:
>   - 支持钉钉/飞书扫码登录
>   - OAuth 回调正确处理
>   - 第三方账号与本地账号绑定

### 3.2 Epic 9: 对话管理增强

**Business Value:** 提升用户查找和管理历史对话的效率

**用户故事:**

> FR-901: MUST — 支持对话历史搜索
> - Acceptance Criteria:
>   - 搜索框支持全文检索消息内容
>   - 搜索结果高亮关键词
>   - 支持按时间范围筛选
>   - 支持按消息角色（用户/助手/系统）筛选
>   - 搜索响应时间 < 1 秒（500 条消息内）

> FR-902: SHOULD — 支持对话分支和回溯
> - Acceptance Criteria:
>   - 用户可从任意历史消息重新发送，创建分支
>   - 分支对话独立发展，不影响主线
>   - 可在分支间切换查看

> FR-903: SHOULD — 支持消息标签和收藏
> - Acceptance Criteria:
>   - 可为消息添加自定义标签
>   - 可收藏重要消息
>   - 支持按标签和收藏筛选消息

> FR-904: COULD — 支持对话导出
> - Acceptance Criteria:
>   - 支持导出为 Markdown 文件
>   - 支持导出为 JSON（含元数据）
>   - 可选择导出范围（全部 / 选中消息 / 时间范围）

### 3.3 Epic 10: UI 与交互优化

**Business Value:** 提升用户体验，降低使用门槛

**用户故事:**

> FR-1001: MUST — 响应式布局优化
> - Acceptance Criteria:
>   - 支持 1280px+ 桌面端完整布局
>   - 768px-1280px 平板端自适应布局
>   - < 768px 移动端基础可用（聊天功能完整）
>   - 侧边栏可折叠

> FR-1002: SHOULD — 消息渲染优化
> - Acceptance Criteria:
>   - 代码块语法高亮（支持常见语言）
>   - 表格渲染美观对齐
>   - 长消息虚拟滚动，不卡顿
>   - 工具调用摘要支持折叠/展开

> FR-1003: SHOULD — 快捷操作增强
> - Acceptance Criteria:
>   - 支持键盘快捷键（Enter 发送、Ctrl+C 中止）
>   - 支持拖拽文件到输入区域
>   - 支持 @ 提及智能体
>   - 支持 / 斜杠命令（清空对话、切换项目等）

> FR-1004: COULD — 对话模板
> - Acceptance Criteria:
>   - 预设常用对话模板（代码审查、文档翻译、数据分析等）
>   - 用户可自定义模板
>   - 模板可跨项目使用

### 3.4 Epic 11: 安全性优化

**Business Value:** 满足企业级安全合规要求

**用户故事:**

> FR-1101: MUST — API Key 安全存储
> - Acceptance Criteria:
>   - API Key 不在前端代码中暴露
>   - 设置面板中 API Key 显示为掩码（仅显示后4位）
>   - API Key 存储时可选择加密
>   - 日志中不输出 API Key

> FR-1102: MUST — 操作审计日志
> - Acceptance Criteria:
>   - 记录关键操作：登录、权限审批、项目创建/删除、技能安装
>   - 日志包含时间戳、操作者、操作类型、详情
>   - 审计日志不可篡改
>   - 支持查看最近 1000 条审计记录

> FR-1103: SHOULD — XSS 和注入防护
> - Acceptance Criteria:
>   - 消息内容渲染时自动转义 HTML（Markdown 安全渲染）
>   - API 输入参数校验（类型、长度、格式）
>   - SSE 事件数据 JSON 序列化防注入
>   - 文件路径操作防路径穿越

> FR-1104: COULD — 内容安全过滤
> - Acceptance Criteria:
>   - 可配置敏感词过滤规则
>   - 对话内容可配置保留/自动清理策略
>   - 支持对话内容脱敏导出

---

## 4. 非功能需求

### 4.1 性能

> NFR-001: MUST — SSE 首 token 延迟 < 2 秒
> - Measurement: 从用户发送消息到收到第一个 delta 事件的时间
> - 95th percentile < 2s

> NFR-002: MUST — 页面首次加载 < 3 秒
> - Measurement: 从输入 URL 到页面可交互的时间

> NFR-003: SHOULD — 支持 50 并发用户
> - Measurement: 同时在线用户数，每人可独立发送消息

> NFR-004: SHOULD — 消息历史加载 < 1 秒
> - Measurement: 加载 100 条历史消息的渲染时间

### 4.2 可靠性

> NFR-005: MUST — SSE 连接断开自动重连
> - Measurement: 网络波动后连接自动恢复，不丢失进行中的流

> NFR-006: MUST — 消息持久化不丢失
> - Measurement: 对话完成后消息完整写入 messages.json

> NFR-007: SHOULD — Session 失效自动恢复
> - Measurement: sessionId 过期后自动清除并重新查询

### 4.3 可维护性

> NFR-008: MUST — TypeScript strict 模式，全栈类型安全
> - Measurement: `npm run build` 无类型错误

> NFR-009: MUST — ESLint 检查通过
> - Measurement: `npm run lint` 无错误

> NFR-010: SHOULD — 代码模块化，核心模块职责单一
> - Measurement: 每个核心模块文件 < 500 行

### 4.4 安全性

> NFR-011: MUST — API Key 不暴露到前端
> - Measurement: 前端代码和浏览器 DevTools 中无完整 API Key

> NFR-012: MUST — 危险工具操作需人工审批
> - Measurement: Bash/Write/Edit/MultiEdit 工具执行前必须收到 allow 决策

> NFR-013: SHOULD — 输入参数校验
> - Measurement: 所有 API 端点对输入参数做类型和长度校验

### 4.5 可用性

> NFR-014: MUST — 中文界面
> - Measurement: 所有 UI 文本为中文

> NFR-015: SHOULD — 亮/暗模式切换
> - Measurement: 设置中可切换主题，界面即时更新

---

## 5. 需求优先级（MoSCoW）

### MVP 基线 (v0.1) — 已完成

| ID | 需求 | 优先级 | 状态 |
|----|------|--------|------|
| FR-101 | Web UI 流式对话 | MUST | Done |
| FR-102 | 工具调用可视化 | MUST | Done |
| FR-103 | Thinking 过程展示 | SHOULD | Done |
| FR-104 | 中止查询 | MUST | Done |
| FR-201 | 项目 CRUD | MUST | Done |
| FR-202 | 项目数据隔离 | MUST | Done |
| FR-203 | 多项目并发 | MUST | Done |
| FR-301 | 技能启用/禁用 | MUST | Done |
| FR-302 | 技能市场安装 | MUST | Done |
| FR-303 | 技能 Hook 系统 | SHOULD | Done |
| FR-304 | .learnings 经验系统 | SHOULD | Done |
| FR-401 | 钉钉渠道 | MUST | Done |
| FR-402 | 飞书渠道 | MUST | Done |
| FR-403 | 微信渠道 | MUST | Done |
| FR-404 | 统一渠道处理 | MUST | Done |
| FR-501 | 权限审批 | MUST | Done |
| FR-502 | 权限 API | MUST | Done |
| FR-503 | 跳过权限配置 | SHOULD | Done |
| FR-601 | 智能体定义 | MUST | Done |
| FR-701 | 全局/项目设置 | MUST | Done |

### 增量需求 (v0.2) — 规划中

| ID | 需求 | 优先级 | Sprint |
|----|------|--------|--------|
| FR-801 | 用户注册登录 | MUST | S1 |
| FR-802 | 用户角色权限隔离 | MUST | S1 |
| FR-803 | 项目权限管理 | SHOULD | S2 |
| FR-901 | 对话历史搜索 | MUST | S1 |
| FR-902 | 对话分支和回溯 | SHOULD | S2 |
| FR-903 | 消息标签和收藏 | SHOULD | S2 |
| FR-1001 | 响应式布局优化 | MUST | S1 |
| FR-1002 | 消息渲染优化 | SHOULD | S2 |
| FR-1003 | 快捷操作增强 | SHOULD | S2 |
| FR-1101 | API Key 安全存储 | MUST | S1 |
| FR-1102 | 操作审计日志 | MUST | S1 |
| FR-1103 | XSS/注入防护 | SHOULD | S2 |
| FR-804 | 第三方 OAuth | COULD | S3 |
| FR-904 | 对话导出 | COULD | S3 |
| FR-1004 | 对话模板 | COULD | S3 |
| FR-1104 | 内容安全过滤 | COULD | S3 |

---

## 6. Epic 优先级排序（RICE）

| Epic | Reach | Impact | Confidence | Effort | RICE Score |
|------|-------|--------|------------|--------|------------|
| E8: 多用户认证 | 50 | 2 | 80% | 3 | 2,667 |
| E11: 安全性优化 | 50 | 1.5 | 90% | 1.5 | 4,500 |
| E9: 对话管理增强 | 30 | 1 | 80% | 2 | 1,200 |
| E10: UI/交互优化 | 40 | 1 | 80% | 2 | 1,600 |

**优先级排序:** E11 > E8 > E10 > E9

**推荐 Sprint 分配:**
- **Sprint 1 (MUST):** 安全性优化(E11) + 用户认证(E8 核心) + 对话搜索(FR-901) + 响应式布局(FR-1001)
- **Sprint 2 (SHOULD):** 项目权限(FR-803) + 对话分支(FR-902) + 消息标签(FR-903) + 渲染优化(FR-1002) + 快捷键(FR-1003) + XSS防护(FR-1103)
- **Sprint 3 (COULD):** OAuth(FR-804) + 对话导出(FR-904) + 模板(FR-1004) + 内容过滤(FR-1104)

---

## 7. 依赖关系

### 7.1 Epic 间依赖

```
E8 (多用户认证)
  └─→ E9 (对话管理增强，搜索需跨用户数据隔离)
  └─→ E11 (安全性优化，审计日志需关联用户身份)

E11 (安全性优化)
  └─→ 无前置依赖，可独立开始

E10 (UI/交互优化)
  └─→ 无前置依赖，可独立开始
```

### 7.2 外部依赖

| 依赖 | 说明 | 影响 |
|------|------|------|
| Claude Agent SDK v0.1.76 | 核心对话能力 | SDK 版本升级可能导致接口变更 |
| 钉钉/飞书/微信 API | 渠道消息收发 | 平台 API 变更影响渠道功能 |
| Next.js 15 | 前端框架 + API Routes | 框架升级需评估兼容性 |

---

## 8. 约束与假设

### 约束

- 单实例部署（文件系统持久化，不支持水平扩展）
- 无数据库（所有数据存储在 `data/` 目录 JSON 文件中）
- SSE 单向推送（不支持 WebSocket 双向通信）
- Claude API 调用成本与 Token 消耗直接挂钩

### 假设

- 初期用户规模 < 50 人
- 每项目消息上限 500 条足够
- 企业用户已获得 IM 平台开发者权限
- Claude Agent SDK 持续维护，API 保持稳定

---

## 9. 验收标准

### v0.2 整体验收

**MUST 达成（阻塞发布）：**
- [ ] 用户可注册、登录，数据隔离正确
- [ ] 对话历史全文搜索可用
- [ ] 页面在 1280px+ 和 768px-1280px 均可用
- [ ] API Key 掩码显示，日志无泄露
- [ ] 关键操作有审计日志
- [ ] `npm run build` 和 `npm run lint` 通过

**SHOULD 达成（不阻塞发布）：**
- [ ] 消息渲染支持代码语法高亮
- [ ] 键盘快捷键可用
- [ ] XSS 防护测试通过
- [ ] 项目权限管理可用

---

## 附录 A: 术语表

| 术语 | 说明 |
|------|------|
| Skill（技能） | Claude 能力的模块化扩展，由 SKILL.md + _meta.json 定义 |
| Agent（智能体） | 预定义的 Claude 行为配置（系统提示 + 工具集） |
| Channel（渠道） | IM 消息通道（钉钉/飞书/微信） |
| StreamBuffer | 前端多项目流状态缓存（模块级 Map） |
| SSE | Server-Sent Events，服务器推送事件 |
| Hook | SDK 生命周期回调（PreToolUse/PostToolUse 等） |

## 附录 B: 需求追踪矩阵

| 业务目标 | Epic | FR IDs | NFR IDs |
|----------|------|--------|---------|
| Claude 能力可视化 | E1 流式对话 | FR-101~104 | NFR-001, 002 |
| 企业 IM 接入 | E4 渠道集成 | FR-401~404 | NFR-001, 005 |
| 多场景隔离 | E2 多项目 | FR-201~203 | NFR-003, 006 |
| 技能扩展 | E3 技能系统 | FR-301~304 | NFR-010 |
| 安全可控 | E5 权限安全 | FR-501~503 | NFR-011, 012 |
| 多用户支持 | E8 用户认证 | FR-801~804 | NFR-011, 013 |
| 历史对话管理 | E9 对话管理 | FR-901~904 | NFR-004 |
| 用户体验 | E10 UI优化 | FR-1001~1004 | NFR-002, 014, 015 |
| 安全合规 | E11 安全优化 | FR-1101~1104 | NFR-011, 012, 013 |

---

**Document Status:** Draft
**Last Updated:** 2026-04-02
**Next Step:** 架构评审 → Sprint 规划
