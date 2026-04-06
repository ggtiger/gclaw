import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'
import { assertValidProjectId, getProjectDir } from '@/lib/store/projects'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

const IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/bmp', 'image/tiff',
])

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.m', '.sh', '.bash',
  '.zsh', '.sql', '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml',
  '.yml', '.toml', '.ini', '.cfg', '.conf', '.md', '.txt', '.csv', '.log',
  '.r', '.R', '.lua', '.pl', '.ex', '.exs', '.erl', '.hs', '.ml', '.scala',
  '.clj', '.vue', '.svelte',
])

const DOC_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.odt',
])

function classifyFile(filename: string, mimeType: string): 'image' | 'document' | 'code' | 'file' {
  if (IMAGE_TYPES.has(mimeType)) return 'image'
  const ext = path.extname(filename).toLowerCase()
  if (DOC_EXTENSIONS.has(ext)) return 'document'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return 'file'
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_')
}

/**
 * POST /api/chat/attachments
 * 上传聊天附件
 */
export async function POST(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null

    if (!file) {
      return Response.json({ error: '未提供文件' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: '缺少 projectId' }, { status: 400 })
    }

    try {
      assertValidProjectId(projectId)
    } catch {
      return Response.json({ error: '无效的 projectId' }, { status: 400 })
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return Response.json({ error: '文件大小超过限制（最大 20MB）' }, { status: 400 })
    }

    // 存储目录
    const attachDir = path.join(DATA_DIR, 'projects', projectId, 'attachments')
    if (!fs.existsSync(attachDir)) {
      fs.mkdirSync(attachDir, { recursive: true })
    }

    // 生成文件名
    const id = randomUUID()
    const safeName = sanitizeFilename(file.name)
    const savedName = `${Date.now()}_${safeName}`
    const filepath = path.join(attachDir, savedName)

    // 保存文件
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)

    const fileUrl = `/api/chat/attachments/${projectId}/${savedName}`
    const type = classifyFile(file.name, file.type)

    return Response.json({
      id,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      url: fileUrl,
      type,
    })
  } catch (err) {
    console.error('上传附件失败:', err)
    return Response.json({ error: '上传失败' }, { status: 500 })
  }
}
