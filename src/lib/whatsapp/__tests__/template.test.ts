import {
  assertTemplateText,
  sanitizeTemplateText,
  WhatsAppTemplateParamError,
} from '../template'

describe('WhatsApp template parameter sanitisation', () => {
  it('escapes placeholder braces so copy cannot alter the approved template', () => {
    expect(sanitizeTemplateText('Hi {{name}}, {{1}}')).toBe('Hi { {name} }, { {1} }')
  })

  it('strips control characters and collapses newlines/tabs to spaces', () => {
    expect(sanitizeTemplateText('a\u0000b\r\nc\td\u0007e')).toBe('a b c d e')
  })

  it('trims and collapses repeated whitespace', () => {
    expect(sanitizeTemplateText('  hello   world  ')).toBe('hello world')
  })

  it('truncates to the Meta limit and keeps a marker', () => {
    const output = sanitizeTemplateText('x'.repeat(1200), 100)
    expect(output.length).toBe(100)
    expect(output.endsWith('…')).toBe(true)
  })

  it('rejects an empty required parameter', () => {
    expect(() => assertTemplateText('body', '   ')).toThrow(WhatsAppTemplateParamError)
  })

  it('returns sanitised text for a non-empty parameter', () => {
    expect(assertTemplateText('body', '  your cart {{1}} ', 50)).toBe('your cart { {1} }')
  })
})
