# Product Brief: GClaw

**Date:** 2026-04-02
**Author:** GClaw Team
**Status:** MVP Completed - Phase 2 Planning
**Version:** 0.1.0

---

## 1. Executive Summary

GClaw 是一个基于 Claude Agent SDK 的企业级 AI 对话应用平台，将 Claude Code 的强大能力通过 Web UI 可视化呈现，并统一接入钉钉、飞书、微信等企业 IM 渠道。平台支持技能（Skills）扩展系统、多项目并行管理、智能体（Agents）定义，为企业业务人员提供开箱即用的 AI 助手服务。

**Key Points:**
- Problem: Claude Code CLI 能力强大但缺乏可视化界面和企业渠道接入能力
- Solution: 构建 Web UI + 多渠道 IM 接入的 AI 对话平台，支持技能扩展和多项目隔离
- Target Users: 企业业务人员（通过 IM 渠道）和平台管理员（通过 Web UI）
- Timeline: MVP 已完成，进入下一阶段功能规划

---

## 2. Problem Statement

### The Problem

Claude Code 作为命令行工具，具备强大的代码生成、文件操作和工具调用能力，但存在三个核心问题：
1. **无可视化界面** — CLI 交互方式对非技术用户有极高门槛，企业业务人员无法直接使用
2. **无渠道接入** — 无法与钉钉、飞书、微信等企业 IM 系统集成，AI 能力无法触达业务场景
3. **无技能管理** — Claude 的能力无法以模块化方式扩展、复用和分享

### Who Experiences This Problem

**Primary Users:**
- 企业业务人员 — 需要通过熟悉的 IM 工具获取 AI 辅助（合同审核、数据分析、文档处理等）
- 平台管理员 — 需要配置和监控 AI 助手的行为、技能和权限
- 技能开发者 — 需要为 AI 助手开发和部署特定业务技能

**Secondary Users:**
- 企业 IT 部门 — 负责平台部署、安全审计和集成
- 技术团队 — 通过 Web UI 直接使用 Claude 进行开发工作

### Current Situation

**How Users Currently Handle This:**
- 技术人员通过终端直接使用 Claude Code CLI
- 业务人员无法直接使用 Claude，需技术人员中转
- 不同 IM 渠道的 AI 集成各自独立开发，无统一平台

**Pain Points:**
- CLI 交互方式对非技术用户完全不可用
- 企业 IM 渠道与 Claude 之间缺乏统一的消息桥接
- 技能和提示词无法模块化管理，难以复用和迭代

### Impact & Urgency

**Impact if Unsolved:**
- Claude 的企业级应用价值被限制在技术团队内部
- 各业务线重复开发 AI 集成方案，资源浪费

**Why Now:**
- Claude Agent SDK 已发布，提供了稳定的编程接口
- 企业 AI 应用需求快速增长，先发优势重要

**Frequency:**
- 持续性需求 — 企业日常运营中高频使用

---

## 3. Target Users

### User Personas

#### Persona 1: 企业业务用户（张经理）
- **Role:** 业务部门经理
- **Goals:** 通过钉钉/飞书直接向 AI 助手提问，获取合同审核、数据分析等业务支持
- **Pain Points:** 不懂技术，无法使用 CLI 工具；需要 AI 能力融入日常工作流
- **Technical Proficiency:** 低 — 只会使用 IM 工具和浏览器
- **Usage Pattern:** 通过钉钉/飞书/微信群发消息，获取 AI 回复

#### Persona 2: 平台管理员（李工）
- **Role:** IT 部门运维工程师
- **Goals:** 配置和管理 AI 助手的技能、权限、渠道接入，监控运行状态
- **Pain Points:** 需要可视化工具管理多个项目和技能，CLI 管理效率低
- **Technical Proficiency:** 中 — 熟悉 Web 管理界面，了解基础技术概念
- **Usage Pattern:** 通过 Web UI 配置技能、管理项目、审批权限

