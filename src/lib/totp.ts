import { createHmac, randomBytes } from 'crypto'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf: Buffer): string {
  let bits = 0; let val = 0; let out = ''
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8) | buf[i]; bits += 8
    while (bits >= 5) { out += BASE32[(val >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += BASE32[(val << (5 - bits)) & 31]
  return out
}

function base32Decode(s: string): Buffer {
  const cleaned = s.replace(/[^A-Za-z2-7]/g, '').toUpperCase()
  const bytes: number[] = []
  let buf = 0; let bits = 0
  for (let i = 0; i < cleaned.length; i++) {
    const p = BASE32.indexOf(cleaned[i]); if (p < 0) continue
    buf = (buf << 5) | p; bits += 5
    if (bits >= 8) { bytes.push((buf >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(bytes)
}

function totpForTime(secret: string, time: number): string {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  let t = Math.floor(time / 30000)
  for (let i = 7; i >= 0; i--) { buf[i] = t & 0xff; t >>>= 8 }
  const hmac = createHmac('sha1', key)
  hmac.update(buf)
  const digest = hmac.digest()
  const offset = digest[digest.length - 1] & 0xf
  const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff)
  return String(code % 1000000).padStart(6, '0')
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function getTotpCode(secret: string): string {
  return totpForTime(secret, Date.now())
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const now = Date.now()
  for (const offset of [0, -1, 1]) {
    if (totpForTime(secret, now + offset * 30000) === code) return true
  }
  return false
}

export function generateOtpauthUrl(secret: string, email: string, issuer = 'CartGain'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

export function generateQrCodeUrl(secret: string, email: string, issuer = 'CartGain'): string {
  const otpauth = generateOtpauthUrl(secret, email, issuer)
  return `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauth)}`
}