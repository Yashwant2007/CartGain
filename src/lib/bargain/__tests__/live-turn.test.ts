import { analyzeSocialSignals } from '../behavior'
import { analyzeLiveTurn, voiceAdjustedLiveTurn } from '../live-turn'
import { resolveVoice } from '@/lib/conversation/voice'

describe('live turn analysis', () => {
  it('reads keyboard mash as random low-information noise, not a bid', () => {
    const turn = analyzeLiveTurn({ message: 'asdfghjkl' })
    expect(turn.mode).toBe('random')
    expect(turn.compact).toBe(true)
    expect(turn.noPrice).toBe(true)
  })

  it('reads jokes and hesitation without opening a price', () => {
    const joke = analyzeLiveTurn({ message: 'haha that is funny' })
    expect(joke.mode).toBe('joke')
    expect(joke.humorAllowed).toBe(true)
    expect(joke.noPrice).toBe(true)

    const signals = analyzeSocialSignals({ currentMessage: "I'm not sure" })
    const hesitation = analyzeLiveTurn({ message: "I'm not sure", signals })
    expect(hesitation.mode).toBe('hesitation')
    expect(hesitation.compact).toBe(true)
    expect(hesitation.noPrice).toBe(true)
  })

  it('lets merchant voice cap emoji and disable humor without changing the mode', () => {
    const playful = analyzeLiveTurn({ message: 'haha nice one' })
    const adjusted = voiceAdjustedLiveTurn(playful, resolveVoice({ persona: 'minimal' }))
    expect(adjusted.mode).toBe(playful.mode)
    expect(adjusted.emojiBudget).toBe(0)
    expect(adjusted.humorAllowed).toBe(false)
  })

  it('keeps a price complaint human when it also carries casual trend context', () => {
    const turn = analyzeLiveTurn({
      message: 'broo this is too much i have to buy gta 6 i am saving money pls understand',
      intent: 'PRICE_ONLY',
    })
    expect(turn.mode).toBe('price')
    expect(turn.noPrice).toBe(false)
    expect(turn.humorAllowed).toBe(true)
    expect(turn.prompt).toContain('casual/trend context')
    expect(turn.prompt).toContain('never echo them as offers')
  })

  it('reads trend chatter without treating a title number as a bid', () => {
    const turn = analyzeLiveTurn({ message: 'anyone else hyped for gta 6?' })
    expect(turn.mode).toBe('trend_talk')
    expect(turn.compact).toBe(true)
    expect(turn.noPrice).toBe(true)
    expect(turn.prompt).toContain('without claiming what is trending')
  })
})
