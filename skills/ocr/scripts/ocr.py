#!/usr/bin/env python3
"""
本地 OCR 识别脚本 - 基于 Tesseract
纯本地运行，不上传到任何 CDN 或云端服务

用法:
  python3 ocr.py <image_path> [--lang chi_sim+eng] [--psm 3]

参数:
  image_path  - 图片文件路径（支持 jpg/png/bmp/tiff/webp）
  --lang      - OCR 语言（默认: chi_sim+eng，中文简体+英文）
  --psm       - 页面分割模式（默认: 3，自动检测）
"""

import subprocess
import sys
import os
import json
import argparse


def check_tesseract():
    """检查 tesseract 是否可用"""
    try:
        result = subprocess.run(
            ["tesseract", "--version"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def ocr_image(image_path, lang="chi_sim+eng", psm=3):
    """
    对本地图片进行 OCR 识别

    Args:
        image_path: 图片文件路径
        lang: Tesseract 语言参数（默认 chi_sim+eng）
        psm: 页面分割模式（默认 3=自动检测）

    Returns:
        dict: {"success": bool, "text": str, "error": str|None}
    """
    # 检查文件是否存在
    if not os.path.exists(image_path):
        return {"success": False, "text": "", "error": f"文件不存在: {image_path}"}

    # 检查文件扩展名
    supported_ext = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif'}
    ext = os.path.splitext(image_path)[1].lower()
    if ext not in supported_ext:
        return {"success": False, "text": "", "error": f"不支持的文件格式: {ext}，支持: {supported_ext}"}

    # 检查 tesseract
    if not check_tesseract():
        return {"success": False, "text": "", "error": "Tesseract 未安装或不在 PATH 中。请运行: brew install tesseract tesseract-lang"}

    try:
        # 调用 tesseract 命令行
        result = subprocess.run(
            [
                "tesseract",
                image_path,
                "stdout",  # 输出到标准输出
                "-l", lang,
                "--psm", str(psm),
                "--oem", "3",  # 使用 LSTM 引擎
            ],
            capture_output=True,
            text=True,
            timeout=60
        )

        text = result.stdout.strip()

        if result.returncode != 0 and not text:
            return {
                "success": False,
                "text": "",
                "error": f"Tesseract 错误 (code {result.returncode}): {result.stderr.strip()}"
            }

        return {
            "success": True,
            "text": text,
            "error": None,
            "image_path": image_path,
            "lang": lang,
            "char_count": len(text)
        }

    except subprocess.TimeoutExpired:
        return {"success": False, "text": "", "error": "OCR 识别超时（60秒）"}
    except Exception as e:
        return {"success": False, "text": "", "error": f"未知错误: {str(e)}"}


def main():
    parser = argparse.ArgumentParser(description="本地 OCR 文字识别工具")
    parser.add_argument("image_path", help="图片文件路径")
    parser.add_argument("--lang", default="chi_sim+eng", help="OCR 语言（默认: chi_sim+eng）")
    parser.add_argument("--psm", type=int, default=3, help="页面分割模式（默认: 3）")
    parser.add_argument("--json", action="store_true", help="以 JSON 格式输出结果")

    args = parser.parse_args()

    result = ocr_image(args.image_path, args.lang, args.psm)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if result["success"]:
            print(result["text"])
        else:
            print(f"❌ 识别失败: {result['error']}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
