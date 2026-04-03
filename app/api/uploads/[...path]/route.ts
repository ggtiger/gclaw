import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')

// 支持的图片类型
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/**
 * GET /api/uploads/avatars/{filename}
 * GET /api/uploads/backgrounds/{filename}
 * 静态文件服务
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params

  // 构建相对路径
  const filePath = pathSegments.join('/')

  // 安全校验：防止路径遍历攻击
  if (filePath.includes('..') || filePath.includes('\0')) {
    return new Response('Forbidden', { status: 403 })
  }

  // 只允许特定目录
  if (!filePath.startsWith('avatars/') && !filePath.startsWith('backgrounds/')) {
    return new Response('Forbidden', { status: 403 })
  }

  // 构建完整路径
  const fullPath = path.join(UPLOADS_DIR, filePath)

  // 验证路径是否在允许的目录内
  const resolvedPath = path.resolve(fullPath)
  const resolvedUploads = path.resolve(UPLOADS_DIR)
  if (!resolvedPath.startsWith(resolvedUploads)) {
    return new Response('Forbidden', { status: 403 })
  }

  // 检查文件是否存在
  if (!fs.existsSync(fullPath)) {
    return new Response('Not Found', { status: 404 })
  }

  // 获取文件扩展名
  const ext = path.extname(fullPath).toLowerCase()
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

  try {
    const file = fs.readFileSync(fullPath)
    return new Response(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch (err) {
    console.error('读取文件失败:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
