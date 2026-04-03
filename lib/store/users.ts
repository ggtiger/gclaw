import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

// ── 类型 ──

export type UserRole = 'admin' | 'user'

export interface OAuthBinding {
  provider: 'dingtalk' | 'feishu'
  providerUserId: string
  providerUsername?: string
  boundAt: string
}

export interface UserInfo {
  id: string
  username: string
  passwordHash: string
  role: UserRole
  createdAt: string
  lastLoginAt?: string
  disabled: boolean
  oauthBindings?: OAuthBinding[]
  avatarUrl?: string  // 头像图片 URL
}

interface UsersData {
  users: UserInfo[]
}

// ── 内部读写 ──

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readAll(): UserInfo[] {
  ensureDataDir()
  try {
    if (!fs.existsSync(USERS_FILE)) return []
    const raw = fs.readFileSync(USERS_FILE, 'utf-8')
    const data: UsersData = JSON.parse(raw)
    return Array.isArray(data.users) ? data.users : []
  } catch {
    return []
  }
}

function writeAll(users: UserInfo[]) {
  ensureDataDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf-8')
}

// ── 校验 ──

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/
const MIN_PASSWORD_LENGTH = 8

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateUsername(username: string): ValidationResult {
  if (!username) return { valid: false, error: '用户名不能为空' }
  if (username.length < 3) return { valid: false, error: '用户名至少 3 个字符' }
  if (username.length > 32) return { valid: false, error: '用户名最多 32 个字符' }
  if (!USERNAME_REGEX.test(username)) return { valid: false, error: '用户名只能包含字母、数字和下划线' }
  return { valid: true }
}

export function validatePassword(password: string): ValidationResult {
  if (!password) return { valid: false, error: '密码不能为空' }
  if (password.length < MIN_PASSWORD_LENGTH) return { valid: false, error: `密码至少 ${MIN_PASSWORD_LENGTH} 位` }
  return { valid: true }
}

// ── 公开 API ──

/**
 * 注册新用户
 * 第一个注册的用户自动成为 admin
 */
export function registerUser(username: string, password: string): { user?: UserInfo; error?: string } {
  // 校验
  const usernameCheck = validateUsername(username)
  if (!usernameCheck.valid) return { error: usernameCheck.error }

  const passwordCheck = validatePassword(password)
  if (!passwordCheck.valid) return { error: passwordCheck.error }

  const users = readAll()

  // 唯一性校验
  if (users.some(u => u.username === username)) {
    return { error: '用户名已存在' }
  }

  // 第一个用户为 admin
  const role: UserRole = users.length === 0 ? 'admin' : 'user'

  const user: UserInfo = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    createdAt: new Date().toISOString(),
    disabled: false,
  }

  users.push(user)
  writeAll(users)

  return { user }
}

/**
 * 验证用户登录
 */
export function authenticateUser(username: string, password: string): UserInfo | null {
  const users = readAll()
  const user = users.find(u => u.username === username)
  if (!user) return null
  if (user.disabled) return null
  if (!bcrypt.compareSync(password, user.passwordHash)) return null

  // 更新最后登录时间
  user.lastLoginAt = new Date().toISOString()
  writeAll(users)

  return user
}

/**
 * 根据 ID 获取用户（不含密码哈希）
 */
export function getUserById(id: string): Omit<UserInfo, 'passwordHash'> | null {
  const users = readAll()
  const user = users.find(u => u.id === id)
  if (!user) return null
  const { passwordHash: _, ...safe } = user
  return safe
}

/**
 * 获取所有用户（不含密码哈希）
 */
export function getAllUsers(): Omit<UserInfo, 'passwordHash'>[] {
  return readAll().map(({ passwordHash: _, ...safe }) => safe)
}

/**
 * 更新用户角色
 */
export function updateUserRole(userId: string, role: UserRole): boolean {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  if (!user) return false
  user.role = role
  writeAll(users)
  return true
}

/**
 * 禁用/启用用户
 */
export function toggleUserDisabled(userId: string, disabled: boolean): boolean {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  if (!user) return false
  user.disabled = disabled
  writeAll(users)
  return true
}

