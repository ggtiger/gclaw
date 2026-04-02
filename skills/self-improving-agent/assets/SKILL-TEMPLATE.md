# 技能模板

从经验中提取创建技能的模板。复制并自定义使用。

---

## SKILL.md 模板

```markdown
---
name: skill-name-here
description: "简明描述技能的用途和触发条件。"
metadata:
---

# 技能名称

简要说明这个技能解决什么问题及其来源。

## 快速参考

| 场景 | 操作 |
|------|------|
| [触发条件 1] | [操作 1] |
| [触发条件 2] | [操作 2] |

## 背景

为什么这个知识很重要。防止什么问题。原始经验的上下文。

## 解决方案

### 步骤

1. 第一步（含代码或命令）
2. 第二步
3. 验证步骤

### 代码示例

\`\`\`语言
// 演示解决方案的示例代码
\`\`\`

## 常见变体

- **变体 A**：描述及处理方式
- **变体 B**：描述及处理方式

## 注意事项

- 常见错误 #1
- 常见错误 #2

## 来源

从经验条目提取。
- **经验 ID**: LRN-YYYYMMDD-XXX
- **原始分类**: correction | insight | knowledge_gap | best_practice
- **提取日期**: YYYY-MM-DD
```

---

## 最小模板

```markdown
---
name: skill-name-here
description: "技能用途和触发条件。"
metadata:
---

# 技能名称

[一句话问题描述]

## 解决方案

[直接给出解决方案，含代码/命令]

## 来源

- 经验 ID: LRN-YYYYMMDD-XXX
```

---

## 命名规范

- **技能名称**：小写字母，连字符分隔
  - 正确：`docker-m1-fixes`、`api-timeout-patterns`
  - 错误：`Docker_M1_Fixes`、`APITimeoutPatterns`

- **描述**：以动词开头，说明触发条件
  - 正确："处理 Docker 在 Apple Silicon 上的构建失败。在构建报平台不匹配时使用。"
  - 错误："Docker 相关"

---

## 提取检查清单

提取前：
- [ ] 经验已验证（状态: resolved）
- [ ] 解决方案广泛适用（非一次性）
- [ ] 内容完整（含所有必要上下文）
- [ ] 名称符合规范
- [ ] 描述简洁且有信息量
- [ ] 代码示例已测试

提取后：
- [ ] 原始经验更新为 `promoted_to_skill` 状态
- [ ] 添加 `Skill-Path: skills/skill-name`
