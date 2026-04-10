import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/auth/helpers'

const SKILLS_DIR = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const skillName = new URL(request.url).searchParams.get('name')
  if (!skillName || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(skillName)) {
    return Response.json({ error: '无效的技能名称' }, { status: 400 })
  }

  const skillDir = path.join(SKILLS_DIR, skillName)
  if (!fs.existsSync(skillDir)) {
    return Response.json({ error: '技能不存在' }, { status: 404 })
  }

  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const os = await import('os')

    const tmpZip = path.join(os.tmpdir(), `gclaw-export-${skillName}-${Date.now()}.zip`)
    await execAsync(`cd "${SKILLS_DIR}" && zip -r "${tmpZip}" "${skillName}"`, { timeout: 30000 })

    const buffer = fs.readFileSync(tmpZip)
    try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${skillName}.zip"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('[SkillExport] Error:', err)
    return Response.json({ error: '导出失败' }, { status: 500 })
  }
}
