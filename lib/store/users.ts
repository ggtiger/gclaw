import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

// ── 类型 ──

export type UserRole = 'admin' | 'user'

export interface UserInfo {
  id: string
  username: string
  passwordHash: string
  role: UserRole
  createdAt: string
  lastLoginAt?: string
  disabled: boolean
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
