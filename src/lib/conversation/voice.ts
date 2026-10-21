/**
 * Brand voice — the merchant-facing control surface for how CartGain speaks.
 *
 * A voice is ONE model (persona + emoji policy + humour + length + assertiveness
 * + language + vocabulary), not a set of separate prompts. Every consumer
 * (recovery email, WhatsApp message, bargain reply) renders the same model
 * into its own channel, so changing the voice changes the product everywhere
 * and nothing can drift into a second, disconnected "tone system".
 *
 * Hard rules that a merchant setting may never override (they live in
 * `validate.ts`, not here): consent, factual accuracy, price and discount
 * authority, and legal requirements.
 */

export type VoicePersona = 'friendly' | 'premium' | 'playful' | 'minimal' | 'expert'
export type EmojiIntensity = 'off' | 'subtle' | 'balanced' | 'playful'
export type HumorLevel = 'none' | 'light' | 'playful'
export type MessageLength = 'short' | 'medium' | 'long'
export type Assertiveness = 'soft' | 'balanced' | 'direct'

export type BrandVoice = {
  persona: VoicePersona
  emojiIntensity: EmojiIntensity
  humorLevel: HumorLevel
  messageLength: MessageLength
  assertiveness: Assertiveness
  /** Preferred language for generated copy. "auto" follows the customer. */
  language: string
  /** Words the merchant never wants to see. */
  bannedPhrases: string[]
  /** Words/phrases the merchant wants the copy to use when natural. */
  approvedPhrases: string[]
  /** Optional sign-off appended to email copy. */
  signOff?: string
}

export const VOICE_PERSONAS: VoicePersona[] = ['friendly', 'premium', 'playful', 'minimal', 'expert']
export const EMOJI_INTENSITIES: EmojiIntensity[] = ['off', 'subtle', 'balanced', 'playful']
export const HUMOR_LEVELS: HumorLevel[] = ['none', 'light', 'playful']
export const MESSAGE_LENGTHS: MessageLength[] = ['short', 'medium', 'long']
export const ASSERTIVENESS_LEVELS: Assertiveness[] = ['soft', 'balanced', 'direct']

/**
 * Presets adjust the SAME underlying model, so switching persona changes the
 * traits coherently instead of swapping a different prompt behind the scenes.
 */
export const VOICE_PRESETS: Record<VoicePersona, Omit<BrandVoice, 'persona' | 'bannedPhrases' | 'approvedPhrases' | 'signOff' | 'language'>> = {
  friendly: {
    emojiIntensity: 'balanced',
    humorLevel: 'light',
    messageLength: 'medium',
    assertiveness: 'balanced',
  },
  premium: {
    emojiIntensity: 'subtle',
    humorLevel: 'none',
    messageLength: 'short',
    assertiveness: 'balanced',
  },
  playful: {
    emojiIntensity: 'playful',
    humorLevel: 'playful',
    messageLength: 'short',
    assertiveness: 'balanced',
  },
  minimal: {
    emojiIntensity: 'off',
    humorLevel: 'none',
    messageLength: 'short',
    assertiveness: 'direct',
  },
  expert: {
    emojiIntensity: 'off',
    humorLevel: 'none',
    messageLength: 'long',
    assertiveness: 'soft',
  },
}

export const DEFAULT_VOICE: BrandVoice = {
  ...VOICE_PRESETS.friendly,
  persona: 'friendly',
  language: 'auto',
  bannedPhrases: [],
  approvedPhrases: [],
  signOff: undefined,
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function phraseList(value: unknown, max = 25): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim().slice(0, 80)
    if (trimmed) out.push(trimmed)
    if (out.length >= max) break
  }
  return Array.from(new Set(out))
}

/**
 * Merge a stored (possibly partial, possibly hostile) voice row with the
 * preset it is based on. Anything unknown or out of range falls back to the
 * preset value, so a bad row can never produce an invalid prompt.
 */
