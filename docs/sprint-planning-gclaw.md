# Sprint Planning: GClaw v0.2

**Date:** 2026-04-02
**Project:** GClaw (Level 2)
**Team Capacity:** 1 developer, 2 weeks/sprint, ~40 story points/sprint
**Based on:** `docs/prd-gclaw.md`, `docs/architecture-gclaw.md`

---

## Sprint 概览

| Sprint | 目标 | 故事数 | Story Points | 周期 |
|--------|------|--------|-------------|------|
| **S1** | 安全基线 + 用户认证 + 核心体验 | 8 | 34 pts | W1-W2 |
| **S2** | 权限精细化 + 对话增强 + 交互优化 | 7 | 32 pts | W3-W4 |
| **S3** | 高级功能（OAuth/导出/模板/过滤） | 6 | 29 pts | W5-W6 |

---

## Sprint 1: 安全基线 + 用户认证 + 核心体验

**Sprint Goal:** 建立安全基线和用户认证体系，同时优化核心 UI 体验

**Duration:** 2 周 | **Capacity:** 40 pts | **Planned:** 34 pts

### STORY-001: API Key 安全存储与掩码显示
**Epic:** E11 安全性优化 | **FR:** FR-1101 | **Points:** 3 | **Priority:** MUST

**User Story:** 作为管理员，我希望 API Key 以掩码形式显示和加密存储，以防止密钥泄露。

**Acceptance Criteria:**
- [ ] 设置面板中 API Key 输入框 type=password，仅显示后 4 位
- [ ] API Key 存储到 global.json 时可选 AES 加密
- [ ] process-manager.ts 读取 API Key 时自动解密
- [ ] console.log / console.error 中不输出完整 API Key
- [ ] 前端请求设置 API 时不返回完整 key，仅返回掩码

**Technical Notes:**
- 修改 `lib/store/settings.ts` 添加加密/解密方法
- 修改 `app/api/settings/route.ts` GET 响应脱敏
- 修改 `process-manager.ts` 读取解密

**Dependencies:** 无

---

### STORY-002: 操作审计日志系统
**Epic:** E11 安全性优化 | **FR:** FR-1102 | **Points:** 5 | **Priority:** MUST

**User Story:** 作为管理员，我希望查看平台的关键操作审计日志，以追踪和排查安全问题。

**Acceptance Criteria:**
- [ ] 创建 `data/audit-log.json` 存储审计记录
- [ ] 记录以下操作：项目创建/删除、技能安装、权限审批决策、设置变更
- [ ] 每条记录包含：timestamp、action、actor、details
- [ ] 新增 `lib/store/audit-log.ts` 审计日志写入模块
- [ ] 新增 GET `/api/audit-log` 端点（返回最近 1000 条）
- [ ] SettingsPanel 新增"审计日志"标签页查看

**Technical Notes:**
- 新增 `lib/store/audit-log.ts`
- 新增 `app/api/audit-log/route.ts`
- 在各 API Route 关键操作处调用 `addAuditLog()`

**Dependencies:** 无

---

### STORY-003: 用户注册 API
**Epic:** E8 多用户认证 | **FR:** FR-801 | **Points:** 5 | **Priority:** MUST

**User Story:** 作为新用户，我希望注册账号，以便拥有自己的独立工作空间。

**Acceptance Criteria:**
- [ ] 新增 `data/users.json` 存储用户数据
- [ ] 新增 `lib/store/users.ts` 用户数据管理模块
- [ ] 新增 POST `/api/auth/register` 端点（用户名 + 密码注册）
- [ ] 密码使用 bcrypt 加密存储
- [ ] 用户名唯一性校验（长度 3-32，字母数字下划线）
- [ ] 密码强度校验（最少 8 位）
- [ ] 第一个注册用户自动成为 admin 角色

**Technical Notes:**
- 新增 `lib/store/users.ts`
- 新增 `app/api/auth/register/route.ts`
- 密码哈希使用 Node.js `crypto.scryptSync`

