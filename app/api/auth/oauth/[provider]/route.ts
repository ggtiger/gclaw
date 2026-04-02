import { NextRequest, NextResponse } from 'next/server'
import { findOrCreateOAuthUser, bindOAuth } from '@/lib/store/users'
import { generateToken, TOKEN_COOKIE_NAME } from '@/lib/auth/jwt'
import { getChannels } from '@/lib/store/channels'
import { getProjects } from '@/lib/store/projects'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

/**
 * OAuth 登录流程
 * GET ?step=redirect  → 生成授权 URL，302 重定向
 * GET ?code=xxx  → 回调处理，创建/关联账号，设置 JWT Cookie
 * POST ?action=bind  → 绑定 OAuth 到当前登录用户
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  if (provider !== 'dingtalk' && provider !== 'feishu') {
    return Response.json({ error: '不支持的 OAuth 提供商' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // Step 2: 回调处理
  if (code) {
    try {
      const userInfo = await exchangeCodeForUser(provider, code)
      if (!userInfo) {
        return Response.redirect(new URL('/login?error=oauth_failed', request.url))
      }

      const { user, isNew } = findOrCreateOAuthUser(provider, userInfo.id, userInfo.name)

      if (user.disabled) {
        return Response.redirect(new URL('/login?error=account_disabled', request.url))
      }

      // 生成 JWT
      const token = await generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      })

      const redirectUrl = state || '/'
      const response = NextResponse.redirect(new URL(redirectUrl, request.url))
      response.cookies.set(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      })

      return response
    } catch (err) {
      console.error('OAuth callback error:', err)
      return Response.redirect(new URL('/login?error=oauth_failed', request.url))
    }
  }

  // Step 1: 生成授权 URL，重定向到 OAuth 页面
  const channelConfig = findOAuthChannelConfig(provider)
  if (!channelConfig) {
    return Response.json({ error: `${provider} 渠道未配置，无法使用 OAuth 登录` }, { status: 400 })
  }

  const redirectUri = `${new URL(request.url).origin}/api/auth/oauth/${provider}`
  const stateParam = searchParams.get('redirect') || '/'

  let authUrl: string
  if (provider === 'dingtalk') {
    authUrl = `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&client_id=${channelConfig.appKey}&scope=openid&state=${encodeURIComponent(stateParam)}&prompt=consent`
  } else {
    authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${channelConfig.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(stateParam)}`
  }

  return Response.redirect(authUrl)
}

/** 绑定 OAuth 账号 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  if (provider !== 'dingtalk' && provider !== 'feishu') {
    return Response.json({ error: '不支持的提供商' }, { status: 400 })
  }

  const authUser = getAuthUser(request)
  if (!authUser) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }

  const body = await request.json()
  const { code } = body as { code: string }

  if (!code) {
    return Response.json({ error: '缺少授权码' }, { status: 400 })
  }

  try {
    const userInfo = await exchangeCodeForUser(provider, code)
    if (!userInfo) {
      return Response.json({ error: '获取用户信息失败' }, { status: 400 })
    }

    const ok = bindOAuth(authUser.userId, provider, userInfo.id, userInfo.name)
    if (!ok) {
      return Response.json({ error: '绑定失败（可能已被其他用户绑定）' }, { status: 400 })
    }

    return Response.json({ success: true, providerUsername: userInfo.name })
  } catch (err) {
    console.error('OAuth bind error:', err)
    return Response.json({ error: '绑定失败' }, { status: 500 })
  }
}

// ── 辅助函数 ──

function findOAuthChannelConfig(provider: 'dingtalk' | 'feishu'): { appKey?: string; appId?: string; appSecret: string } | null {
  // 遍历所有项目的渠道配置，找到匹配的 OAuth 配置
  const projects = getProjects()
  for (const project of projects) {
    const channels = getChannels(project.id)
    for (const ch of channels) {
      if (provider === 'dingtalk' && ch.dingtalk?.appKey && ch.dingtalk.appSecret) {
        return { appKey: ch.dingtalk.appKey, appSecret: ch.dingtalk.appSecret }
      }
      if (provider === 'feishu' && ch.feishu?.appId && ch.feishu.appSecret) {
        return { appId: ch.feishu.appId, appSecret: ch.feishu.appSecret }
      }
    }
  }
  return null
}

async function exchangeCodeForUser(
  provider: 'dingtalk' | 'feishu',
  code: string
): Promise<{ id: string; name: string } | null> {
  const config = findOAuthChannelConfig(provider)
  if (!config) return null

  try {
    if (provider === 'dingtalk') {
      // 钉钉: 获取 userAccessToken
      const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: config.appKey,
          clientSecret: config.appSecret,
          code,
          grantType: 'authorization_code',
        }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.accessToken) return null

      // 获取用户信息
      const userRes = await fetch('https://api.dingtalk.com/v1.0/contact/users/me', {
        headers: { 'x-acs-dingtalk-access-token': tokenData.accessToken },
      })
      const userData = await userRes.json()
      return { id: userData.result?.userId || userData.userid || code, name: userData.result?.nick || userData.nick || '钉钉用户' }
    }

    if (provider === 'feishu') {
      // 飞书: 获取 app_access_token 先，再换取 user_access_token
      const appTokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
      })
      const appTokenData = await appTokenRes.json()
      const appAccessToken = appTokenData.app_access_token
      if (!appAccessToken) return null

      // 用 code 换取 user_access_token
      const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appAccessToken}`,
        },
        body: JSON.stringify({ grant_type: 'authorization_code', code }),
      })
      const tokenData = await tokenRes.json()
      const userAccessToken = tokenData.data?.access_token
 if (!userAccessToken) return null

      // 获取用户信息
      const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
        headers: { 'Authorization': `Bearer ${userAccessToken}` },
      })
      const userData = await userRes.json()
      return {
        id: userData.data?.user_id || userData.data?.open_id || code,
        name: userData.data?.name || userData.data?.mobile || '飞书用户',
      }
    }
  } catch (err) {
    console.error(`Exchange code error (${provider}):`, err)
    return null
  }
  return null
}
