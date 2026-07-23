import { randomBytes } from 'crypto'
import { createHash } from 'crypto'

const KEY_PREFIX = 'cg'

export function generateApiKey(name: string): { raw: string; hash: string; prefix: string } {
  const raw = `${KEY_PREFIX}_${randomBytes(24).toString('hex')}`
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.substring(0, 10) + '...'
  return { raw, hash, prefix }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function maskApiKey(key: string): string {
  if (key.length <= 12) return key
  return key.substring(0, 8) + '...' + key.substring(key.length - 4)
}