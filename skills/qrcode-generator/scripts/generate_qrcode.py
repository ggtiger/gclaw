#!/usr/bin/env python3
"""
QR Code Generator Script
生成网址二维码，支持文件保存和 base64 输出
"""

import sys
import json
import os
import base64
import io

def generate_qrcode(params: dict) -> dict:
    """
    生成二维码

    Args:
        params: 包含 url, output_path, size, error_correction, border 等参数

    Returns:
        dict: 包含 success, mode, data/error 等字段的结果
    """
    # 参数验证
    if "url" not in params:
        return {
            "success": False,
            "error": "缺少必需参数 'url'"
        }

    url = params["url"]
    output_path = params.get("output_path")
    size = params.get("size", 300)
    error_correction = params.get("error_correction", "M")
    border = params.get("border", 4)

    # 验证纠错级别
    error_levels = {
        "L": qrcode.constants.ERROR_CORRECT_L,
        "M": qrcode.constants.ERROR_CORRECT_M,
        "Q": qrcode.constants.ERROR_CORRECT_Q,
        "H": qrcode.constants.ERROR_CORRECT_H
    }

    if error_correction not in error_levels:
        return {
            "success": False,
            "error": f"无效的纠错级别 '{error_correction}'，必须是 L, M, Q 或 H"
        }

    try:
        # 验证尺寸参数
        size = int(size)
        if size < 50 or size > 2000:
            return {
                "success": False,
                "error": "尺寸必须在 50-2000 之间"
            }
    except (ValueError, TypeError):
        return {
            "success": False,
            "error": f"无效的尺寸参数 '{size}'"
        }

    try:
        border = int(border)
        if border < 0 or border > 10:
            return {
                "success": False,
                "error": "边框必须在 0-10 之间"
            }
    except (ValueError, TypeError):
        return {
            "success": False,
            "error": f"无效的边框参数 '{border}'"
        }

    try:
        # 生成二维码
        qr = qrcode.QRCode(
            version=1,
            error_correction=error_levels[error_correction],
            box_size=10,
            border=border,
        )
        qr.add_data(url)
        qr.make(fit=True)

        # 创建图像
        img = qr.make_image(fill_color="black", back_color="white")

        # 调整尺寸
        if img.size[0] != size:
            # 计算缩放比例
            scale = size // (img.size[0] // 10) if size > img.size[0] else 1
            img = qr.make_image(fill_color="black", back_color="white")
            # 使用高质量的缩放
            img = img.resize((size, size), resample=0)

        # 根据模式输出
        if output_path:
            # 文件模式：保存到文件
            # 确保目录存在
            output_dir = os.path.dirname(output_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)

            img.save(output_path, "PNG")

            return {
                "success": True,
                "mode": "file",
                "output_path": output_path,
                "size": size
            }
        else:
            # base64 模式：返回编码数据
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            img_bytes = buffer.getvalue()
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')

            return {
                "success": True,
                "mode": "base64",
                "data": img_base64,
                "size": size,
                "data_length": len(img_base64)
            }

    except Exception as e:
        return {
            "success": False,
            "error": f"生成二维码失败: {str(e)}"
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "用法: python3 generate_qrcode.py '<JSON参数>'"
        }, ensure_ascii=False))
        sys.exit(1)

    # 解析 JSON 参数
    try:
        params = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({
            "success": False,
            "error": f"JSON 解析失败: {str(e)}"
        }, ensure_ascii=False))
        sys.exit(1)

    # 尝试导入 qrcode 库
    try:
        import qrcode
        from qrcode import constants
    except ImportError:
        print(json.dumps({
            "success": False,
            "error": "qrcode 库未安装，请执行: pip3 install qrcode[pil]"
        }, ensure_ascii=False))
        sys.exit(1)

    # 生成二维码
    result = generate_qrcode(params)

    # 输出结果
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # 根据结果设置退出码
    sys.exit(0 if result["success"] else 1)
