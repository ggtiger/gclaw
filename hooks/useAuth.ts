'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  id: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt?: string
  disabled: boolean
  avatarUrl?: string
}

// 模块级缓存，避免多个组件重复请求
let cachedUser: AuthUser | null = null
let fetchPromise: Promise<AuthUser | null> | null = null

async function fetchUser(): Promise<AuthUser | null> {
  if (cachedUser) return cachedUser
  if (fetchPromise) return fetchPromise

  fetchPromise = fetch('/api/auth/me')
    .then(async res => {
      if (!res.ok) return null
      const data = await res.json()
      cachedUser = data.user ?? null
      return cachedUser
    })
    .catch(() => null)
    .finally(() => {
      fetchPromise = null
    })

  return fetchPromise
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(cachedUser)
  const [loading, setLoading] = useState(!cachedUser)

  const refresh = useCallback(async () => {
    setLoading(true)
    cachedUser = null
    const u = await fetchUser()
    setUser(u)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!cachedUser) {
      refresh()
    }
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      cachedUser = null
      setUser(null)
      window.location.href = '/login'
    }
  }, [])

  return { user, loading, logout, refresh }
}
