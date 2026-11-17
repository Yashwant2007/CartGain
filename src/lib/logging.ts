import { createHash } from 'crypto'

/**
 * Stable, non-reversible reference for an identifier that must not appear in
 * logs (checkout/cart tokens, provider message ids). The hash keeps incidents
 * correlatable without retaining the secret itself.
 */
export function logReference(value: string | null | undefined): string {
  if (!value) return 'unknown'
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}
