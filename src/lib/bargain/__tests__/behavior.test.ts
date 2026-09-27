import {
  extractName,
  analyzeSocialSignals,
  socialSignalsToPromptBlock,
  neutralSignals,
} from '../behavior'

describe('extractName — only honest self-introductions', () => {
  const cases: [string, string][] = [
    ["I'm Rahul", 'Rahul'],
    ["i am rahul", 'rahul'],
    ['my name is Priya', 'Priya'],
    ["My name's Dev", 'Dev'],
    ['this is Aarav. I want a better price', 'Aarav'],
    ['hi, I am Arjun', 'Arjun'],
    ['Hi, this is Meera', 'Meera'],
    ['hey my name is Sai Rahul', 'Sai Rahul'],
    ['please call me Kavya', 'Kavya'],
    ['I am called Tanvi', 'Tanvi'],
  ]
  it.each(cases)('detects %s → %s', (msg, expected) => {
    expect(extractName(msg)).toBe(expected)
  })

  const negatives: string[] = [
    'i am looking for a better price',
    'i am trying to buy this',
    'this is amazing',
    'this is too much',
    'i am sure you can do better',
    'my name is not important right now',
    'i have ₹500 to spend',
    'can you do 700?',
    'hi there',
    'hey you',
    'i am interested in this product',
    'i am sorry but no',
    'bro can you help me out',
  ]
  it.each(negatives)('rejects %s — not a shared name', (msg) => {
    expect(extractName(msg)).toBeNull()
  })

  it('does not read the product title as a name', () => {
    expect(extractName('this is Gold, can you do better?', ['Gold'])) .toBeNull()
    expect(extractName('I want this Gold series watch for less', ['Gold'])).toBeNull()
  })

  it('keeps a single clean name without trailing punctuation', () => {
    expect(extractName("I'm Rahul, actually.")).toBe('Rahul')
  })
})

describe('analyzeSocialSignals — reads conversational warmth', () => {
  it('greeting + name + politeness from one warm opener', () => {
    const s = analyzeSocialSignals({ currentMessage: "Hi, I'm Rahul — please give me a good price, thanks!" })
    expect(s.name).toBe('Rahul')
    expect(s.greeted).toBe(true)
    expect(s.polite).toBe(true)
    expect(s.emotion).toBe('neutral')
  })

  it('marks very short replies as terse', () => {
    expect(analyzeSocialSignals({ currentMessage: '800' }).terse).toBe(true)
    expect(analyzeSocialSignals({ currentMessage: 'best you can do?' }).terse).toBe(false)
  })

  it('marks long messages as verbose', () => {
    const long = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ')
    expect(analyzeSocialSignals({ currentMessage: long }).verbose).toBe(true)
  })

  it('detects urgency framing', () => {
    expect(analyzeSocialSignals({ currentMessage: 'I need it by tomorrow, can you hurry?' }).urgent).toBe(true)
    expect(analyzeSocialSignals({ currentMessage: 'what is the best price' }).urgent).toBe(false)
  })

  it('frustration beats excited/playful when both are present', () => {
    const s = analyzeSocialSignals({ currentMessage: 'this is TOO expensive, ridiculous!!' })
    expect(s.emotion).toBe('frustrated')
  })

  it('distinguishes the other emotions', () => {
    expect(analyzeSocialSignals({ currentMessage: 'is this genuine or a scam?' }).emotion).toBe('skeptical')
    expect(analyzeSocialSignals({ currentMessage: 'hmm maybe, let me think' }).emotion).toBe('hesitant')
    expect(analyzeSocialSignals({ currentMessage: 'sorry for the delay!' }).emotion).toBe('apologetic')
    expect(analyzeSocialSignals({ currentMessage: 'haha nice one, chalo!' }).emotion).toBe('playful')
    expect(analyzeSocialSignals({ currentMessage: 'wow this looks amazing!!' }).emotion).toBe('excited')
    expect(analyzeSocialSignals({ currentMessage: 'what is your price' }).emotion).toBe('neutral')
  })

  it('flags enthusiasm, caps emphasis, direct demands and questions', () => {
    expect(analyzeSocialSignals({ currentMessage: 'this deal is amazing!!!' }).enthusiastic).toBe(true)
    expect(analyzeSocialSignals({ currentMessage: 'I NEED THE BEST PRICE NOW' }).capsEmphasis).toBe(true)
    expect(analyzeSocialSignals({ currentMessage: 'give me it for 500' }).directDemand).toBe(true)
    expect(analyzeSocialSignals({ currentMessage: 'CAN you do 800?' }).question).toBe(true)
  })

  it('re-asks when the same topic repeats almost verbatim', () => {
    const history = [{ role: 'customer' as const, content: 'can you do 1000 for this' }]
    expect(analyzeSocialSignals({ history, currentMessage: 'can you do 1000?' }).reasking).toBe(true)
    expect(analyzeSocialSignals({ history, currentMessage: 'is it available in stock now?' }).reasking).toBe(false)
  })

  it('remembers a name shared in an earlier message', () => {
    const history = [{ role: 'customer' as const, content: "I'm Neha" }]
    const s = analyzeSocialSignals({ history, currentMessage: 'ok then 700 final' })
    expect(s.name).toBe('Neha')
  })

  it('does not invent a name from product/store words in history', () => {
    const history = [{ role: 'customer' as const, content: 'this is Gold, right?' }]
    const s = analyzeSocialSignals({ history, currentMessage: 'so what is best', exclusions: ['Gold'] })
    expect(s.name).toBeNull()
  })
})

describe('socialSignalsToPromptBlock — tells the AI how to respond', () => {
  it('emits a friendly + name-guidance line when a name is shared', () => {
    const block = socialSignalsToPromptBlock({ ...neutralSignals(), name: 'Rahul' })
    expect(block).toContain('Rahul')
    expect(block).toMatch(/warmly ONCE/)
  })

  it('emits a mirroring line for each active signal', () => {
    const block = socialSignalsToPromptBlock({
      ...neutralSignals(),
      terse: true,
      urgent: true,
      emotion: 'frustrated',
      polite: true,
      reasking: true,
    })
    expect(block).toContain('≤3 words')
    expect(block).toContain('time-sensitive')
    expect(block).toContain('frustrated')
    expect(block).toContain('polite/courteous')
    expect(block).toContain('RE-ASKING')
  })

  it('emits a praise/enthusiasm line and caps warning', () => {
    const block = socialSignalsToPromptBlock({ ...neutralSignals(), enthusiastic: true, capsEmphasis: true })
    expect(block).toContain('enthusiastic')
    expect(block).toContain('ALL CAPS')
  })

  it('returns empty for a neutral signal set (keeps the prompt tight)', () => {
    expect(socialSignalsToPromptBlock(neutralSignals())).toBe('')
  })
})