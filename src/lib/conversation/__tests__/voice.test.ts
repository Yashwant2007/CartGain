import {
  DEFAULT_VOICE,
  VOICE_PRESETS,
  maxEmojis,
  maxWords,
  resolveVoice,
  voicePromptBlock,
} from '../voice'

describe('resolveVoice', () => {
  it('returns the default voice for empty input', () => {
    expect(resolveVoice(null)).toEqual(DEFAULT_VOICE)
  })

  it('merges a persona preset with explicit overrides', () => {
    const voice = resolveVoice({ persona: 'premium' })
    expect(voice).toMatchObject(VOICE_PRESETS.premium)
    expect(voice.persona).toBe('premium')
    // The preset's own traits are kept where no override is given.
    expect(voice.emojiIntensity).toBe('subtle')
  })

  it('lets explicit traits win over the preset', () => {
    const voice = resolveVoice({ persona: 'playful', emojiIntensity: 'off' })
    expect(voice.persona).toBe('playful')
    expect(voice.emojiIntensity).toBe('off')
  })

  it('falls back to the preset for unknown or invalid values', () => {
    const voice = resolveVoice({
      persona: 'shouty',
      emojiIntensity: 'max',
      humorLevel: 'dark',
      messageLength: 'epic',
      assertiveness: 'rude',
    } as any)
    expect(voice.persona).toBe('friendly')
    expect(voice.emojiIntensity).toBe(VOICE_PRESETS.friendly.emojiIntensity)
  })

  it('normalises phrase lists: trims, drops empties and dedupes', () => {
    const voice = resolveVoice({ bannedPhrases: ['  dup  ', 'dup', '', '   ', 'other'] })
    expect(voice.bannedPhrases).toEqual(['dup', 'other'])
  })

  it('caps the phrase list at 25 entries', () => {
    const many = Array.from({ length: 40 }, (_, i) => `phrase-${i}`)
    const voice = resolveVoice({ bannedPhrases: many })
    expect(voice.bannedPhrases).toHaveLength(25)
    expect(voice.bannedPhrases[0]).toBe('phrase-0')
  })

  it('ignores non-string phrase entries', () => {
    const voice = resolveVoice({ bannedPhrases: ['ok', 42, null, { x: 1 }] } as any)
    expect(voice.bannedPhrases).toEqual(['ok'])
  })
})

describe('channel limits', () => {
  it('allows no emoji when the voice forbids them', () => {
    expect(maxEmojis(resolveVoice({ emojiIntensity: 'off' }), 'email')).toBe(0)
    expect(maxEmojis(resolveVoice({ emojiIntensity: 'off' }), 'whatsapp')).toBe(0)
  })

  it('caps WhatsApp emoji at one even for the most playful voice', () => {
    const playful = resolveVoice({ persona: 'playful', emojiIntensity: 'playful' })
    expect(maxEmojis(playful, 'whatsapp')).toBe(1)
    expect(maxEmojis(playful, 'email')).toBe(3)
  })

  it('keeps WhatsApp words short', () => {
    const long = resolveVoice({ messageLength: 'long' })
    expect(maxWords(long, 'email')).toBe(90)
    expect(maxWords(long, 'whatsapp')).toBe(40)
  })
})

describe('voicePromptBlock', () => {
  it('always states the factual hard rules', () => {
    const block = voicePromptBlock(DEFAULT_VOICE)
    expect(block).toContain('NEVER claim to be a human')
    expect(block).toContain('NEVER state scarcity')
  })

  it('includes merchant vocabulary rules', () => {
    const block = voicePromptBlock(
      resolveVoice({ bannedPhrases: ['cheap'], approvedPhrases: ['handmade'] })
    )
    expect(block).toContain('NEVER USE: cheap')
    expect(block).toContain('handmade')
  })

  it('includes a sign-off and language when configured', () => {
    const block = voicePromptBlock(resolveVoice({ signOff: '— The team', language: 'hi' }))
    expect(block).toContain('end with "— The team"')
    expect(block).toContain('Write in this language: hi')
  })
})
