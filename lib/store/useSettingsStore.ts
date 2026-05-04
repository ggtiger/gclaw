'use client'

import { create } from 'zustand'
import type { GlobalSettings, ProjectSettings, ModelProvider } from '@/types/skills'
import { DEFAULT_GLOBAL, DEFAULT_PROJECT } from '@/types/skills'

interface SettingsStore {
  // ── 已提交的正式状态（消费者读取） ──
  globalSettings: GlobalSettings | null
  projectSettings: ProjectSettings | null
  globalProviders: ModelProvider[]
  currentProjectId: string
  /** 后端解析后的实际工作目录（含 fallback） */
  effectiveCwd: string
  loading: boolean

  // ── 草稿状态（仅设置面板编辑用） ──
  draftGlobal: GlobalSettings | null
  draftProject: ProjectSettings | null
  saving: boolean
  dirty: boolean
  apiKeyRawValue: string

  // ── Actions ──
  fetchSettings: (projectId: string) => Promise<void>
  /** 编辑草稿（不影响正式状态） */
  updateGlobalField: <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => void
  updateProjectField: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void
  setApiKeyRawValue: (v: string) => void
  setDirty: (v: boolean) => void

  /** 保存：将草稿提交为正式状态 + 持久化到后端 */
  saveGlobalSettings: (projectId: string) => Promise<{ success: boolean; error?: string }>
  saveProjectSettings: (projectId: string) => Promise<{ success: boolean; error?: string }>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  globalSettings: null,
  projectSettings: null,
  globalProviders: [],
  currentProjectId: '',
  effectiveCwd: '',
  loading: false,

  draftGlobal: null,
  draftProject: null,
  saving: false,
  dirty: false,
  apiKeyRawValue: '',

  fetchSettings: async (projectId: string) => {
    set({ loading: true, currentProjectId: projectId })
    try {
      const res = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()

      const apiKeyRawValue = (data.apiKey && !data.apiKey.startsWith('****')) ? data.apiKey : get().apiKeyRawValue
      const globalSettings: GlobalSettings = {
        apiKey: data.apiKey || '',
        apiBaseUrl: data.apiBaseUrl || '',
        theme: data.theme || 'system',
        security: data.security || { sensitiveWords: [], retentionDays: 0 },
        assistantModel: data.assistantModel || '',
        defaultModel: data.defaultModel || 'claude-sonnet-4-20250514',
        defaultSystemPrompt: data.defaultSystemPrompt ?? '',
        devRepoUrl: data.devRepoUrl || '',
        providers: data.providers || [],
        activeProviderId: data.activeProviderId || '',
      }

      const projectSettings: ProjectSettings = {
        model: data.model || '',
        effort: data.effort || 'medium',
        sessionId: data.sessionId || '',
        cwd: data.cwd || '',
        dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? true,
        systemPrompt: data.systemPrompt || '',
        providerId: data.providerId || '',
        assistantName: data.assistantName || '',
        assistantIcon: data.assistantIcon || '',
        assistantAvatar: data.assistantAvatar || '',
      }

      set({
        globalSettings,
        projectSettings,
        // 草稿同步为正式状态的拷贝
        draftGlobal: { ...globalSettings },
        draftProject: { ...projectSettings },
        globalProviders: data.providers || [],
        effectiveCwd: data.effectiveCwd || '',
        apiKeyRawValue,
        dirty: false,
      })
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      set({ loading: false })
    }
  },

  // 编辑草稿，不影响正式状态
  updateGlobalField: (key, value) => {
    const { draftGlobal } = get()
    if (!draftGlobal) return
    set({
      draftGlobal: { ...draftGlobal, [key]: value },
      dirty: true,
    })
  },

  updateProjectField: (key, value) => {
    const { draftProject } = get()
    if (!draftProject) return
    set({
      draftProject: { ...draftProject, [key]: value },
      dirty: true,
    })
  },

  setApiKeyRawValue: (v: string) => set({ apiKeyRawValue: v }),
  setDirty: (v: boolean) => set({ dirty: v }),

  // 保存：草稿 → 正式状态 + 持久化
  saveGlobalSettings: async (projectId: string) => {
    const { draftGlobal, dirty, apiKeyRawValue } = get()
    if (!draftGlobal || !dirty) return { success: false, error: 'no changes' }

    if (!draftGlobal.assistantModel?.trim()) {
      return { success: false, error: '辅助模型不能为空，请选择或填写模型名称' }
    }
    if (!draftGlobal.defaultModel?.trim()) {
      return { success: false, error: '默认项目模型不能为空，请选择或填写模型名称' }
    }

    set({ saving: true })
    try {
      const toSave = { ...draftGlobal }
      if (apiKeyRawValue && !apiKeyRawValue.startsWith('****')) {
        toSave.apiKey = apiKeyRawValue
      }
      await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      })
      // 重新加载：同步服务端状态（脱敏 apiKey 等）到正式状态
      await get().fetchSettings(projectId)
      return { success: true }
    } catch (err) {
      console.error('Failed to save settings:', err)
      return { success: false, error: '保存设置失败' }
    } finally {
      set({ saving: false })
    }
  },

  saveProjectSettings: async (projectId: string) => {
    const { draftProject, dirty } = get()
    if (!draftProject || !dirty) return { success: false, error: 'no changes' }

    set({ saving: true })
    try {
      await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftProject),
      })
      // 草稿提交为正式状态
      set({
        projectSettings: { ...draftProject },
        dirty: false,
      })
      return { success: true }
    } catch (err) {
      console.error('Failed to save project settings:', err)
      return { success: false, error: '保存项目设置失败' }
    } finally {
      set({ saving: false })
    }
  },
}))
