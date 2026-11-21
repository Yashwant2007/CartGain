import { buildSystemPrompt, VALID_BARGAIN_TACTICS, type NegotiationContext } from '../../services/bargain'
import { neutralSignals } from '../behavior'
import { COMPACT_SALESPERSON_PLAYBOOK, SALESPERSON_PLAYBOOK } from '../sales-playbook'

const analysis = {
  behavior: 'first_timer' as const,
  offTopicCount: 0,
  concessionCount: 0,
  lastAIOffer: null,
  seriousness: 'casual' as const,
  signals: neutralSignals(),
}

const ctx: NegotiationContext = {
  storeName: 'T',
  currencySymbol: '₹',
  originalPrice: 1000,
  minPrice: 800,
  attemptsUsed: 1,
  maxAttempts: 3,
  persona: 'friendly_shopkeeper',
}

describe('salesperson playbook', () => {
  it('covers consultative selling and real-time bargaining in both prompt sizes', () => {
    for (const playbook of [SALESPERSON_PLAYBOOK, COMPACT_SALESPERSON_PLAYBOOK]) {
      expect(playbook).toMatch(/diagnose/i)
      expect(playbook).toMatch(/hesitation/i)
      expect(playbook).toMatch(/lowball/i)
      expect(playbook).toMatch(/competitor/i)
      expect(playbook).toMatch(/one (?:clear )?CTA/i)
      expect(playbook).not.toMatch(/last chance|buy now|hurry/i)
    }
  })

  it('is injected into full and compact system prompts', () => {
    expect(buildSystemPrompt(ctx, analysis)).toContain('WORLD-CLASS SALES BEHAVIOR')
    expect(buildSystemPrompt(ctx, analysis, { compact: true })).toContain('SALES BEHAVIOR')
  })

  it('never exposes scarcity/urgency as selectable tactics', () => {
    const prompt = buildSystemPrompt(ctx, analysis)
    expect(prompt).not.toContain('quality_reframe, scarcity, urgency')
    expect(prompt).toContain('quality_reframe, diagnosis, value_frame')
    expect(VALID_BARGAIN_TACTICS.has('urgency')).toBe(false)
    expect(VALID_BARGAIN_TACTICS.has('scarcity')).toBe(false)
    expect(VALID_BARGAIN_TACTICS.has('diagnosis')).toBe(true)
    expect(VALID_BARGAIN_TACTICS.has('face_saving')).toBe(true)
  })
})
