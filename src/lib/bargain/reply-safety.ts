export type ReplySafetyReason = 'pressure_language'

export interface ReplySafetyResult {
  reply: string
  guarded: boolean
  reason?: ReplySafetyReason
}

const PRESSURE_PATTERNS: RegExp[] = [
  /\bhurry\b/i,
  /\bact fast\b/i,
  /\bbuy now\b/i,
  /\blast chance\b/i,
  /\blast call\b/i,
  /\bonly today\b/i,
  /\btoday only\b/i,
  /\bbefore it'?s gone\b/i,
  /\b(?:won'?t|will not) last\b/i,
  /\bdon'?t miss out\b/i,
  /\blimited (?:time|stock|offer|quantity)\b/i,
  /\b(?:only )?(?:a )?few left\b/i,
  /\balmost gone\b/i,
  /\bselling fast\b/i,
  /\b(?:price|deal|offer) (?:will|is going to|might) (?:go up|rise|reset|disappear|end)\b/i,
  /\boffer (?:will )?expire/i,
  /\bcountdown\b/i,
  /\bfinal hours\b/i,
  /\bclosing soon\b/i,
]

export function detectPressureLanguage(reply: string): boolean {
  return PRESSURE_PATTERNS.some((pattern) => pattern.test(reply))
}

export function scrubPressureLanguage(reply: string, fallback: string): ReplySafetyResult {
  if (!reply || !detectPressureLanguage(reply)) return { reply, guarded: false }
  const parts = reply.split(/([.!?]+\s+|\n+)/)
  let guarded = false
  const safeParts = parts.map((part, index) => {
    if (index % 2 === 1 || !part.trim()) return part
    if (!detectPressureLanguage(part)) return part
    guarded = true
    return fallback
  })
  const cleaned = safeParts.join('').trim()
  return { reply: cleaned || fallback, guarded, reason: 'pressure_language' }
}