**Dependencies:** 无

---

### STORY-004: 用户登录与会话管理
**Epic:** E8 多用户认证 | **FR:** FR-801 | **Points:** 5 | **Priority:** MUST

**User Story:** 作为已注册用户，我希望登录系统并保持登录状态，以便持续使用平台。

**Acceptance Criteria:**
- [ ] 新增 POST `/api/auth/login` 端点（验证用户名密码）
- [ ] 登录成功生成 JWT Token，存储在 HttpOnly Cookie
- [ ] 新增 POST `/api/auth/logout` 端点（清除 Cookie）
- [ ] 新增 GET `/api/auth/me` 端点（获取当前用户信息）
- [ ] JWT Token 有效期 7 天，支持"记住我"延长至 30 天
- [ ] 登录失败返回统一错误信息（不区分用户名/密码错误）

**Technical Notes:**
- 新增 `lib/auth/jwt.ts`（Token 生成/验证）
- 新增 `app/api/auth/login/route.ts`
- 新增 `app/api/auth/logout/route.ts`
- 新增 `app/api/auth/me/route.ts`
- 使用 `jose` 库处理 JWT（Edge Runtime 兼容）

**Dependencies:** STORY-003

---

### STORY-005: 认证中间件与路由守卫
**Epic:** E8 多用户认证 | **FR:** FR-802 | **Points:** 5 | **Priority:** MUST

**User Story:** 作为管理员，我希望未登录用户无法访问系统功能，以确保数据安全。

**Acceptance Criteria:**
- [ ] 新增 `lib/auth/middleware.ts` 认证中间件
- [ ] 未登录访问受保护路由时重定向到登录页
- [ ] `/api/auth/*` 路由不需要认证
- [ ] `/api/auth/me` 返回 401 时前端跳转登录页
- [ ] 所有数据 API 按 userId 过滤（用户只能看到自己的数据）

**Technical Notes:**
- Next.js middleware.ts 拦截路由
- 修改各 store 模块添加 userId 参数过滤
- 修改 `lib/store/projects.ts` 按 userId 过滤项目
- 修改 `lib/store/messages.ts` 确保消息按项目隔离

**Dependencies:** STORY-004

---

### STORY-006: 登录/注册页面 UI
**Epic:** E8 多用户认证 | **FR:** FR-801 | **Points:** 3 | **Priority:** MUST

**User Story:** 作为用户，我希望有美观的登录/注册界面，以便顺利完成身份认证。

**Acceptance Criteria:**
- [ ] 新增 `app/login/page.tsx` 登录页面
- [ ] 新增 `app/register/page.tsx` 注册页面
- [ ] 支持登录/注册切换
- [ ] 表单校验（必填、格式、长度）
- [ ] 错误提示友好（中文）
- [ ] 登录成功后跳转主页
- [ ] 已登录用户访问登录页自动跳转主页

**Technical Notes:**
- 新增 `components/auth/LoginForm.tsx`
- 新增 `components/auth/RegisterForm.tsx`
- Tailwind CSS 样式，与现有 UI 风格一致

**Dependencies:** STORY-004

---

### STORY-007: 对话历史全文搜索
**Epic:** E9 对话管理增强 | **FR:** FR-901 | **Points:** 3 | **Priority:** MUST

**User Story:** 作为用户，我希望搜索历史对话内容，以快速找到之前的讨论。

**Acceptance Criteria:**
- [ ] ChatPanel 顶部新增搜索栏
- [ ] 搜索支持全文检索消息 content 字段
- [ ] 搜索结果高亮关键词（黄色背景标记）
- [ ] 支持按时间范围筛选（今天/7天/30天/全部）
- [ ] 支持按角色筛选（用户/助手/系统）
- [ ] 搜索响应时间 < 1 秒（500 条消息内）
- [ ] 点击搜索结果跳转到对应消息并滚动到可见

