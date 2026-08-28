import { detectLanguage } from '../language'

describe('detectLanguage', () => {
  it('detects Devanagari script as Hindi (with Marathi markers as Marathi)', () => {
    expect(detectLanguage('मुझे ₹400 में दे दो')).toBe('hi')
    expect(detectLanguage('ये कितने का है?')).toBe('hi')
    expect(detectLanguage('है कितना भाव?')).toBe('hi')
  })

  it('detects Marathi from Marathi-specific markers', () => {
    expect(detectLanguage('मला ₹300 पुरे आहेत')).toBe('mr')
    expect(detectLanguage('नाही, किती द्याल?')).toBe('mr')
    expect(detectLanguage('आहे पण किंमत कमी करा')).toBe('mr')
  })

  it('detects South Indian scripts', () => {
    expect(detectLanguage('இதை ₹1200 க்கு கிடைக்குமா?')).toBe('ta')
    expect(detectLanguage('దీన్ని ₹1000 కి ఇస్తారా?')).toBe('te')
    expect(detectLanguage('ഇത് ₹1100 ന് കിട്ടുമോ?')).toBe('ml')
    expect(detectLanguage('ಇದು ₹900 ಕ್ಕೆ ಸಿಗುತ್ತದೆಯೇ?')).toBe('kn')
  })

  it('detects Eastern and Western scripts', () => {
    expect(detectLanguage('এটা কি ₹900 এ হবে?')).toBe('bn')
    expect(detectLanguage('ଏହା ₹800 ରେ ମିଳିବ କି?')).toBe('or')
    expect(detectLanguage('આ ₹1100 માં આપશો?')).toBe('gu')
    expect(detectLanguage('ਇਹ ਦਾ ਭਾਅ ਕੀ ਹੈ?')).toBe('pa')
  })

  it('detects Hinglish from high-signal Roman-script Hindi words', () => {
    expect(detectLanguage('bhai thoda karo na, 400 nahi chalega')).toBe('hinglish')
    expect(detectLanguage('acha yaar, chahiye toh yeh hai')).toBe('hinglish')
    expect(detectLanguage('ek baar batao kya rate hai?')).toBe('hinglish')
  })

  it('detects plain English when no Hinglish markers exist', () => {
    expect(detectLanguage('I will take it for 500')).toBe('en')
    expect(detectLanguage('Can you go a little lower please?')).toBe('en')
    expect(detectLanguage("What's your best offer?")).toBe('en')
  })

  it('returns null for empty / numeric-only / emoji-only input', () => {
    expect(detectLanguage('')).toBeNull()
    expect(detectLanguage('   ')).toBeNull()
    expect(detectLanguage('₹400')).toBeNull()
    expect(detectLanguage('😊👍')).toBeNull()
  })

  it('prefers the script when a message mixes scripts and Latin', () => {
    expect(detectLanguage('yeh theek nahi है')).toBe('hi')
    expect(detectLanguage('it is too expensive, இது mele')).toBe('ta')
  })
})