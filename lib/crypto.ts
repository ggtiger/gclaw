import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

/**
 * 从环境变量或固定种子派生加密密钥
 * 优先使用 GCLAW_ENCRYPT_KEY，否则使用机器特征值
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.GCLAW_ENCRYPT_KEY
  if (envKey) {
    return crypto.scryptSync(envKey, 'gclaw-salt', 32)
  }
  // 回退：使用固定种子（适用于单机部署）
  return crypto.scryptSync('gclaw-default-encryption-key', 'gclaw-salt', 32)
}

/**
 * AES-256-GCM 加密
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // 格式: iv:tag:ciphertext (均为 hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * AES-256-GCM 解密
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''
  // 非加密格式（明文），直接返回
  if (!ciphertext.includes(':')) return ciphertext
  const key = getEncryptionKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) return ciphertext // 非预期格式，原样返回
  const [ivHex, tagHex, dataHex] = parts
  try {
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const data = Buffer.from(dataHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(data) + decipher.final('utf8')
  } catch {
    // 解密失败（可能密钥变更），返回原文
    console.warn('[Crypto] Failed to decrypt, returning raw value')
    return ciphertext
  }
}

/**
 * 判断字符串是否为加密格式
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p))
}

/**
 * 掩码显示：仅显示后 4 位
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 4) return '****'
  return `****${apiKey.slice(-4)}`
}

/**
 * 日志安全输出：对可能包含 API Key 的字符串做脱敏
 * 匹配 sk-ant- 开头的密钥模式
 */
export function sanitizeForLog(text: string): string {
  if (!text) return text
  // 匹配 Anthropic API Key 格式: sk-ant-api03-xxxxx...
  return text.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, 'sk-ant-****REDACTED')
}