**Technical Notes:**
- 在 `lib/store/messages.ts` 添加 `searchMessages()` 方法
- 新增 GET `/api/chat/messages/search` 端点
- 新增 `components/chat/SearchBar.tsx` 搜索组件

**Dependencies:** 无（可与 STORY-001~005 并行开发）

---

### STORY-008: 响应式布局优化
**Epic:** E10 UI 与交互优化 | **FR:** FR-1001 | **Points:** 5 | **Priority:** MUST

**User Story:** 作为用户，我希望在不同设备上都能正常使用 GClaw，以获得良好的使用体验。

**Acceptance Criteria:**
- [ ] 1280px+ 桌面端：完整三栏布局（侧栏 + 聊天 + 面板）
- [ ] 768-1280px 平板：侧栏折叠为图标模式，面板叠加显示
- [ ] < 768px 移动端：单栏布局，底部导航切换视图
- [ ] 侧边栏折叠/展开动画流畅
- [ ] 聊天输入框在所有尺寸下可用
- [ ] 毛玻璃效果在移动端降级为纯色背景

**Technical Notes:**
- 修改 `components/chat/ChatLayout.tsx` 响应式断点
- 使用 Tailwind `md:` `lg:` `xl:` 响应式工具类
- 新增 `components/chat/MobileNav.tsx` 移动端导航

**Dependencies:** 无（可与 STORY-001~007 并行开发）

---

### Sprint 1 Summary

| Story | Epic | Points | 依赖 |
|-------|------|--------|------|
| STORY-001 API Key 安全 | E11 | 3 | — |
| STORY-002 审计日志 | E11 | 5 | — |
| STORY-003 用户注册 API | E8 | 5 | — |
| STORY-004 用户登录 | E8 | 5 | STORY-003 |
| STORY-005 认证中间件 | E8 | 5 | STORY-004 |
| STORY-006 登录页 UI | E8 | 3 | STORY-004 |
| STORY-007 对话搜索 | E9 | 3 | — |
| STORY-008 响应式布局 | E10 | 5 | — |
| **Total** | | **34 pts** | |

**Critical Path:** STORY-003 → STORY-004 → STORY-005 → STORY-006

**Parallel Tracks:**
- Track A (认证): STORY-003 → 004 → 005 → 006
- Track B (安全): STORY-001, STORY-002
- Track C (体验): STORY-007, STORY-008

---

## Sprint 2: 权限精细化 + 对话增强 + 交互优化

**Sprint Goal:** 完善权限管理、对话分支和渲染体验

**Duration:** 2 周 | **Capacity:** 40 pts | **Planned:** 32 pts

### STORY-009: 项目成员权限管理
**Epic:** E8 多用户认证 | **FR:** FR-803 | **Points:** 5 | **Priority:** SHOULD

**User Story:** 作为项目管理员，我希望邀请其他用户并控制其权限，以实现团队协作。

**Acceptance Criteria:**
- [ ] 项目数据模型新增 `members[]` 字段（userId + role: owner/editor/viewer）
- [ ] 项目创建者自动成为 owner
- [ ] owner 可邀请用户（通过用户名搜索）
- [ ] owner 可修改成员角色或移除成员
- [ ] editor 可发送消息和修改设置，viewer 只能查看
- [ ] 项目成员列表面板 UI

**Dependencies:** STORY-005

---

### STORY-010: 对话分支与回溯
**Epic:** E9 对话管理增强 | **FR:** FR-902 | **Points:** 8 | **Priority:** SHOULD

**User Story:** 作为用户，我希望从任意历史消息重新发起对话，以探索不同方向。

**Acceptance Criteria:**
- [ ] 消息右键菜单新增"从此处重新开始"选项
- [ ] 创建分支时，复制当前消息到新分支，后续消息独立
- [ ] 消息列表顶部显示分支切换器（主线 / 分支1 / 分支2...）
- [ ] 分支数据持久化（每个分支独立 messages 文件或同一文件内标记）
- [ ] 最多支持 5 个分支
- [ ] 可删除分支（主线不可删除）

