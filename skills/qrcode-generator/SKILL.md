---
name: qrcode-generator
description: "生成网址二维码（URL to QR Code）。支持保存到文件或返回 base64 编码。使用 Python qrcode 库实现。"
metadata: {
  "openclaw": {
    "emoji": "📱",
    "requires": {
      "bins": ["python3"]
    }
  }
}
---

# QR Code Generator

生成网址二维码的工具技能。支持两种输出模式：保存到文件或返回 base64 编码。

## Usage

```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '<JSON>'
```

## Request Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| url | str | yes | - | 要生成二维码的网址 |
| output_path | str | no | null | 输出文件路径（如指定则保存到文件） |
| size | int | no | 300 | 二维码尺寸（像素） |
| error_correction | str | no | M | 纠错级别：L(7%)、M(15%)、Q(25%)、H(30%) |
| border | int | no | 4 | 边框大小（格子数） |

## Output Modes

### 模式 1：保存到文件
指定 `output_path` 参数，二维码将保存为 PNG 文件。

```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '{
  "url": "https://example.com",
  "output_path": "/tmp/qrcode.png"
}'
```

### 模式 2：返回 base64
不指定 `output_path`，返回 base64 编码的 PNG 数据。

```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '{
  "url": "https://example.com",
  "size": 400
}'
```

## Examples

### 基础用法（base64 输出）
```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '{
  "url": "https://www.baidu.com"
}'
```

### 保存到文件
```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '{
  "url": "https://www.baidu.com",
  "output_path": "/Users/xxx/Desktop/qrcode.png"
}'
```

### 高纠错级别（适合打印）
```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '{
  "url": "https://www.baidu.com",
  "output_path": "/tmp/qrcode.png",
  "error_correction": "H",
  "size": 500
}'
```

### 自定义样式
```bash
python3 ${SKILL_DIR}/scripts/generate_qrcode.py '{
  "url": "https://www.baidu.com",
  "size": 600,
  "border": 2
}'
```

## Error Correction Levels

| Level | Error Correction | Use Case |
|-------|------------------|----------|
| L | ~7% | 清洁环境，快速扫描 |
| M | ~15% | 一般用途（默认） |
| Q | ~25% | 可能有污损 |
| H | ~30% | 打印、户外、可能部分遮挡 |

## Return Values

### 成功输出（文件模式）
```json
{
  "success": true,
  "mode": "file",
  "output_path": "/tmp/qrcode.png",
  "size": 300
}
```

### 成功输出（base64 模式）
```json
{
  "success": true,
  "mode": "base64",
  "data": "iVBORw0KGgoAAAANSUhEUgAA...",
  "size": 300,
  "data_length": 1234
}
```

### 错误输出
```json
{
  "success": false,
  "error": "错误描述"
}
```

## Dependencies

- Python 3.x
- qrcode 库（自动通过 requirements.txt 安装）

## Installation Notes

首次使用前，请安装 `qrcode` 库：
```bash
pip3 install qrcode[pil]
```

如果安装失败，请手动执行：
```bash
pip3 install qrcode[pil]
```

## Current Status

✅ 功能完整，可以使用
