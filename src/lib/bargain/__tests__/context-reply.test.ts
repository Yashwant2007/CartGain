import { chatFallback, type NegotiationContext } from '@/lib/services/bargain'
import { contextFlavorPromptBlock, detectContextFlavor } from '../context-flavor'
import { analyzeLiveTurn } from '../live-turn'
import { rapidReplyForTurn } from '../rapid-reply'
import { COMPACT_SALESPERSON_PLAYBOOK, SALESPERSON_PLAYBOOK } from '../sales-playbook'

function ctx(overrides: Partial<NegotiationContext> = {}): NegotiationContext {
  return {
    storeName: 'Test Store',
    currencySymbol: '₹',
    originalPrice: 749.95,
    minPrice: 520,
    attemptsUsed: 1,
    maxAttempts: 3,
    persona: 'friendly_shopkeeper',
    language: 'hinglish',
    productTitle: 'Trail Shoes',
    ...overrides,
  }
}

describe('context-aware trendy sales replies', () => {
  it('detects political, devotional, fashion and meme cues from natural Hinglish', () => {
    expect(detectContextFlavor('bhai modi ji k liye thoda or aram krdo')).toBe('political')
    expect(detectContextFlavor('for the sake of BJP and bhagwan modi ji')).toBe('political')
    expect(detectContextFlavor('is jacket ka drip kya hai')).toBe('fashion')
    expect(detectContextFlavor('bhai ye meme bana deta hai')).toBe('meme')
    expect(detectContextFlavor('thoda aur aram kar do')).toBe('soft_nudge')
    expect(detectContextFlavor('what is the price')).toBeNull()
  })

  it('keeps the AI prompt culturally fluent, neutral and claim-free', () => {
    expect(contextFlavorPromptBlock('political')).toContain('never endorse')
    expect(contextFlavorPromptBlock('devotional')).toContain('never endorse')
    expect(contextFlavorPromptBlock('fashion')).toContain('Never invent a trend')
    expect(SALESPERSON_PLAYBOOK).toContain('CULTURAL FLUENCY THAT SELLS')
    expect(SALESPERSON_PLAYBOOK).toContain('Never endorse or attack')
    expect(COMPACT_SALESPERSON_PLAYBOOK).toContain('stay neutral on politics/religion')
  })

  it('never puts named politicians or deities in customer-facing prompt examples', () => {
    expect(contextFlavorPromptBlock('political')).not.toMatch(/modi|bjp|rahul|gandhi|bhagwan|krishna|allah/i)
    expect(contextFlavorPromptBlock('devotional')).not.toMatch(/modi|bjp|bhagwan|krishna|allah/i)
    expect(SALESPERSON_PLAYBOOK).not.toMatch(/modi ji ka reference|bhai modi|bhagwan wala/i)
  })

  it('reads the shopkeeper nudge as trend talk with safe live-turn guidance', () => {
    for (const message of [
      'bhai modi ji k liye thoda or aram krdo',
      'for the sake of BJP and bhagwan modi ji',
    ]) {
      const turn = analyzeLiveTurn({ message })
      expect(turn.mode).toBe('trend_talk')
      expect(turn.contextFlavor).toBe('political')
      expect(turn.humorAllowed).toBe(true)
      expect(turn.emojiBudget).toBe(1)
      expect(turn.prompt).toContain('never endorse')
      expect(turn.prompt).toContain('Never claim what is trending')
    }
  })

  it('sends a catchy, neutral Hinglish rapid reply with emoji and one price question', () => {
    const reply = rapidReplyForTurn({
      mode: 'trend_talk',
      language: 'hinglish',
      productTitle: 'Trail Shoes',
      emojiBudget: 2,
      message: 'bhai modi ji k liye thoda or aram krdo',
    })
    expect(reply?.reply).toContain('neutral')
    expect(reply?.reply).not.toMatch(/modi|bjp|bhagwan|desh/i)
    expect(reply?.reply).toMatch(/😄|🔥/)
    expect(reply?.reply).toMatch(/price|offer/i)
    expect(reply?.reply).not.toMatch(/floor|minimum|₹|give me your number/i)
    expect(reply?.metadata.contextFlavor).toBe('political')
  })

  it('strips emoji from culturally fluent replies for strict or voice-capped shoppers', () => {
    const reply = rapidReplyForTurn({
      mode: 'trend_talk',
      language: 'hinglish',
      productTitle: 'Trail Shoes',
      emojiBudget: 0,
      message: 'bhai modi ji k liye thoda or aram krdo',
    })
    expect(reply?.reply).not.toMatch(/[\uD800-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]/)
    expect(reply?.reply).toContain('price')
  })

  it('never falls back to a flat English acknowledgment for Hinglish cultural turns', () => {
    const first = chatFallback('bhai modi ji k liye thoda or aram krdo', ctx(), 2)
    const second = chatFallback('for the sake of BJP and bhagwan modi ji', ctx(), 2)
    for (const reply of [first, second]) {
      expect(reply).toMatch(/neutral|samajh gaya/i)
      expect(reply).not.toMatch(/modi|bjp|bhagwan|desh/i)
      expect(reply).toMatch(/😄|🔥/)
      expect(reply).toMatch(/price|offer/i)
      expect(reply).not.toMatch(/Understood|give me your number|tell me the figure|floor|minimum/i)
    }
  })

  it('keeps the offline cultural fallback neutral and emoji-free for strict negotiators', () => {
    const reply = chatFallback(
      'bhai modi ji k liye thoda or aram krdo',
      ctx({ persona: 'strict_negotiator', language: 'en' }),
      2,
    )
    expect(reply).toContain('neutral')
    expect(reply).not.toMatch(/😄|🔥|Modi ji|BJP|floor|minimum/i)
  })
})
