'use client'

import { useMemo } from 'react'
import { Bot, Sparkles, Brain, Wand2, Cpu, MessageSquare, GraduationCap, Stethoscope, Code, Palette, Music, Heart, type LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Sparkles,
  Brain,
  Wand2,
  Cpu,
  MessageSquare,
  GraduationCap,
  Stethoscope,
  Code,
  Palette,
  Music,
  Heart,
}

export const AVAILABLE_ICONS = Object.keys(ICON_MAP)

export const DEFAULT_ASSISTANT_NAME = 'AI助理'
export const DEFAULT_ASSISTANT_ICON = 'Bot'

export function useAssistantIdentity(settings: { assistantName?: string; assistantIcon?: string } | null | undefined) {
  return useMemo(() => {
    const name = settings?.assistantName?.trim() || DEFAULT_ASSISTANT_NAME
    const iconName = settings?.assistantIcon || DEFAULT_ASSISTANT_ICON
    const Icon = ICON_MAP[iconName] || Bot
    return { name, iconName, Icon }
  }, [settings?.assistantName, settings?.assistantIcon])
}