#### Persona 3: 技能开发者（王工）
- **Role:** AI 应用开发者
- **Goals:** 开发和部署可复用的 AI 技能（如人脸认证、文档处理、搜索等）
- **Pain Points:** 缺乏统一的技能打包、分发和 Hook 机制
- **Technical Proficiency:** 高 — 熟悉 TypeScript 和 Claude SDK
- **Usage Pattern:** 编写 SKILL.md + Hook 配置，通过技能市场分发

### User Needs

**Must Have:**
- 通过 Web UI 进行流式 AI 对话，实时查看工具调用过程
- 多渠道 IM 接入（钉钉/飞书/微信），消息双向同步
- 技能的启用/禁用管理和技能市场
- 多项目隔离管理，独立上下文和配置

**Should Have:**
- 权限审批机制（危险操作需人工确认）
- 智能体（Agents）定义，配置不同的系统提示和行为
- 技能 Hook 系统（通知、脚本执行、日志记录）
- 经验积累系统（.learnings 自动学习优化）

**Nice to Have:**
- 技能市场社区（发现和安装第三方技能）
- 多用户认证和权限隔离
- 对话历史搜索和标签

---

## 4. Proposed Solution

### Solution Overview

GClaw 构建了一个三层架构的 AI 对话平台：
1. **Web UI 层** — Next.js 单页应用，提供聊天界面、项目管理、技能管理、渠道配置等可视化操作
2. **API 网关层** — Next.js API Routes，统一处理聊天流、渠道 Webhook、权限审批等请求
3. **Claude SDK 层** — 通过 Agent SDK 调用 Claude，管理进程、解析事件、执行技能 Hook

### Key Capabilities

1. **流式对话可视化**
   - Description: 通过 SSE 实时渲染 Claude 的回复，包括文本内容、工具调用过程（Read/Write/Edit/Bash 等）、思考过程
   - User Value: 用户可实时观察 AI 的操作过程，透明可审计

2. **多渠道 IM 接入**
   - Description: 统一接入钉钉、飞书、微信 ClawBot，渠道消息自动路由到 Claude 对话，回复推送到对应渠道
   - User Value: 业务人员无需切换工具，在熟悉的 IM 中直接使用 AI

3. **技能扩展系统**
   - Description: 基于 SKILL.md + _meta.json + gclaw-hooks.json 的声明式技能框架，支持技能市场安装
   - User Value: 模块化扩展 AI 能力，技能可复用、可分享、可迭代

4. **多项目隔离**
   - Description: 每个项目独立的消息历史、技能配置、智能体定义、渠道设置，支持并发流式对话
   - User Value: 不同业务场景独立管理，互不干扰

5. **权限与安全**
   - Description: PreToolUse Hook 拦截危险工具（Bash/Write/Edit），60 秒超时自动拒绝，Web UI 审批对话框
   - User Value: AI 操作在人工监督下执行，降低安全风险

### What Makes This Different

- **原生 Agent SDK 集成** — 不依赖 CLI spawn，使用 Claude Agent SDK 直接调用，更稳定、更高效
- **声明式技能框架** — SKILL.md + Hook JSON 的组合让技能开发门槛极低
- **渠道原生支持** — 不是简单桥接，而是深度集成（认证、回调、消息轮询）
- **文件系统持久化** — 零配置部署，无需数据库，适合中小规模快速上线

**Unique Value Proposition:**
GClaw 是唯一一个将 Claude Agent SDK 的完整能力（包括工具调用、权限审批、技能系统）通过 Web UI 可视化，并同时接入中国主流企业 IM（钉钉/飞书/微信）的开源平台。

### Minimum Viable Solution

**Core Features for MVP (已完成):**
- Web UI 流式对话 + 工具调用可视化
- 多项目管理 + 消息持久化
- 技能管理（启用/禁用）+ 技能市场
- 智能体（Agents）定义
- 钉钉/飞书/微信三渠道接入
- 权限审批机制
- 设置面板（模型/主题/API Key）

**Deferred to Later:**
- 多用户认证和权限隔离
- 对话历史搜索
- 技能市场社区功能
- 数据库持久化（替代文件系统）

