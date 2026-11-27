import { generateSecureToken, verifySecureToken } from '@/lib/links'
import { normalizeRecipientEmail } from '@/lib/recovery/recipients'

export type OptInConfirmation = {
  storeId: string
  email: string
  productId?: string | null
  sessionId?: string | null
  name?: string | null
}

const KIND = 'recovery_email_opt_in'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

export function signOptInConfirmation(input: OptInConfirmation): string {
  const email = normalizeRecipientEmail(input.email)
  if (!input.storeId || !email) throw new Error('storeId and email are required')
  return generateSecureToken(JSON.stringify({
    kind: KIND,
    storeId: input.storeId,
    email,
    productId: input.productId || null,
    sessionId: input.sessionId || null,
    name: input.name || null,
  }))
}

export function verifyOptInConfirmation(token: string): OptInConfirmation | null {
  const data = verifySecureToken(token, MAX_AGE_MS)
  if (!data) return null
  try {
    const parsed = JSON.parse(data)
    if (!parsed || parsed.kind !== KIND) return null
    if (typeof parsed.storeId !== 'string' || !parsed.storeId) return null
    const email = normalizeRecipientEmail(parsed.email)
    if (!email) return null
    return {
      storeId: parsed.storeId,
      email,
      productId: typeof parsed.productId === 'string' && parsed.productId ? parsed.productId : null,
      sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : null,
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name.slice(0, 120) : null,
    }
  } catch {
    return null
  }
}

export function buildOptInConfirmationUrl(baseUrl: string, input: OptInConfirmation): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/recovery/confirm?token=${encodeURIComponent(signOptInConfirmation(input))}`
}
