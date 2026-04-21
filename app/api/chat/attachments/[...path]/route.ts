import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.xml': 'text/xml',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.bin': 'application/octet-stream',
}

/**
 * GET /api/chat/attachments/{projectId}/{filename}
 * 附件文件服务（catch-all 路由）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params

    if (segments.length < 2) {
      return new Response('Bad Request', { status: 400 })
    }

    const projectId = segments[0]
    const filename = segments.slice(1).join('/')

    if (filename.includes('..') || filename.includes('\0') || projectId.includes('..')) {
      return new Response('Forbidden', { status: 403 })
    }

    const attachDir = path.join(DATA_DIR, 'projects', projectId, 'attachments')
    const fullPath = path.join(attachDir, filename)

    const resolvedPath = path.resolve(fullPath)
    const resolvedDir = path.resolve(attachDir)
    if (!resolvedPath.startsWith(resolvedDir)) {
      return new Response('Forbidden', { status: 403 })
    }

    if (!fs.existsSync(resolvedPath)) {
      return new Response('Not Found', { status: 404 })
    }

    const ext = path.extname(resolvedPath).toLowerCase()
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'
    const file = fs.readFileSync(resolvedPath)

    return new Response(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch (err) {
    console.error('读取附件失败:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
