import { classifyRecoverySentiment, isNegativeRecoveryReply } from '@/lib/recovery/sentiment'

describe('classifyRecoverySentiment', () => {
  it('classifies unsubscribes and hostile replies as negative', () => {
    for (const text of [
      'STOP',
      'unsubscribe',
      'not interested, thanks',
      'please leave me alone',
      "don't message me again",
      'this is spam',
      'stop texting me',
    ]) {
      expect(classifyRecoverySentiment(text)).toBe('negative')
    }
  })

  it('classifies buying signals as positive', () => {
    for (const text of ['yes', 'how much?', 'tell me more', "I'll take it", 'is it available?']) {
      expect(classifyRecoverySentiment(text)).toBe('positive')
    }
  })

  it('treats unrelated or empty text as neutral', () => {
    expect(classifyRecoverySentiment('')).toBe('neutral')
    expect(classifyRecoverySentiment(null)).toBe('neutral')
    expect(classifyRecoverySentiment('what size is the blue one')).toBe('neutral')
  })

  it('prioritises a negative signal over a positive one', () => {
    expect(classifyRecoverySentiment('no thanks, not interested')).toBe('negative')
  })

  it('normalises case, punctuation and apostrophes', () => {
    expect(classifyRecoverySentiment('  STOOOP?? ')).toBe('neutral')
    expect(classifyRecoverySentiment("DON'T CONTACT ME")).toBe('negative')
    expect(classifyRecoverySentiment('Don’t email me')).toBe('negative')
  })

  it('does not read "not" inside an unrelated word as negative', () => {
    expect(classifyRecoverySentiment('I have another question')).toBe('neutral')
  })

  it('exposes the negative predicate', () => {
    expect(isNegativeRecoveryReply('stop')).toBe(true)
    expect(isNegativeRecoveryReply('ok')).toBe(false)
  })
})
