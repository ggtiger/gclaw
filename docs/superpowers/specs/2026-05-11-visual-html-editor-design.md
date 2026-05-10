# HTML 可视化编辑器设计

## 概述

在现有 `HtmlEditor` 的预览模式基础上，新增可视化编辑模式（WYSIWYG），集成 GrapeJS 实现所见即所得编辑，并支持选中元素/文字后发送到聊天会话让 AI 修改。

## 技术选型

- **GrapeJS** v0.22.16 — 开源 Web 页面可视化编辑框架
- **@grapesjs/react** v2.0.0 — 官方 React 封装，支持 React 19 + Next.js 15
- 使用自定义 UI 模式（`<Canvas/>` + 自定义 React 面板），不使用 GrapeJS 默认面板
- 通过 `dynamic(() => import(...), { ssr: false })` 按需加载

## 架构

### 模式扩展

在现有三种模式（edit / preview / split）基础上新增 `visual` 模式：

| 模式 | 布局 | 说明 |
|------|------|------|
| `edit` | CodeMirror 全宽 | 纯代码编辑（现有） |
| `preview` | iframe 全宽 | 纯预览（现有） |
| `split` | CodeMirror 50% + iframe 50% | 分栏（现有） |
| `visual` | GrapeJS 全宽 | 可视化编辑（新增） |

### 文件结构

**新增文件**：
- `components/panels/files/visual-editor.tsx` — GrapeJS 可视化编辑器组件

**修改文件**：
- `components/panels/files/editors.tsx` — `HtmlEditor` 添加 `visual` 模式和 `onSendToChat` prop

**新增依赖**：
- `grapesjs` v0.22.16
- `@grapesjs/react` v2.0.0

### 数据流

```
ChatLayout (chat.sendMessage)
  → FilePreviewContext (新增 sendToChat 回调)
    → FilesPanel (sendToChat prop)
      → HtmlEditor (onSendToChat prop)
        → VisualEditor (调用)
```

## UI 布局

```
┌─────────────────────────────────────────────┐
│ 工具栏：模式切换 | 撤销/重做 | 保存            │
├──────────────┬──────────────────────────────┤
│  属性面板     │     GrapeJS 画布              │
│  240px       │     可视化编辑区域              │
│  可折叠       │                              │
│  - 元素信息   │                              │
│  - 样式编辑   │                              │
└──────────────┴──────────────────────────────┘
```

### 工具栏

复用现有工具栏位置，新增 `visual` 模式按钮。右侧增加撤销、重做按钮（仅 visual 模式显示）。

### 属性面板

- 左侧抽屉，240px 宽，可折叠
- 选中元素时显示：标签名、class、id、样式属性（字体、颜色、大小、边距、背景）
- 不选元素时隐藏/收起
- 使用项目 CSS 变量（`var(--color-*)`）保持风格统一

### 画布与组件工具条

GrapeJS 画布内置行为：
- 点击选中元素：蓝色虚线边框 + 8 个控制点
- 拖选文字：浏览器原生文字选中

组件浮动工具条按钮：
- 保留 GrapeJS 内置：移动、复制、删除
- 新增自定义：「发送给 AI」

## 选中发送到 AI

### 交互流程

1. 用户在画布中选中元素或拖选文字
2. 浮动工具条出现，包含「发送给 AI」按钮
3. 点击按钮后：
   - 收集上下文：选中元素 HTML（`selected.toHTML()`）、CSS（`selected.getStyle()`）、文件名
   - 截断处理：选中元素 HTML 超 2000 字符时截断标记
   - 构造消息发送到当前会话（`onSendToChat(text)`）
4. AI 修改后的代码通过 DiffEditor 展示，用户确认后应用

### 消息模板

```
请修改 HTML 文件 {fileName} 中的以下内容：

选中元素：
```html
{selectedHtml}
```

当前样式：
```css
{cssText}
```

请帮我[用户描述修改需求]
```

## 数据同步

### GrapeJS ↔ 文件内容

- **加载**：组件挂载时 `editor.setComponents(fileContent)`
- **外部更新**：AI 修改后 `editor.setComponents(newContent)`
- **保存**：`editor.getHtml()` + `editor.getCss()` 合成完整 HTML → `onSave(fullHtml)`

### CSS 合成策略

```typescript
function getFullHtml(editor: Editor): string {
  const html = editor.getHtml()
  const css = editor.getCss()
  if (!css) return html
  // CSS 包裹在 <style> 标签，注入 <head> 末尾或 HTML 开头
  return injectCss(html, css)
}
```

### 模式切换内容保持

- `visual → edit/split`：`editor.getHtml()` + `editor.getCss()` → `editContent`
- `edit/split → visual`：`editContent` → `editor.setComponents()`

### AI 修改后的应用

- 整文件替换：更新 `editContent`，下次切入 visual 模式时加载
- 元素级替换：`editor.getSelected().replaceWith(newHtml)` 直接替换选中元素

## 边界情况

| 场景 | 处理方式 |
|------|---------|
| GrapeJS 加载失败 | 显示降级提示，自动切回 edit 模式 |
| 大文件（>5000 元素） | 弹出性能提示，不硬限制 |
| 含 `<script>` 的 HTML | 画布中不执行，保存时保留原始标签 |
| 外部 CSS/JS 引用 | GrapeJS 可能无法加载，保存时保留引用 |
| SVG/Canvas 等特殊元素 | 作为不可编辑组件保留，可删除/移动 |
| 选中内容超 2000 字符 | 截断并标记，不发送完整文件 |

## 不做的事情

- 不实现 GrapeJS 的组件面板（拖拽插入新元素的工具箱）— 初版通过 AI 生成来添加新元素
- 不实现响应式预览切换（桌面/平板/手机视口）
- 不实现自定义代码注入到 GrapeJS 的插件系统
