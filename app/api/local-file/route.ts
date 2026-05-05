import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

export async function GET(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未授权' }, { status: 401 })
  }

  const filePath = request.nextUrl.searchParams.get('path')
  if (!filePath) {
    return Response.json({ error: '缺少路径' }, { status: 400 })
  }

  // 仅允许绝对路径
  if (!path.isAbsolute(filePath)) {
    return Response.json({ error: '仅支持绝对路径' }, { status: 400 })
  }

  // 防路径遍历
  const resolvedPath = path.resolve(filePath)
  if (resolvedPath.includes('..')) {
    return Response.json({ error: '非法路径' }, { status: 400 })
  }

  // 仅允许图片
  const ext = resolvedPath.split('.').pop()?.toLowerCase() || ''
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return Response.json({ error: '仅支持图片文件' }, { status: 400 })
  }

  if (!fs.existsSync(resolvedPath)) {
    return Response.json({ error: '文件不存在' }, { status: 404 })
  }

  try {
    const stats = fs.statSync(resolvedPath)
    if (!stats.isFile()) {
      return Response.json({ error: '不是文件' }, { status: 400 })
    }

    const buffer = fs.readFileSync(resolvedPath)
    return new Response(buffer, {
      headers: {
        'Content-Type': MIME_MAP[ext] || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(resolvedPath))}`,
        'Content-Length': String(stats.size),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return Response.json({ error: '读取文件失败' }, { status: 500 })
  }
}
