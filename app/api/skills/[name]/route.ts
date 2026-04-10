import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/auth/helpers'
import { DATA_DIR } from '@/lib/store/projects'

const SKILLS_DIR = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const { name } = await params
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    return Response.json({ error: '无效的技能名称' }, { status: 400 })
  }

  const skillDir = path.join(SKILLS_DIR, name)
  if (!fs.existsSync(skillDir)) {
    return Response.json({ error: '技能不存在' }, { status: 404 })
  }

  try {
    // 删除技能目录
    fs.rmSync(skillDir, { recursive: true, force: true })

    // 从所有项目的 enabled-skills.json 中移除该技能
    const projectsDir = path.join(DATA_DIR, 'projects')
    if (fs.existsSync(projectsDir)) {
      for (const projectId of fs.readdirSync(projectsDir)) {
        const enabledFile = path.join(projectsDir, projectId, '.data', 'enabled-skills.json')
        if (!fs.existsSync(enabledFile)) continue
        try {
          const raw = fs.readFileSync(enabledFile, 'utf-8')
          const data = JSON.parse(raw)
          if (Array.isArray(data.enabled) && data.enabled.includes(name)) {
            data.enabled = data.enabled.filter((s: string) => s !== name)
            fs.writeFileSync(enabledFile, JSON.stringify(data, null, 2), 'utf-8')
          }
        } catch { /* ignore */ }
      }
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('[SkillDelete] Error:', err)
    return Response.json({ error: '删除失败' }, { status: 500 })
  }
}