/**
 * 获取用户总数
 */
export function getUserCount(): number {
  return readAll().length
}

/**
 * 修改用户密码
 */
export function updateUserPassword(userId: string, oldPassword: string, newPassword: string): { success: boolean; error?: string } {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  if (!user) return { success: false, error: '用户不存在' }

  // OAuth 用户无密码
  if (!user.passwordHash) return { success: false, error: 'OAuth 用户不支持密码修改，请通过第三方平台管理账号' }

  // 验证旧密码
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return { success: false, error: '旧密码错误' }
  }

  // 校验新密码
  const validation = validatePassword(newPassword)
  if (!validation.valid) return { success: false, error: validation.error }

  // 更新密码
  user.passwordHash = bcrypt.hashSync(newPassword, 10)
  writeAll(users)

  return { success: true }
}

// ── OAuth ──

/**
 * 通过 OAuth 提供商用户 ID 查找用户
 */
export function findUserByOAuth(provider: 'dingtalk' | 'feishu', providerUserId: string): UserInfo | null {
  const users = readAll()
  return users.find(u =>
    u.oauthBindings?.some(b => b.provider === provider && b.providerUserId === providerUserId)
  ) || null
}

/**
 * OAuth 登录：查找或创建用户
 */
export function findOrCreateOAuthUser(
  provider: 'dingtalk' | 'feishu',
  providerUserId: string,
  providerUsername?: string
): { user: UserInfo; isNew: boolean } {
  const users = readAll()

  // 查找已有绑定
  const existing = users.find(u =>
    u.oauthBindings?.some(b => b.provider === provider && b.providerUserId === providerUserId)
  )
  if (existing) {
    existing.lastLoginAt = new Date().toISOString()
    writeAll(users)
    return { user: existing, isNew: false }
  }

  // 创建新用户
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const username = providerUsername || `${provider}_${providerUserId.slice(0, 8)}`
  const role: UserRole = users.length === 0 ? 'admin' : 'user'

  const user: UserInfo = {
    id,
    username,
    passwordHash: '', // OAuth 用户无密码
    role,
    createdAt: new Date().toISOString(),
    disabled: false,
    oauthBindings: [{
      provider,
      providerUserId,
      providerUsername,
      boundAt: new Date().toISOString(),
    }],
  }

  users.push(user)
  writeAll(users)
  return { user, isNew: true }
}

/**
 * 绑定 OAuth 账号到已有用户
 */
export function bindOAuth(userId: string, provider: 'dingtalk' | 'feishu', providerUserId: string, providerUsername?: string): boolean {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  if (!user) return false

  // 检查是否已绑定
  if (user.oauthBindings?.some(b => b.provider === provider && b.providerUserId === providerUserId)) {
    return true // 已绑定
  }

  // 检查该 OAuth 账号是否被其他用户绑定
  if (users.some(u => u.id !== userId && u.oauthBindings?.some(b => b.provider === provider && b.providerUserId === providerUserId))) {
    return false // 已被其他用户绑定
  }

  if (!user.oauthBindings) user.oauthBindings = []
  user.oauthBindings.push({
    provider,
    providerUserId,
    providerUsername,
    boundAt: new Date().toISOString(),
  })

  writeAll(users)
  return true
}

/**
 * 更新用户头像 URL
 */
export function updateUserAvatar(userId: string, avatarUrl: string): Omit<UserInfo, 'passwordHash'> | null {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  if (!user) return null
  user.avatarUrl = avatarUrl
  writeAll(users)
  const { passwordHash: _, ...safe } = user
  return safe
}

/**
 * 清除用户头像 URL
 */
export function clearUserAvatar(userId: string): Omit<UserInfo, 'passwordHash'> | null {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  if (!user) return null
  delete user.avatarUrl
  writeAll(users)
  const { passwordHash: _, ...safe } = user
  return safe
}

/**
 * 根据 ID 获取用户头像 URL
 */
export function getUserAvatarUrl(userId: string): string | null {
  const users = readAll()
  const user = users.find(u => u.id === userId)
  return user?.avatarUrl || null
}
