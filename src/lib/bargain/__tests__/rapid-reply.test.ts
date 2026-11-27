import { rapidReplyForTurn } from '../rapid-reply'

describe('rapid low-information replies', () => {
  it('answers a greeting deterministically without opening a price', () => {
    const result = rapidReplyForTurn({ mode: 'greeting', language: 'en', productTitle: 'Trail Shoes' })
    expect(result?.decision).toBe('chat')
    expect(result?.tactic).toBe('rapid_reply')
    expect(result?.reply).toMatch(/details|price/i)
    expect(result?.reply).not.toMatch(/\d/)
    expect(result?.metadata.aiSource).toBe('reflex')
    expect(result?.metadata.rapidReply).toBe(true)
  })

  it('localizes and sanitizes the product name', () => {
    const result = rapidReplyForTurn({
      mode: 'small_talk',
      language: 'hi',
      productTitle: '  Trail\u0000Shoes  ',
    })
    expect(result?.reply).toContain('Trail Shoes')
    expect(result?.reply).toMatch(/price|offer|detail|Trail Shoes|\u0915\u0940\u092e\u0924|\u091c\u093e\u0928\u0928\u093e|\u092c\u0924\u093e\u0928\u0940|\u0915\u093f\u0902\u092e\u0924|\u092d\u093e\u0935/i)
  })

  it('drops emoji unless the live turn allowed one', () => {
    expect(rapidReplyForTurn({ mode: 'emoji_only', language: 'en' })?.reply).not.toContain('🙂')
    const playful = rapidReplyForTurn({ mode: 'emoji_only', language: 'en', emojiBudget: 1 })
    expect(playful?.reply).toMatch(/[\uD83D\uDE42\uD83D\uDE0A\uD83D\uDE04]|Got it|Got you|Samajh|\u0938\u092e\u091d/i)
  })

  it('refuses to handle ordinary, price, question and discovery turns', () => {
    expect(rapidReplyForTurn({ mode: 'ordinary' })).toBeNull()
    expect(rapidReplyForTurn({ mode: 'price' })).toBeNull()
    expect(rapidReplyForTurn({ mode: 'question' })).toBeNull()
    expect(rapidReplyForTurn({ mode: 'discovery' })).toBeNull()
  })

  it('keeps hostile replies professional and claim-free', () => {
    const result = rapidReplyForTurn({ mode: 'insult', language: 'en', productTitle: 'Trail Shoes' })
    expect(result?.reply).toContain('respectful')
    expect(result?.reply).not.toMatch(/floor|minimum|discount|₹|\$/i)
  })

  it('answers trend chatter without claiming a trend or opening a price', () => {
    const result = rapidReplyForTurn({ mode: 'trend_talk', language: 'en', productTitle: 'Trail Shoes' })
    expect(result?.reply).toMatch(/won't guess|won't claim|trending|trend/i)
    expect(result?.reply).toContain('Trail Shoes')
    expect(result?.reply).not.toMatch(/floor|minimum|₹|\$/i)
  })

  it('has claim-free replies for random, joke, flattery and hesitation', () => {
    expect(rapidReplyForTurn({ mode: 'random', language: 'en', productTitle: 'Trail Shoes' })?.reply).toContain('scrambled')
    expect(rapidReplyForTurn({ mode: 'joke', language: 'en', productTitle: 'Trail Shoes' })?.reply).toMatch(/haha|fair one|details|price/i)
    expect(rapidReplyForTurn({ mode: 'flattery', language: 'en', productTitle: 'Trail Shoes' })?.reply).toMatch(/kind|thanks/i)
    expect(rapidReplyForTurn({ mode: 'hesitation', language: 'en', productTitle: 'Trail Shoes' })?.reply).toContain('No rush')
    expect(rapidReplyForTurn({ mode: 'hesitation', language: 'hi', productTitle: 'Trail Shoes' })?.reply).toMatch(/jaldi|soch|\u091c\u0932\u094d\u0926\u0940|\u091a\u093f\u0902\u0924\u093e|\u0930\u094b\u0915|\u092b\u093f\u091f|\u092d\u0930\u094b\u0938\u093e|Trail Shoes/i)

    for (const mode of ['random', 'joke', 'flattery', 'hesitation']) {
      const result = rapidReplyForTurn({ mode, language: 'en', productTitle: 'Trail Shoes' })
      expect(result?.reply).not.toMatch(/floor|minimum|₹|\$/i)
    }
  })
})
