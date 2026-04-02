/**
 * API 输入参数校验工具
 */

const MAX_STRING_LENGTH = 10000
const MAX_NAME_LENGTH = 100
const MAX_ID_LENGTH = 64

const MAX_PASSWORD_LENGTH = 128

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

// ── 通用校验 ──

export function validateRequired(value: unknown, fieldName: string): ValidationResult {
  const errors: ValidationError[] = []
  if (value === undefined || value === null || value === '') {
    errors.push({ field: fieldName, message: `${fieldName} 不能为空` })
  }
  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}

export function validateString(
  value: unknown,
  fieldName: string,
  options: { maxLength?: number; minLength?: number; pattern?: RegExp } = {}
): ValidationResult {
  const errors: ValidationError[] = []
  // 必填检查
  if (value === undefined || value === null || value === '') {
    errors.push({ field: fieldName, message: `${fieldName} 不能为空` })
    return { valid: false, errors }
  }

  const str = String(value)
  if (options.minLength && str.length < options.minLength) {
    errors.push({ field: fieldName, message: `${fieldName} 最少 ${options.minLength} 个字符` })
  }
  if (options.maxLength && str.length > options.maxLength) {
    errors.push({ field: fieldName, message: `${fieldName} 最多 ${options.maxLength} 个字符` })
  }
  if (options.pattern && !options.pattern.test(str)) {
    errors.push({ field: fieldName, message: `${fieldName} 格式不正确` })
  }
  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}

export function validateProjectId(id: string): ValidationResult {
  return validateString(id, 'projectId', {
    maxLength: MAX_ID_LENGTH,
    minLength: 1,
    pattern: /^[a-zA-Z0-9_-]+$/,
  })
}

export function validateUsername(username: string): ValidationResult {
  return validateString(username, 'username', {
    maxLength: MAX_NAME_LENGTH,
    minLength: 3,
    pattern: /^[a-zA-Z0-9_]+$/,
  })
}

export function validatePassword(password: string): ValidationResult {
  const errors: ValidationError[] = []
  if (!password) {
    errors.push({ field: 'password', message: '密码不能为空' })
    return { valid: false, errors }
  }
  if (password.length < 8) {
    errors.push({ field: 'password', message: '密码至少 8 位' })
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push({ field: 'password', message: `密码最多 ${MAX_PASSWORD_LENGTH} 字符` })
  }
  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}
