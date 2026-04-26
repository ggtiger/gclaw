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

export interface AssistantIdentitySettings {
  assistantName?: string
  assistantIcon?: string
  assistantAvatar?: string
}

export function useAssistantIdentity(settings: AssistantIdentitySettings | null | undefined, projectId?: string) {
  return useMemo(() => {
    const name = settings?.assistantName?.trim() || DEFAULT_ASSISTANT_NAME
    const iconName = settings?.assistantIcon || DEFAULT_ASSISTANT_ICON
    const Icon = ICON_MAP[iconName] || Bot
    const avatarUrl = settings?.assistantAvatar && projectId
      ? `/api/settings/avatar?projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(settings.assistantAvatar)}`
      : null
    return { name, iconName, Icon, avatarUrl }
  }, [settings?.assistantName, settings?.assistantIcon, settings?.assistantAvatar, projectId])
}