**Technical Notes:**
- 修改 `types/chat.ts` 新增 BranchInfo 类型
- 修改 `lib/store/messages.ts` 支持分支读写
- 新增 `components/chat/BranchSwitcher.tsx`

**Dependencies:** 无

---

### STORY-011: 消息标签和收藏
**Epic:** E9 对话管理增强 | **FR:** FR-903 | **Points:** 3 | **Priority:** SHOULD

**User Story:** 作为用户，我希望给重要消息添加标签和收藏，以便快速定位。

**Acceptance Criteria:**
- [ ] ChatMessage 类型新增 `tags: string[]` 和 `isStarred: boolean` 字段
- [ ] 消息 hover 时显示标签/收藏按钮
- [ ] 标签输入支持自动补全（已有标签）
- [ ] 聊天面板新增筛选栏（按标签/收藏筛选）
- [ ] 标签和收藏持久化到 messages.json

**Dependencies:** 无

---

### STORY-012: 消息渲染优化
**Epic:** E10 UI 与交互优化 | **FR:** FR-1002 | **Points:** 5 | **Priority:** SHOULD

**User Story:** 作为用户，我希望消息内容渲染更美观，以获得更好的阅读体验。

**Acceptance Criteria:**
- [ ] 代码块语法高亮（JS/TS/Python/Go/Java/Bash/JSON/YAML）
- [ ] 使用 `highlight.js` 或 `shiki` 实现高亮
- [ ] 代码块右上角显示语言标签和复制按钮
- [ ] Markdown 表格渲染美观（边框、对齐、斑马纹）
- [ ] 工具调用摘要卡片默认折叠，点击展开
- [ ] 超长消息（>2000 字）自动折叠，点击展开

**Technical Notes:**
- 修改 `components/chat/MarkdownRenderer.tsx` 集成高亮
- 修改 `components/chat/ToolCallSummary.tsx` 折叠逻辑

**Dependencies:** 无

---

### STORY-013: 键盘快捷键与斜杠命令
**Epic:** E10 UI 与交互优化 | **FR:** FR-1003 | **Points:** 5 | **Priority:** SHOULD

**User Story:** 作为用户，我希望使用快捷键和斜杠命令提高操作效率。

**Acceptance Criteria:**
- [ ] Enter 发送消息（Shift+Enter 换行）
- [ ] Escape 关闭对话框/面板
- [ ] Ctrl/Cmd + K 打开搜索
- [ ] 输入 `/` 触发命令面板
- [ ] 支持 `/clear` 清空对话、`/project` 切换项目、`/theme` 切换主题
- [ ] 命令面板显示可用命令列表，支持模糊搜索

**Technical Notes:**
- 新增 `hooks/useKeyboardShortcuts.ts`
- 新增 `components/chat/CommandPalette.tsx`
- 修改 `components/chat/ChatInput.tsx` 添加 `/` 触发

**Dependencies:** 无

---

### STORY-014: XSS 和注入防护
**Epic:** E11 安全性优化 | **FR:** FR-1103 | **Points:** 3 | **Priority:** SHOULD

**User Story:** 作为管理员，我希望系统对 XSS 和注入攻击有防护，以保障平台安全。

**Acceptance Criteria:**
- [ ] Markdown 渲染使用 `rehype-sanitize` 防止 XSS
- [ ] API 输入参数统一校验（类型、长度、格式）
- [ ] SSE 事件数据 JSON 序列化防注入
- [ ] 文件路径操作防路径穿越（`../` 检测）
- [ ] 用户输入的消息内容不直接渲染为 HTML

**Technical Notes:**
- 安装 `rehype-sanitize`
- 新增 `lib/validators.ts` 通用校验工具
- 修改 `components/chat/MarkdownRenderer.tsx` 添加 sanitize 插件

**Dependencies:** 无

---

