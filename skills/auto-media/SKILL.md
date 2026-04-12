---
name: auto-media
description: "全自动自媒体运营系统。一键扫描热点、AI生成文案、多平台自动发布。支持微博、抖音、百度热点抓取，小红书/视频号自动发布。"
metadata: {
  "openclaw": {
    "emoji": "📱",
    "requires": {
      "bins": ["node"]
    }
  }
}
---

# 🚀 Auto Media - 全自动自媒体运营系统

一键实现"热点发现→AI文案→自动发布"的全流程自动化。

## 核心功能

- 🔥 **热点自动扫描**：从微博/抖音/百度风云榜抓取实时热点
- ✍️ **AI文案生成**：基于Claude API生成3种平台适配文案
- 📤 **多平台发布**：小红书/抖音/视频号自动发布
- ⏰ **定时任务**：每日3次自动扫描发布(9点/12点/18点)

## 使用方式

### 1. 手动触发热点扫描

```bash
node ${SKILL_DIR}/scripts/scan-topics.js
```

### 2. 生成热点文案

```bash
node ${SKILL_DIR}/scripts/generate-content.js
```

### 3. 自动发布到平台

```bash
node ${SKILL_DIR}/scripts/auto-publish.js '{"platform":"xiaohongshu","topic_id":"xxx"}'
```

### 4. 一键全流程

```bash
node ${SKILL_DIR}/scripts/auto-publish.js '{"mode":"full"}'
```

## 定时任务配置

技能会自动注册以下定时任务:

| 任务名称 | Cron表达式 | 说明 |
|---------|-----------|------|
| 热点早报 | 0 9 * * * | 每天9点扫描+生成+发布 |
| 午间热点 | 0 12 * * * | 每天12点扫描+生成+发布 |
| 晚间热点 | 0 18 * * * | 每天18点扫描+生成+发布 |

## 配置文件

### data/hot-topics.json

热点缓存文件,格式如下:
```json
{
  "updateTime": "2026-04-12T09:00:00.000Z",
  "topics": [
    {
      "id": "topic_001",
      "title": "某热点标题",
      "source": "weibo",
      "heat": 1000000,
      "url": "https://...",
      "content": "热点详情摘要",
      "tags": ["标签1", "标签2"],
      "createdAt": "2026-04-12T08:55:00.000Z"
    }
  ]
}
```

## 数据流

```
[定时任务触发]
    ↓
[scan-topics.js] 抓取微博/抖音/百度热点
    ↓
[data/hot-topics.json] 缓存热点数据
    ↓
[generate-content.js] Claude API生成3种文案
    ↓
[auto-publish.js] 发布到小红书/抖音/视频号
    ↓
[完成] 记录发布日志
```

## 依赖说明

- Node.js 18+ (内置)
- fetch API (内置)
- Claude API (通过 GClaw SDK)
- 平台发布API (需要配置Cookie/Token)

## 费用估算

- Claude API: ~¥100/月 (每天生成9条文案)
- 平台API: 免费
- 图床: ¥10/月 (可选)
- **总计**: ~¥110/月

## 当前状态

✅ 热点扫描脚本完成
⏳ 文案生成脚本开发中
⏳ 发布脚本待开发
