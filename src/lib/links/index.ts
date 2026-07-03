import crypto from 'crypto'

const LINK_SECRET = process.env.LINK_SECRET || process.env.NEXTAUTH_SECRET || 'change-me-in-production'

export function generateSecureToken(data: string): string {
  const timestamp = Date.now().toString(36)
  const nonce = crypto.randomBytes(8).toString('hex')
  const payload = `${timestamp}:${nonce}:${data}`
  const hmac = crypto.createHmac('sha256', LINK_SECRET).update(payload).digest('hex').slice(0, 16)
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

export function verifySecureToken(token: string, maxAgeMs: number = 86400000): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length < 4) return null
    const timestamp = parseInt(parts[0], 36)
    if (Date.now() - timestamp > maxAgeMs) return null
    const data = parts.slice(2, -1).join(':')
    const payload = parts.slice(0, -1).join(':')
    const hmac = crypto.createHmac('sha256', LINK_SECRET).update(payload).digest('hex').slice(0, 16)
    if (hmac !== parts[parts.length - 1]) return null
    return data
  } catch {
    return null
  }
}