### STORY-015: API 输入校验层
**Epic:** E11 安全性优化 | **FR:** FR-1103 | **Points:** 3 | **Priority:** SHOULD

**User Story:** 作为开发者，我希望所有 API 端点都有输入校验，以防止异常数据进入系统。

**Acceptance Criteria:**
- [ ] 所有 POST/PUT 端点对 body 参数做类型校验
- [ ] 字符串参数限制最大长度
- [ ] projectId 参数格式校验（防路径穿越）
- [ ] 统一错误响应格式 `{ error: string, code: string }`
- [ ] 校验失败返回 400 状态码

**Technical Notes:**
- 新增 `lib/validators.ts`
- 各 API Route 引入校验

**Dependencies:** 无

---

### Sprint 2 Summary

| Story | Epic | Points | 依赖 |
|-------|------|--------|------|
| STORY-009 项目权限 | E8 | 5 | STORY-005 |
| STORY-010 对话分支 | E9 | 8 | — |
| STORY-011 标签收藏 | E9 | 3 | — |
| STORY-012 渲染优化 | E10 | 5 | — |
| STORY-013 快捷键 | E10 | 5 | — |
| STORY-014 XSS 防护 | E11 | 3 | — |
| STORY-015 输入校验 | E11 | 3 | — |
| **Total** | | **32 pts** | |

**Parallel Tracks:**
- Track A (权限): STORY-009
- Track B (对话): STORY-010, STORY-011
- Track C (UI): STORY-012, STORY-013
- Track D (安全): STORY-014, STORY-015

---

## Sprint 3: 高级功能

**Sprint Goal:** 实现 OAuth、导出、模板等高级功能

**Duration:** 2 周 | **Capacity:** 40 pts | **Planned:** 29 pts

### STORY-016: 钉钉/飞书 OAuth 登录
**Epic:** E8 多用户认证 | **FR:** FR-804 | **Points:** 8 | **Priority:** COULD

**User Story:** 作为企业用户，我希望使用钉钉/飞书账号直接登录，无需单独注册。

**Acceptance Criteria:**
- [ ] 登录页新增"钉钉登录"和"飞书登录"按钮
- [ ] OAuth 回调处理并创建/关联本地账号
- [ ] 首次 OAuth 登录自动创建用户（角色为 user）
- [ ] OAuth 账号与本地账号可绑定（设置页）
- [ ] 渠道配置中已有的 AppKey/AppId 复用为 OAuth Client

**Dependencies:** STORY-004

---

### STORY-017: 对话导出
**Epic:** E9 对话管理增强 | **FR:** FR-904 | **Points:** 5 | **Priority:** COULD

**User Story:** 作为用户，我希望导出对话内容为 Markdown 或 JSON，以便归档和分享。

**Acceptance Criteria:**
- [ ] 聊天面板顶部新增"导出"按钮
- [ ] 支持导出为 Markdown（纯文本 + 代码块）
- [ ] 支持导出为 JSON（含消息元数据：id、role、timestamp、stats）
- [ ] 可选择导出范围（全部消息 / 选中消息 / 时间范围）
- [ ] 导出文件自动下载，文件名含项目名和日期

**Dependencies:** 无

---

### STORY-018: 对话模板系统
**Epic:** E10 UI 与交互优化 | **FR:** FR-1004 | **Points:** 8 | **Priority:** COULD

**User Story:** 作为用户，我希望使用预设模板快速发起专业对话，以提高工作效率。

**Acceptance Criteria:**
- [ ] 新增 `data/templates.json` 存储模板数据
- [ ] 预设 5 个常用模板：代码审查、文档翻译、数据分析、Bug 分析、周报生成
- [ ] 用户可创建自定义模板（名称 + 系统提示 + 首条消息模板）
- [ ] 输入框上方显示模板选择器
- [ ] 模板跨项目可用
- [ ] 管理员可在设置中管理系统模板

**Dependencies:** 无

---

### STORY-019: 内容安全过滤
**Epic:** E11 安全性优化 | **FR:** FR-1104 | **Points:** 5 | **Priority:** COULD

