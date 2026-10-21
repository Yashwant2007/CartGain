/**
 * Message variety.
 *
 * A recovery sequence that sends the same three sentences three times is the
 * fastest way to get a brand flagged as spam. The variant is chosen from a
 * STABLE seed (cart id + channel + step), so:
 *  - a retry of the same message keeps the same variant (no new copy for the
 *    same step, which would break idempotency expectations),
 *  - two different carts get different variants,
 *  - a customer who abandoned the same cart twice sees a consistent voice.
 */

/** FNV-1a — small, fast, stable across processes (unlike Math.random). */
export function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export function pickIndex(seed: string, length: number): number {
  if (length <= 0) return 0
  return hashString(seed) % length
}

export function pickVariant<T>(seed: string, variants: readonly T[]): T | undefined {
  if (variants.length === 0) return undefined
  return variants[pickIndex(seed, variants.length)]
}

/**
 * Openings used to vary the first line of a recovery message. They are
 * deliberately fact-free — they contain no claim that could be false.
 */
export const OPENERS: Record<'email' | 'whatsapp', string[]> = {
  email: [
    'You left something behind.',
    'Still thinking it over?',
    'Your cart is waiting.',
    'Picked the right things?',
    'Your picks are on hold.',
  ],
  whatsapp: [
    'Still thinking it over?',
    'Your cart is waiting.',
    'Picked the right things?',
    'You left something behind.',
  ],
}

/**
 * Deterministic send windows. A brand with a quiet-hours policy should not
 * ping a customer at 2am — the rule is a function of the store's voice
 * settings plus local time, never of the model.
 */
export type QuietHours = { start: number; end: number } | null

export function isWithinQuietHours(now: Date, quiet: QuietHours, timezoneOffsetMinutes = 0): boolean {
  if (!quiet) return false
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60_000)
  const hour = local.getUTCHours()
  const { start, end } = quiet
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  // window crosses midnight
  return hour >= start || hour < end
}

/**
 * The next moment the merchant is allowed to send, as a UTC timestamp.
 * Returns `null` when the current time is already allowed.
 */
export function nextAllowedSendTime(
  now: Date,
  quiet: QuietHours,
  timezoneOffsetMinutes = 0
): Date | null {
  if (!quiet) return null
  if (!isWithinQuietHours(now, quiet, timezoneOffsetMinutes)) return null
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60_000)
  const minutesToEnd = (quiet.end * 60 - local.getUTCHours() * 60 - local.getUTCMinutes() + 24 * 60) % (24 * 60)
  const localEnd = new Date(local.getTime() + minutesToEnd * 60_000)
  return new Date(localEnd.getTime() - timezoneOffsetMinutes * 60_000)
}
