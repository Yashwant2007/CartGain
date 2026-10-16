import crypto from 'crypto'

// Signed-link secret resolution. In production this MUST be provided (either
// LINK_SECRET or the shared NEXTAUTH_SECRET); we fail closed rather than fall
// back to a publicly known string that would let anyone forge unsubscribe /
// resume / recovery links. Outside production a fixed dev-only constant keeps
// local runs and the test suite working without extra setup.
const DEV_FALLBACK = 'cartgain-dev-link-secret-do-not-use-in-production'

function resolveLinkSecret(): string | null {
  const secret = process.env.LINK_SECRET || process.env.NEXTAUTH_SECRET
  if (secret && secret.length >= 16) return secret
  if (process.env.NODE_ENV === 'production') return null
  return DEV_FALLBACK
}

export function generateSecureToken(data: string): string {
  const secret = resolveLinkSecret()
  if (!secret) throw new Error('LINK_SECRET (or NEXTAUTH_SECRET) must be set to sign link tokens')
  const timestamp = Date.now().toString(36)
  const nonce = crypto.randomBytes(8).toString('hex')
  const payload = `${timestamp}:${nonce}:${data}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16)
  return Buffer.from(`${payload}:${hmac}`, 'utf8').toString('base64url')
}

export function verifySecureToken(token: string, maxAgeMs = 1000 * 60 * 60 * 24): string | null {
  const secret = resolveLinkSecret()
  if (!secret) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length < 4) return null
    const timestamp = parseInt(parts[0], 36)
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > maxAgeMs) return null
    const data = parts.slice(2, -1).join(':')
    const payload = parts.slice(0, -1).join(':')
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16)
    const provided = parts[parts.length - 1]
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided, 'utf8')
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null
    return data
  } catch {
    return null
  }
}
