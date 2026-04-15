---
name: ocr
description: 本地 OCR 文字识别工具，基于 Tesseract 引擎，纯离线运行，不上传任何云端服务。支持中英文混合识别。
version: 1.0.0
author: Wang Hu
triggers:
  - 识别图片文字
  - OCR
  - 图片文字提取
  - 本地OCR
  - 提取文字
---

# 本地 OCR 文字识别工具

## 功能说明

基于 Tesseract OCR 引擎的本地文字识别技能。**完全离线运行**，不需要将图片上传到任何 CDN 或云服务。

## 使用方法

当用户发送图片并要求识别文字时，使用以下命令：

```bash
python3 ${SKILL_DIR}/scripts/ocr.py '<image_path>'
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| image_path | 图片文件本地路径（必填） | - |
| --lang | OCR 语言 | chi_sim+eng（中文简体+英文） |
| --psm | 页面分割模式 | 3（自动检测） |
| --json | JSON 格式输出 | false |

### 页面分割模式 (PSM)

| PSM | 说明 | 适用场景 |
|-----|------|----------|
| 3 | 自动检测（默认） | 通用场景 |
| 4 | 单列文本 | 文档截图 |
| 6 | 统一文本块 | 纯文本图片 |
| 7 | 单行文本 | 标题、标签 |
| 11 | 稀疏文本 | 海报、广告 |
| 13 | 单行原始文本 | 条形码、编号 |

### 使用示例

```bash
# 基本用法 - 中英文混合识别
python3 ${SKILL_DIR}/scripts/ocr.py '/path/to/image.jpg'

# 仅中文识别
python3 ${SKILL_DIR}/scripts/ocr.py '/path/to/image.png' --lang chi_sim

# 仅英文识别
python3 ${SKILL_DIR}/scripts/ocr.py '/path/to/image.png' --lang eng

# 单行文本模式
python3 ${SKILL_DIR}/scripts/ocr.py '/path/to/image.png' --psm 7

# JSON 格式输出
python3 ${SKILL_DIR}/scripts/ocr.py '/path/to/image.png' --json
```

## 工作流程

1. 用户通过渠道（微信/钉钉/飞书等）发送图片
2. 系统自动将图片保存到 `attachments/` 目录
3. 从消息中获取图片本地路径
4. 调用本脚本进行 OCR 识别
5. 返回识别出的文字内容

## 支持的图片格式

- JPG / JPEG
- PNG
- BMP
- TIFF
- WebP
- GIF

## 依赖

- **Tesseract OCR** 5.x+（需预装）
  - macOS: `brew install tesseract tesseract-lang`
  - Ubuntu: `sudo apt install tesseract-ocr tesseract-ocr-chi-sim`
- **Python 3** （无需额外 pip 包）

## 注意事项

- 纯本地运行，**不上传 CDN**，保护隐私
- 中文识别准确率约 85-90%，英文更高
- 复杂排版、手写体、艺术字识别效果可能不佳
- 图片分辨率越高，识别效果越好（建议 ≥ 300 DPI）