export function resolveVoice(input?: Partial<BrandVoice> | null): BrandVoice {
  const persona = oneOf<VoicePersona>(input?.persona, VOICE_PERSONAS, DEFAULT_VOICE.persona)
  const preset = VOICE_PRESETS[persona]
  return {
    persona,
    emojiIntensity: oneOf<EmojiIntensity>(input?.emojiIntensity, EMOJI_INTENSITIES, preset.emojiIntensity),
    humorLevel: oneOf<HumorLevel>(input?.humorLevel, HUMOR_LEVELS, preset.humorLevel),
    messageLength: oneOf<MessageLength>(input?.messageLength, MESSAGE_LENGTHS, preset.messageLength),
    assertiveness: oneOf<Assertiveness>(input?.assertiveness, ASSERTIVENESS_LEVELS, preset.assertiveness),
    language: typeof input?.language === 'string' && input.language.trim()
      ? input.language.trim().slice(0, 16)
      : DEFAULT_VOICE.language,
    bannedPhrases: phraseList(input?.bannedPhrases),
    approvedPhrases: phraseList(input?.approvedPhrases),
    signOff: typeof input?.signOff === 'string' && input.signOff.trim()
      ? input.signOff.trim().slice(0, 120)
      : undefined,
  }
}

/** How many emoji a single message may carry, per voice and channel. */
export function maxEmojis(voice: BrandVoice, channel: 'email' | 'whatsapp' = 'email'): number {
  if (voice.emojiIntensity === 'off') return 0
  const base = voice.emojiIntensity === 'subtle' ? 1 : voice.emojiIntensity === 'balanced' ? 2 : 3
  // WhatsApp messages are short and conversational — one emoji already reads
  // as a lot in a 40-word message.
  return channel === 'whatsapp' ? Math.min(base, 1) : base
}

/** Word budget per message, per voice and channel. */
export function maxWords(voice: BrandVoice, channel: 'email' | 'whatsapp' = 'email'): number {
  const base = voice.messageLength === 'short' ? 35 : voice.messageLength === 'long' ? 90 : 55
  return channel === 'whatsapp' ? Math.min(base, 40) : base
}

/**
 * The prompt fragment that describes the voice. It is intentionally explicit
 * about what the model may NOT do — the deterministic validator enforces the
 * same rules, so a prompt-only control would be a suggestion, not a control.
 */
export function voicePromptBlock(voice: BrandVoice): string {
  const persona: Record<VoicePersona, string> = {
    friendly: 'warm, welcoming, like a shopkeeper who genuinely likes their customers',
    premium: 'polished and understated, like a concierge at an upscale boutique',
    playful: 'light-hearted and fun, like a playful shop assistant, never silly',
    minimal: 'terse and clear, one idea per message, no filler',
    expert: 'precise and informative, like a knowledgeable advisor, no hype',
  }
  const emoji: Record<EmojiIntensity, string> = {
    off: 'Do not use emoji at all.',
    subtle: 'At most ONE emoji in the whole message, only if it adds meaning.',
    balanced: 'At most TWO emoji in the whole message, spaced out, never in consecutive sentences.',
    playful: 'Emoji are allowed, but never more than three and never in a row.',
  }
  const humor: Record<HumorLevel, string> = {
    none: 'No jokes or playful asides.',
    light: 'Light, situational humour is fine when it genuinely fits.',
    playful: 'Playful humour is welcome when it fits the situation.',
  }
  const assertive: Record<Assertiveness, string> = {
    soft: 'Invite rather than push. No pressure language.',
    balanced: 'Confident and helpful, with a clear next step.',
    direct: 'Direct and plain. Say what the customer needs to know, briefly.',
  }
  const length: Record<MessageLength, string> = {
    short: 'Keep it under 35 words.',
    medium: 'Keep it under 55 words.',
    long: 'It may run up to 90 words, but every sentence must earn its place.',
  }

  const parts = [
    `VOICE: ${persona[voice.persona]}.`,
    `TONE: ${assertive[voice.assertiveness]}`,
    `LENGTH: ${length[voice.messageLength]}`,
    `EMOJI: ${emoji[voice.emojiIntensity]}`,
    `HUMOUR: ${humor[voice.humorLevel]}`,
  ]
  if (voice.approvedPhrases.length > 0) {
    parts.push(`PREFERRED VOCABULARY: when it fits naturally, use: ${voice.approvedPhrases.join(', ')}.`)
  }
  if (voice.bannedPhrases.length > 0) {
    parts.push(`NEVER USE: ${voice.bannedPhrases.join(', ')}.`)
  }
  if (voice.signOff) {
    parts.push(`SIGN-OFF: end with "${voice.signOff}".`)
  }
  if (voice.language && voice.language !== 'auto') {
    parts.push(`Write in this language: ${voice.language}.`)
  }
  parts.push(
    'NEVER claim to be a human, a specific employee, or to have taken an action you did not take. ' +
      'NEVER state scarcity, popularity, reviews, stock levels, guarantees or competitor prices — ' +
      'only facts that are given to you in the CONTEXT are allowed.'
  )
  return parts.join('\n')
}
