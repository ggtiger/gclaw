# Bug 修复记录 - Word导出代码块框线图错位

**修复日期**: 2026-05-09  
**严重程度**: 中

## 问题描述

**现象**:
- Markdown 导出 Word 时，代码块中的框线图（用空格和字符拼出的图表）错位
- Word 中空格的渲染宽度比 Markdown 预览中短，导致对齐被破坏

**影响范围**: 
- 所有包含框线图/ASCII Art 的代码块导出 Word 后对齐失效

---

## 根因分析

**直接原因**:
- Word 渲染引擎中 Consolas 字体的空格字符宽度比字母/数字字符略窄
- Word 默认两端对齐会拉伸/压缩空格
- Word 的 `autoSpaceEastAsianText` 功能在中英文混排时自动插入额外间距

**深层原因**:
- Word 的文本渲染引擎对等宽字体的空格处理与浏览器 monospace 渲染不一致
- Consolas 虽然是等宽字体，但 Word 内部对空格有特殊的宽度处理逻辑

---

## 解决方案

### 修改文件

**文件**: `components/panels/files/editors.tsx`

### 修改 1: pushRun 函数 — 字体与空格处理

```typescript
// 修改前
lines[lines.length - 1].runs.push(new docx.TextRun({ text: parts[i], font: 'Consolas', size: 18, color }))

// 修改后
// 用 Courier New 确保空格与字符等宽，\u00A0 防止 Word 压缩连续空格
const preserved = parts[i].replace(/ /g, '\u00A0')
lines[lines.length - 1].runs.push(new docx.TextRun({
  text: preserved,
  font: { name: 'Courier New', eastAsia: 'NSimSun' },
  size: 18,
  color,
}))
```

### 修改 2: 代码块段落属性 — 禁用 Word 自动调整

```typescript
// 修改前
result.push(new docx.Paragraph({
  children: line.runs,
  shading: { fill: 'f6f8fa' },
  spacing: { before: 0, after: 0, line: 240, lineRule: docx.LineRuleType.EXACT },
}))

// 修改后
result.push(new docx.Paragraph({
  children: line.runs,
  shading: { fill: 'f6f8fa' },
  alignment: docx.AlignmentType.LEFT,
  wordWrap: false,
  autoSpaceEastAsianText: false,
  spacing: { before: 0, after: 0, line: 240, lineRule: docx.LineRuleType.EXACT },
}))
```

**原理**:

| 措施 | 作用 |
|------|------|
| `Courier New` | Word 中空格宽度最稳定的等宽字体，空格 = 字母 = 数字宽度 |
| `eastAsia: 'NSimSun'` | CJK 字符使用新宋体（等宽），保证中文占 2 个字符宽 |
| `\u00A0` (NBSP) | 不间断空格，阻止 Word 压缩/合并连续空格 |
| `alignment: LEFT` | 左对齐，防止两端对齐拉伸空格 |
| `wordWrap: false` | 禁止 Word 为换行调整字符间距 |
| `autoSpaceEastAsianText: false` | 禁止中英文之间自动插入额外间距 |

---

## 测试验证

### 测试步骤
1. 打开含有框线图代码块的 Markdown 文件
2. 点击 Word 导出按钮
3. 在 Word 中打开导出的 .docx 文件
4. 对比代码块中框线图的对齐情况

### 测试结果
✅ 框线图在 Word 中保持与 Markdown 预览一致的对齐
✅ 空格宽度与字母/数字宽度一致
✅ 中英文混排无额外间距

---

## 影响范围

**修改的文件**:
1. `components/panels/files/editors.tsx` - Markdown 编辑器的 Word 导出逻辑

---

## 经验总结

**技术要点**:
- Word 中 Consolas 的空格宽度与其他字符不一致，Courier New 更可靠
- `\u00A0` + `\u2007` (Figure Space) 等 Unicode 空格在 Word 中表现各异，NBSP + Courier New 组合最稳定
- Word 有多个隐含的自动间距调整机制，需逐一禁用

**排查过程**:
1. ❌ 尝试 `\u00A0` (NBSP) + Consolas → 仍然窄
2. ❌ 尝试 `\u2007` (Figure Space) + Consolas + `characterSpacing: 0` → 仍然窄
3. ❌ 尝试 `font: { name: 'Consolas', eastAsia: 'NSimSun' }` + characterSpacing → 仍然窄
4. ✅ **Courier New + NBSP + wordWrap:false + autoSpaceEastAsianText:false** → 完美对齐

**预防措施**:
- 代码块导出 Word 统一使用 Courier New
- 段落属性必须显式设置 `alignment: LEFT` + `wordWrap: false` + `autoSpaceEastAsianText: false`
