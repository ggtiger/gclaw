'use client'

import type { ProjectMode } from '@/types/skills'

interface ModeSelectorProps {
  value?: ProjectMode
  onChange: (mode?: ProjectMode) => void
}

const MODE_OPTIONS: { id: ProjectMode; name: string; emoji: string; desc: string }[] = [
  { id: 'team', name: '团队模式', emoji: '👥', desc: '项目经理 + 前后端/测试/产品' },
  { id: 'government', name: '三审六部', emoji: '🏛️', desc: '总管 + 六部协作' },
  { id: 'company', name: '公司模式', emoji: '🏢', desc: 'CEO + CFO/CTO/市场等' },
  { id: 'classroom', name: '班级模式', emoji: '🎓', desc: '班主任 + 各科老师' },
]

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-2">
      {MODE_OPTIONS.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(value === opt.id ? undefined : opt.id)}
          className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg border transition-all duration-200 cursor-pointer text-left ${
            value === opt.id
              ? 'bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-300'
              : 'bg-white/40 dark:bg-white/5 border-white/50 dark:border-white/[0.06] text-slate-600 dark:text-slate-400'
          }`}
        >
          <span className="text-sm">{opt.emoji}</span>
          <div className="min-w-0">
            <div className="font-medium truncate">{opt.name}</div>
            <div className="text-[10px] opacity-60 truncate">{opt.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
