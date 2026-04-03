import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'backgrounds')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

function getFileExtension(contentType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  }
  return extMap[contentType] || '.jpg'
}

/**
 * POST /api/uploads/background
 * 上传背景图
 */
export async function POST(request: NextRequest) {
  // 验证用户权限
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: '未提供文件' }, { status: 400 })
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: '不支持的文件类型，仅支持 JPEG、PNG、WebP' }, { status: 400 })
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return Response.json({ error: '文件大小超过限制（最大 10MB）' }, { status: 400 })
    }

    // 确保上传目录存在
    ensureUploadsDir()

    // 生成新文件名
    const ext = getFileExtension(file.type)
    const filename = `bg_${Date.now()}${ext}`
    const filepath = path.join(UPLOADS_DIR, filename)

    // 保存文件
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)

    const url = `/api/uploads/backgrounds/${filename}`

    return Response.json({ success: true, url })
  } catch (err) {
    console.error('上传背景图失败:', err)
    return Response.json({ error: '上传失败' }, { status: 500 })
  }
}
