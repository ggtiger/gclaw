import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getProjectDir } from '@/lib/store/projects'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

interface FileInfo {
  name: string
  type: 'file' | 'directory'
  size?: string
  modifiedAt?: string
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function isPathSafe(subPath: string): boolean {
  // 防止路径遍历攻击
  if (subPath.includes('..')) return false
  if (subPath.includes('\0')) return false
  // 只允许相对路径，不能以 / 开头
  if (subPath.startsWith('/')) return false
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(request.url)
  const subPath = url.searchParams.get('path') || ''

  // 安全校验
  if (!isPathSafe(subPath)) {
    return Response.json({ error: '非法路径' }, { status: 400 })
  }

  // 验证用户权限
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未授权' }, { status: 401 })
  }

  // 获取项目目录
  const projectDir = getProjectDir(id)
  if (!fs.existsSync(projectDir)) {
    return Response.json({ error: '项目不存在' }, { status: 404 })
  }

  // 构建目标目录路径
  const targetDir = subPath ? path.join(projectDir, subPath) : projectDir

  // 再次校验路径是否在项目目录内
  const resolvedTarget = path.resolve(targetDir)
  const resolvedProject = path.resolve(projectDir)
  if (!resolvedTarget.startsWith(resolvedProject)) {
    return Response.json({ error: '非法路径' }, { status: 400 })
  }

  // 检查目录是否存在
  if (!fs.existsSync(targetDir)) {
    return Response.json({ error: '目录不存在' }, { status: 404 })
  }

  try {
    const stats = fs.statSync(targetDir)
    if (!stats.isDirectory()) {
      return Response.json({ error: '不是目录' }, { status: 400 })
    }

    const entries = fs.readdirSync(targetDir)
    const files: FileInfo[] = []

    for (const name of entries) {
      // 跳过隐藏文件
      if (name.startsWith('.')) continue

      const fullPath = path.join(targetDir, name)
      try {
        const stat = fs.statSync(fullPath)
        files.push({
          name,
          type: stat.isDirectory() ? 'directory' : 'file',
          size: stat.isFile() ? formatSize(stat.size) : undefined,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        // 跳过无法访问的文件
        continue
      }
    }

    // 排序：文件夹在前，文件在后，同类型按名称排序
    files.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })

    return Response.json({ files, currentPath: subPath })
  } catch (err) {
    console.error('读取目录失败:', err)
    return Response.json({ error: '读取目录失败' }, { status: 500 })
  }
}
