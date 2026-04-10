import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/auth/helpers'

const SKILLS_DIR = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: '未选择文件' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: '文件大小不能超过 10MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // 校验 zip 魔数
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
      return Response.json({ error: '仅支持 zip 格式文件' }, { status: 400 })
    }

    // 解压到临时目录获取技能名
    const os = await import('os')
    const tmpDir = path.join(os.tmpdir(), `gclaw-upload-${Date.now()}`)
    fs.mkdirSync(tmpDir, { recursive: true })

    const tmpZip = path.join(os.tmpdir(), `gclaw-upload-${Date.now()}.zip`)
    fs.writeFileSync(tmpZip, buffer)

    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      await execAsync(`unzip -o "${tmpZip}" -d "${tmpDir}"`, { timeout: 30000 })
    } finally {
      try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }
    }

    // 确定技能名：读取解压后目录结构
    let entries = fs.readdirSync(tmpDir)
    let skillSourceDir = tmpDir
    let skillName: string

    if (entries.length === 1 && fs.statSync(path.join(tmpDir, entries[0])).isDirectory()) {
      skillName = entries[0]
      skillSourceDir = path.join(tmpDir, entries[0])
    } else {
      // 从 SKILL.md 或 _meta.json 获取名称
      const hasSkillMd = entries.includes('SKILL.md')
      const hasMeta = entries.includes('_meta.json')
      if (!hasSkillMd && !hasMeta) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        return Response.json({ error: '无效的技能包：缺少 SKILL.md 或 _meta.json' }, { status: 400 })
      }
      // 使用 zip 文件名作为技能名
      skillName = path.basename(file.name, '.zip')
    }

    // 校验技能名
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(skillName)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return Response.json({ error: `无效的技能名称: "${skillName}"` }, { status: 400 })
    }

    // 安装到 skills/ 目录
    const targetDir = path.join(SKILLS_DIR, skillName)
    fs.mkdirSync(SKILLS_DIR, { recursive: true })

    // 备份已有版本
    const bakDir = targetDir + '.bak'
    if (fs.existsSync(targetDir)) {
      if (fs.existsSync(bakDir)) fs.rmSync(bakDir, { recursive: true, force: true })
      fs.renameSync(targetDir, bakDir)
    }

    try {
      // 复制文件
      fs.cpSync(skillSourceDir, targetDir, { recursive: true })

      // 安全校验：验证路径无 zip slip
      const resolvedTarget = path.resolve(targetDir)
      validateExtractedPaths(targetDir, resolvedTarget)

      // 成功，删除备份和临时目录
      try { fs.rmSync(bakDir, { recursive: true, force: true }) } catch { /* ignore */ }
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (err) {
      // 失败，从备份恢复
      try {
        if (fs.existsSync(bakDir)) {
          if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
          fs.renameSync(bakDir, targetDir)
        }
      } catch { /* ignore */ }
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return Response.json({ error: `安装失败: ${err instanceof Error ? err.message : err}` }, { status: 500 })
    }

    return Response.json({ success: true, skillName })
  } catch (err) {
    console.error('[SkillUpload] Error:', err)
    return Response.json({ error: '上传失败' }, { status: 500 })
  }
}

function validateExtractedPaths(dir: string, allowedBase: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const resolved = path.resolve(fullPath)
    if (!resolved.startsWith(allowedBase + path.sep) && resolved !== allowedBase) {
      try {
        if (entry.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true })
        else fs.unlinkSync(fullPath)
      } catch { /* ignore */ }
      continue
    }
    if (entry.isDirectory()) {
      validateExtractedPaths(fullPath, allowedBase)
    }
  }
}
