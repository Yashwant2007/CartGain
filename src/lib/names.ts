const GENERIC_CUSTOMER_NAMES = new Set([
  'customer',
  'guest',
  'guest customer',
  'shopify customer',
  'unknown',
  'valued',
  'valued customer',
])

/**
 * Normalize a customer name for greetings and personalization.
 *
 * Shopify payloads sometimes carry an email address in the name field, and
 * older captures stored placeholders like "Valued Customer". Neither is a name:
 * using either produces greetings like "Hey, shopper@example.com". Return null
 * instead so the copy layer can fall back to a neutral greeting.
 */
export function cleanCustomerName(
  value: unknown,
  email?: string | null,
): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  if (cleaned.includes('@')) return null
  if (/^\+?[\d\s().-]{6,}$/.test(cleaned)) return null
  if (GENERIC_CUSTOMER_NAMES.has(cleaned.toLowerCase())) return null
  if (email && cleaned.toLowerCase() === email.trim().toLowerCase()) return null
  return cleaned
}