---

## 5. Success Metrics

### Primary Metrics

**渠道消息处理量**
- Baseline: 0
- Target: 日均 100+ 条渠道消息
- Timeline: 上线后 3 个月
- Measurement: 渠道 Webhook 调用计数

**Web UI 活跃度**
- Baseline: 0
- Target: 周活跃用户 20+
- Timeline: 上线后 3 个月
- Measurement: 页面访问 + 发送消息数

**技能生态规模**
- Baseline: 16 个内置技能
- Target: 30+ 可用技能
- Timeline: 上线后 6 个月
- Measurement: 技能市场注册技能数

### Secondary Metrics

- 平均对话响应延迟 < 2 秒（首 token）
- 工具调用审批通过率 > 80%
- 用户满意度评分 > 4.0/5.0

### Success Criteria

**Must Achieve:**
- 三渠道（钉钉/飞书/微信）消息稳定收发
- Web UI 流式对话无消息丢失

**Should Achieve:**
- 技能市场有第三方技能贡献
- 支持同时 5+ 个项目并发对话

---

## 6. Market & Competition

### Market Context

**Market Size:** 中国企业 AI 助手市场快速增长，2026 年预计规模超百亿

**Market Trends:**
- 企业 IM + AI 融合成刚需（钉钉 AI 助理、飞书智能伙伴）
- Claude 在企业场景的合规性和可控性受关注
- 技能化/插件化成为 AI 平台标配

**Target Market Segment:** 使用 Claude API 的中小企业，需要将 AI 能力集成到现有 IM 工作流中

### Competitive Landscape

#### Competitor 1: 钉钉 AI 助理 / 飞书智能伙伴
- **Strengths:** 原生 IM 集成，用户基数大，无需额外部署
- **Weaknesses:** AI 能力受限于平台自有模型，不支持 Claude SDK 工具调用
- **Pricing:** 按平台订阅收费
- **Market Position:** 大型企业标配

#### Competitor 2: Dify / Coze 等低代码 AI 平台
- **Strengths:** 可视化工作流编排，模型无关，生态丰富
- **Weaknesses:** 不支持 Claude Agent SDK 的原生工具调用能力，技能系统非声明式
- **Pricing:** 免费开源 / 云服务按量付费
- **Market Position:** AI 应用开发平台

#### Competitor 3: Open WebUI / LobeChat 等开源聊天界面
- **Strengths:** 社区活跃，UI 成熟，多模型支持
- **Weaknesses:** 不支持 Agent SDK 工具调用的可视化展示，无 IM 渠道集成
- **Pricing:** 免费开源
- **Market Position:** 个人/小团队 AI 聊天工具

### Competitive Advantages

**Our Advantages:**
- Claude Agent SDK 原生集成 — 完整支持工具调用可视化、权限审批、技能系统
- 中国 IM 渠道深度集成 — 钉钉/飞书/微信原生适配
- 声明式技能框架 — 开发门槛低，Hook 机制灵活

**Gaps We Need to Close:**
- 多用户认证和权限隔离
- 生产级数据库持久化
- UI 打磨和移动端适配

---

## 7. Technical Considerations

### Technical Requirements

**Platform:** Web（Next.js 15 + React 19）+ Server-Sent Events

**Integrations Required:**
- Claude Agent SDK（`@anthropic-ai/claude-agent-sdk` v0.1.76）
- 钉钉开放平台 API（AppKey/AppSecret）
- 飞书开放平台 API（AppId/AppSecret）
- 微信 ClawBot API（BotToken）

**Technical Constraints:**
- 文件系统持久化，单实例部署，不适合高并发场景
- SSE 协议不支持二进制数据，消息大小受限
- Claude API 调用成本与 Token 消耗直接挂钩

### Scale Requirements

**Expected Usage:**
- Users: 20-50 并发用户
- Messages: 日均 500-1000 条
- Data Volume: 每个项目 500 条消息上限

**Performance Requirements:**
- SSE 首 token 延迟 < 2 秒
- 渠道 Webhook 响应 < 1 秒（异步处理）

