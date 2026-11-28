import { applicationTerminationBody, restoredApplicationTerminationFromMessages } from '../application-termination'
import { I18N_LANGS, uiText } from '../i18n'

describe('applicationTerminationBody', () => {
  it('ends opt-outs without offering a price or escalation', () => {
    const body = applicationTerminationBody('opt_out', 'en')
    expect(body.terminal).toBe(true)
    expect(body.status).toBe('abandoned')
    expect(body.terminationKind).toBe('opt_out')
    expect(body.conversationState).toBe('CANCELLED')
    expect(body.escalation).toBeUndefined()
    expect(body.message).toBe(uiText('en', 'opt_out'))
    expect(body.engineResponse.decision).toBe('no_offer')
    expect(body.engineResponse.proposedOffer.kind).toBe('none')
    expect(JSON.stringify(body)).not.toMatch(/\d/)
  })

  it('ends human handoffs with an explicit escalation and safe contract', () => {
    const body = applicationTerminationBody('human_support', 'hinglish')
    expect(body.terminal).toBe(true)
    expect(body.terminationKind).toBe('human_support')
    expect(body.conversationState).toBe('HUMAN_SUPPORT_REQUIRED')
    expect(body.escalation).toBe('human_support_required')
    expect(body.message).toBe(uiText('hinglish', 'human_support'))
    expect(body.engineResponse.decision).toBe('escalate')
    expect(body.engineResponse.cta).toBeNull()
    expect(JSON.stringify(body)).not.toMatch(/\d/)
  })

  it('localizes the human-handoff copy in every supported language', () => {
    for (const lang of I18N_LANGS) {
      if (lang === 'en') continue
      expect(uiText(lang, 'human_support')).not.toBe(uiText('en', 'human_support'))
      expect(uiText(lang, 'human_support').length).toBeGreaterThan(20)
    }
  })
})

describe('restoredApplicationTerminationFromMessages', () => {
  it('restores the latest terminal handoff without exposing other metadata', () => {
    const body = applicationTerminationBody('human_support', 'en')
    const restored = restoredApplicationTerminationFromMessages([
      { role: 'customer', metadata: { terminationKind: 'opt_out' } },
      { role: 'ai', metadata: { source: 'internal', floorPrice: 100 } },
      {
        role: 'ai',
        metadata: {
          terminationKind: body.terminationKind,
          conversationState: body.conversationState,
          escalation: body.escalation,
          engineResponse: body.engineResponse,
          floorPrice: 100,
        },
      },
    ])

    expect(restored.terminationKind).toBe('human_support')
    expect(restored.conversationState).toBe('HUMAN_SUPPORT_REQUIRED')
    expect(restored.escalation).toBe('human_support_required')
    expect(restored.engineResponse?.message).toBe(body.message)
    expect(JSON.stringify(restored)).not.toContain('floorPrice')
  })

  it('returns an empty terminal state when no AI message carries one', () => {
    expect(restoredApplicationTerminationFromMessages([
      { role: 'customer', metadata: { terminationKind: 'opt_out' } },
      { role: 'ai', metadata: null },
      { role: 'system' },
    ])).toEqual({
      terminationKind: null,
      conversationState: null,
      escalation: null,
      engineResponse: null,
    })
  })
})
