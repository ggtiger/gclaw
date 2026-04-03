import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// ── 配置 ──

const isDefaultSecret = !process.env.JWT_SECRET
if (isDefaultSecret && process.env.NODE_ENV === 'production') {
  console.error('[JWT] 安全警告：未设置 JWT_SECRET 环境变量，正在使用默认密钥！这非常不安全，请立即设置 JWT_SECRET。')
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'gclaw-default-secret-change-in-production'
)

const COOKIE_NAME = 'gclaw_token'

const DEFAULT_EXPIRES = '7d'
const REMEMBER_EXPIRES = '30d'

// ── 类型 ──

export interface JwtPayload {
  userId: string
  username: string
  role: 'admin' | 'user'
}

// ── Token 生成 ──

export async function generateToken(
  payload: JwtPayload,
  rememberMe: boolean = false
): Promise<string> {
  const expires = rememberMe ? REMEMBER_EXPIRES : DEFAULT_EXPIRES

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(JWT_SECRET)
}

// ── Token 验证 ──

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: payload.role as 'admin' | 'user',
    }
  } catch {
    return null
  }
}

// ── Cookie 操作 ──

export function getTokenMaxAge(rememberMe: boolean = false): number {
  // 7 天或 30 天（秒）
  return rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60
}

export const TOKEN_COOKIE_NAME = COOKIE_NAME
