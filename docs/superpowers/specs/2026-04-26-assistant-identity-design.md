# AI 助理图标与名称配置

**日期**: 2026-04-26
**状态**: 已确认

## 概述

在项目设置中支持配置 AI 助理的图标和名称，让不同项目可以有不同的助理身份。

## 需求

- 项目级设置（非全局），每个项目可独立配置
- 图标从预设 lucide 图标中选择
- 名称可自定义文本
- 设置入口在现有 ProjectSettingsPanel 中添加区域

## 设计

### 1. 类型变更

**文件**: `types/skills.ts`

`ProjectSettings` 新增两个字段：

```typescript
assistantName?: string    // AI 助理名称，默认 "AI助理"
assistantIcon?: string    // lucide 图标名，默认 "Bot"
```

### 2. 设置 UI

**文件**: `components/settings/ProjectSettingsPanel.tsx`

在面板顶部添加"助理设置"卡片区域：
- 名称文本输入框（placeholder "AI助理"）
- 图标网格选择器，预设 12 个 lucide 图标：Bot、Sparkles、Brain、Wand2、Cpu、MessageSquare、GraduationCap、Stethoscope、Code、Palette、Music、Heart
- 选中图标高亮显示

样式沿用现有 Card + CardContent 风格。

### 3. Hook

**新建文件**: `hooks/useAssistantIdentity.ts`

```typescript
function useAssistantIdentity(projectId: string | null): {
  name: string       // fallback "AI助理"
  iconName: string   // fallback "Bot"
  Icon: LucideIcon   // 解析后的 lucide 组件
}
```

通过现有 useSettings hook 读取设置，映射 iconName 到 lucide 组件。

### 4. 消费点替换

以下位置硬编码替换为 hook 返回值：
- `components/chat/MessageBubble.tsx` — 消息气泡头像图标和名称
- `components/chat/ChatPanel.tsx` — 流式输出/等待响应的头像
- `components/chat/ChatInput.tsx` — 输入区域图标（如适用）

### 5. 存储

完全复用现有机制，零新增 API：
- `lib/store/settings.ts` 的 `updateSettings()` 自动处理
- `PUT /api/settings?projectId=xxx` 已有通用更新逻辑
- 新字段不在 `GLOBAL_KEYS` 中，自动归为项目级

### 6. 不做的事

- 不新增 API 路由
- 不支持自定义图片上传
- 不修改渠道消息中的助理名称（仅 Web UI）
- 不做全局级助理设置