**User Story:** 作为管理员，我希望配置敏感词过滤和对话保留策略，以满足合规要求。

**Acceptance Criteria:**
- [ ] 全局设置新增"安全过滤"配置页
- [ ] 支持配置敏感词列表（正则表达式）
- [ ] 发送消息时检测敏感词，命中时提示用户
- [ ] 可配置对话保留策略（永久 / 30天 / 7天 / 自定义天数）
- [ ] 定时清理过期对话数据

**Dependencies:** STORY-002

---

### STORY-020: 用户管理面板
**Epic:** E8 多用户认证 | **FR:** FR-802 | **Points:** 3 | **Priority:** COULD

**User Story:** 作为管理员，我希望在 Web UI 中管理用户，以控制系统访问。

**Acceptance Criteria:**
- [ ] SettingsPanel 新增"用户管理"标签（仅 admin 可见）
- [ ] 列出所有用户（用户名、角色、注册时间、最后登录）
- [ ] admin 可修改用户角色（admin/user）
- [ ] admin 可禁用/启用用户账号
- [ ] admin 可删除用户（软删除，保留数据）

**Dependencies:** STORY-005

---

### Sprint 3 Summary

| Story | Epic | Points | 依赖 |
|-------|------|--------|------|
| STORY-016 OAuth 登录 | E8 | 8 | STORY-004 |
| STORY-017 对话导出 | E9 | 5 | — |
| STORY-018 对话模板 | E10 | 8 | — |
| STORY-019 内容过滤 | E11 | 5 | STORY-002 |
| STORY-020 用户管理面板 | E8 | 3 | STORY-005 |
| **Total** | | **29 pts** | |

---

## 依赖关系图

```
Sprint 1 (W1-W2)
├── STORY-001 API Key 安全 ───────┐
├── STORY-002 审计日志 ───────────┼──→ Sprint 3: STORY-019
├── STORY-003 用户注册 API ──┐    │
├── STORY-004 用户登录 ←─────┘    │
├── STORY-005 认证中间件 ←──── 004 │
├── STORY-006 登录页 UI ←───── 004 │
├── STORY-007 对话搜索 ───────────┘
└── STORY-008 响应式布局

Sprint 2 (W3-W4)
├── STORY-009 项目权限 ←──── S1:005
├── STORY-010 对话分支
├── STORY-011 标签收藏
├── STORY-012 渲染优化
├── STORY-013 快捷键
├── STORY-014 XSS 防护
└── STORY-015 输入校验

Sprint 3 (W5-W6)
├── STORY-016 OAuth ←──── S1:004
├── STORY-017 对话导出
├── STORY-018 对话模板
├── STORY-019 内容过滤 ←──── S1:002
└── STORY-020 用户管理 ←──── S1:005
```

---

## Story Points 分布

| Sprint | E8 认证 | E9 对话 | E10 UI | E11 安全 | Total |
|--------|---------|---------|--------|---------|-------|
| **S1** | 18 pts | 3 pts | 5 pts | 8 pts | **34 pts** |
| **S2** | 5 pts | 11 pts | 10 pts | 6 pts | **32 pts** |
| **S3** | 11 pts | 5 pts | 8 pts | 5 pts | **29 pts** |
| **Total** | 34 pts | 19 pts | 23 pts | 19 pts | **95 pts** |

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| JWT 认证与现有 SSE 不兼容 | 中 | 高 | S1 优先验证 JWT + SSE 组合可行性 |
| 响应式布局改动影响现有桌面端 | 中 | 中 | 增量修改，逐步适配断点 |
| 对话分支数据模型复杂度超预期 | 中 | 中 | 限制最多 5 个分支，简化持久化 |
| 加密存储增加启动延迟 | 低 | 低 | 懒加载解密，仅在使用时解密 |

---

**Document Status:** Complete
**Next Step:** 执行 Sprint 1，从 STORY-001 开始实现