### Security & Compliance

**Security Requirements:**
- API Key 通过环境变量传递，不硬编码
- 危险工具操作需人工审批
- 渠道认证信息安全存储

**Compliance Requirements:**
- 中国 IM 平台开发者合规要求
- 对话内容审计和追溯能力

---

## 8. Risks & Mitigation

### High Priority Risks

**Risk 1: Claude Agent SDK 版本更新导致不兼容**
- Probability: 中
- Impact: 高 — 核心对话功能中断
- Mitigation: 锁定 SDK 版本（v0.1.76），关注 SDK 更新日志，建立兼容性测试
- Owner: 技术团队

**Risk 2: IM 平台 API 政策变更**
- Probability: 中
- Impact: 高 — 渠道功能不可用
- Mitigation: 抽象渠道适配器接口（channel-service.ts），隔离各渠道实现
- Owner: 技术团队

**Risk 3: 文件系统持久化瓶颈**
- Probability: 中
- Impact: 中 — 数据量增长后性能下降
- Mitigation: 消息上限 500 条，后续迁移至数据库（SQLite/PostgreSQL）
- Owner: 技术团队

### Medium Priority Risks

- 技能生态发展缓慢，第三方贡献不足
- Claude API 成本随使用量线性增长，缺乏成本控制机制
- 多项目并发时内存占用过大

### Assumptions

**Critical Assumptions:**
- Claude Agent SDK 持续维护，API 保持稳定
- 企业用户已有钉钉/飞书/微信的开发者权限
- 初期用户规模在 50 人以内，文件系统持久化可满足

**Validation Plan:**
- 通过 MVP 阶段的实际使用验证以上假设
- 监控 SDK 版本更新和 API 变更通知

---

## 9. Dependencies

### Internal Dependencies

- Claude Agent SDK 的 `query()` 异步迭代器接口稳定
- Next.js 15 App Router 对 SSE 的支持（`ReadableStream`）
- `globalThis` 单例模式在 HMR 环境下的可靠性

### External Dependencies

- Claude API 服务可用性和响应速度
- 钉钉/飞书/微信开放平台 API 稳定性
- npm 生态包的持续维护

### Blockers

**Current Blockers:**
- 无

---

## 10. Next Steps

### Immediate Actions

1. 完成 Phase 2 规划（PRD）— 明确下一阶段功能优先级
2. 完成架构设计（Architecture）— 评估数据库迁移、多用户认证方案
3. 制定 Sprint 计划 — 拆分用户故事，确定迭代节奏

### Recommended Next Phase

进入 **Phase 2: Planning**，使用 `product-manager` 技能创建 PRD。

**Handoff To:** Product Manager

**Required Before Moving Forward:**
- 确认下一阶段的功能优先级（多用户认证 vs 数据库迁移 vs 移动端适配）
- 确认目标部署环境（自建服务器 / 云服务）
- 确认预算和人力投入

---

## Appendix

### Existing Skills Inventory

| 技能 | 说明 |
|------|------|
| agent-browser | 浏览器自动化 |
| auto-memory-manager | 自动记忆管理 |
| baidu-search | 百度搜索集成 |
| find-skills | 技能发现 |
| gclaw-api | GClaw API 集成 |
| obsidian | Obsidian 笔记集成 |
| prompt-engineering-expert | 提示词工程专家 |
| self-improving-agent | 自我改进 Agent |
| skill-creator | 技能创建工具 |
| skill-vetter | 技能审核工具 |
| summarize | 内容摘要 |
| tencent-docs | 腾讯文档集成 |
| tencent-meeting | 腾讯会议集成 |
| wechat-toolkit | 微信工具包 |

### Architecture Reference

- 设计文档: `.qoder/specs/gclaw-chat-app.md`
- 项目指引: `CLAUDE.md`
- 配置文件: `bmad/config.yaml`

---

**Document Status:** Complete
**Last Updated:** 2026-04-02
**Next Review Date:** After PRD completion
