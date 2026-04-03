import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'
import { updateUserAvatar, clearUserAvatar, getUserAvatarUrl } from '@/lib/store/users'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'avatars')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

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
    'image/gif': '.gif',
  }
  return extMap[contentType] || '.jpg'
}

function deleteOldAvatar(avatarUrl: string | null) {
  if (!avatarUrl) return
  // avatarUrl 格式: /api/uploads/avatars/filename
  const filename = avatarUrl.split('/').pop()
  if (!filename) return
  const oldPath = path.join(UPLOADS_DIR, filename)
  if (fs.existsSync(oldPath)) {
    try {
      fs.unlinkSync(oldPath)
    } catch (err) {
      console.error('删除旧头像失败:', err)
    }
  }
}

/**
 * POST /api/users/{userId}/avatar
 * 上传头像
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  // 验证用户权限
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }
  // 只能上传自己的头像（admin 可以上传任何人的）
  if (user.userId !== userId && user.role !== 'admin') {
    return Response.json({ error: '权限不足' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: '未提供文件' }, { status: 400 })
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: '不支持的文件类型，仅支持 JPEG、PNG、WebP、GIF' }, { status: 400 })
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return Response.json({ error: '文件大小超过限制（最大 2MB）' }, { status: 400 })
    }

    // 确保上传目录存在
    ensureUploadsDir()

    // 删除旧头像
    const oldAvatarUrl = getUserAvatarUrl(userId)
    deleteOldAvatar(oldAvatarUrl)

    // 生成新文件名
    const ext = getFileExtension(file.type)
    const filename = `${userId}_${Date.now()}${ext}`
    const filepath = path.join(UPLOADS_DIR, filename)

    // 保存文件
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)

    // 更新用户记录
    const avatarUrl = `/api/uploads/avatars/${filename}`
    const updatedUser = updateUserAvatar(userId, avatarUrl)

    if (!updatedUser) {
      return Response.json({ error: '用户不存在' }, { status: 404 })
    }

    return Response.json({ success: true, avatarUrl })
  } catch (err) {
    console.error('上传头像失败:', err)
    return Response.json({ error: '上传失败' }, { status: 500 })
  }
}

/**
 * DELETE /api/users/{userId}/avatar
 * 删除头像
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  // 验证用户权限
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }
  // 只能删除自己的头像（admin 可以删除任何人的）
  if (user.userId !== userId && user.role !== 'admin') {
    return Response.json({ error: '权限不足' }, { status: 403 })
  }

  try {
    // 获取并删除旧头像文件
    const oldAvatarUrl = getUserAvatarUrl(userId)
    if (oldAvatarUrl) {
      deleteOldAvatar(oldAvatarUrl)
    }

    // 清除用户记录中的 avatarUrl
    const updatedUser = clearUserAvatar(userId)
    if (!updatedUser) {
      return Response.json({ error: '用户不存在' }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('删除头像失败:', err)
    return Response.json({ error: '删除失败' }, { status: 500 })
  }
}
