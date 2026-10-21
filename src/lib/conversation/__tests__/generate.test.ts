jest.mock('@/lib/ai-client', () => ({
  getAiClient: jest.fn(),
  handleAiFailure: jest.fn(),
}))

import { getAiClient } from '@/lib/ai-client'
import { ConversationFacts } from '../facts'
import { DEFAULT_VOICE } from '../voice'
import { buildFallbackMessage, generateRecoveryMessage } from '../generate'
import { composeRecoveryMessage, stageForStep } from '../recovery'

const mockedGetAiClient = getAiClient as jest.Mock

function aiReturning(...contents: string[]) {
  const create = jest.fn()
  for (const content of contents) {
    create.mockResolvedValueOnce({ choices: [{ message: { content } }] })
  }
  mockedGetAiClient.mockReturnValue({ client: { chat: { completions: { create } } }, tier: 'primary' })
  return create
}

const facts: ConversationFacts = {
  storeName: 'Acme',
  currencySymbol: '₹',
  items: [{ name: 'Vitamin C Serum', price: 1200, quantity: 1 }],
  total: 1200,
  cartUrl: 'https://cart-gain.com/r/cart_1?c=email',
  customerName: 'Asha',
  channel: 'email',
}

const baseArgs = {
  facts,
  voice: DEFAULT_VOICE,
  stage: 'reminder_1' as const,
  storeId: 'store_1',
  variantSeed: 'store_1:email:0',
  fallback: (f: ConversationFacts) => buildFallbackMessage(f, { subjectPrefix: 'Still thinking it over?' }),
}

describe('stageForStep', () => {
  it('maps steps to the three reminder stages', () => {
    expect(stageForStep(0)).toBe('reminder_1')
    expect(stageForStep(1)).toBe('reminder_2')
    expect(stageForStep(2)).toBe('reminder_3')
    expect(stageForStep(9)).toBe('reminder_3')
  })
})

describe('generateRecoveryMessage', () => {
  afterEach(() => {
    mockedGetAiClient.mockReset()
  })

  it('uses a safe, fact-only template when no AI client is available', async () => {
    mockedGetAiClient.mockReturnValue(null)
    const result = await generateRecoveryMessage(baseArgs)
    expect(result.source).toBe('fallback')
    expect(result.body).toContain('Vitamin C Serum')
    expect(result.body).toContain('₹1200.00')
    expect(result.body).not.toMatch(/best ?sell|selling out|last chance|expires today/i)
    expect(result.subject).toBeTruthy()
  })

  it('returns validated model copy when the model obeys the rules', async () => {
    aiReturning(JSON.stringify({ subject: 'Your serum is saved', body: 'Hi Asha, your Vitamin C Serum is still saved. Whenever you are ready.' }))
    const result = await generateRecoveryMessage(baseArgs)
    expect(result.source).toBe('ai')
    expect(result.subject).toBe('Your serum is saved')
    expect(result.body).toContain('Vitamin C Serum')
  })

  it('retries once and accepts the corrected copy', async () => {
    aiReturning(
      JSON.stringify({ subject: 'Last chance!', body: 'Our bestseller is selling out fast!' }),
      JSON.stringify({ subject: 'Your cart', body: 'Hi Asha, your Vitamin C Serum is still saved.' })
    )
    const result = await generateRecoveryMessage(baseArgs)
    expect(result.source).toBe('ai_retry')
    expect(result.body).not.toMatch(/selling out/i)
  })

  it('falls back when the model keeps fabricating claims', async () => {
    aiReturning(
      JSON.stringify({ subject: 'Last chance', body: 'Our bestseller is selling out fast!' }),
      JSON.stringify({ subject: 'Hurry', body: 'Everyone is obsessed — this expires today!' })
    )
    const result = await generateRecoveryMessage(baseArgs)
    expect(result.source).toBe('fallback')
    expect(result.body).not.toMatch(/bestseller|selling out|expires today/i)
    expect(result.issues.some((i) => i.severity === 'block')).toBe(true)
  })

  it('rejects a subject with more emoji than the voice allows', async () => {
    aiReturning(
      JSON.stringify({ subject: 'Saved ✨ 🛍️ 🚚 💫', body: 'Hi Asha, your serum is saved.' }),
      JSON.stringify({ subject: 'Saved ✨ 🛍️ 🚚 💫', body: 'Hi Asha, your serum is saved.' })
    )
    const result = await generateRecoveryMessage({ ...baseArgs, voice: { ...DEFAULT_VOICE, emojiIntensity: 'subtle' } })
    // The model's subject is rejected on both attempts, so the safe fallback
    // subject is used instead.
    expect(result.source).toBe('fallback')
    expect(result.subject).not.toContain('✨')
  })

  it('mentions an authorised discount in the fallback and keeps it valid', async () => {
    mockedGetAiClient.mockReturnValue(null)
    const result = await generateRecoveryMessage({
      ...baseArgs,
      facts: { ...facts, discount: { code: 'SAVE10', value: 10, type: 'percentage' } },
    })
    expect(result.body).toContain('SAVE10')
    expect(result.issues.filter((i) => i.severity === 'block')).toHaveLength(0)
  })
})

describe('composeRecoveryMessage', () => {
  afterEach(() => {
    mockedGetAiClient.mockReset()
  })

  it('produces a valid WhatsApp message using the same layer', async () => {
    mockedGetAiClient.mockReturnValue(null)
    const result = await composeRecoveryMessage({
      storeId: 'store_1',
      storeName: 'Acme',
      currencySymbol: '₹',
      customerName: 'Asha',
      items: [{ name: 'Vitamin C Serum', price: 1200, quantity: 1 }],
      total: 1200,
      cartUrl: 'https://cart-gain.com/r/cart_1?c=whatsapp',
      channel: 'whatsapp',
      step: 1,
      voice: DEFAULT_VOICE,
    })
    expect(result.source).toBe('fallback')
    expect(result.issues.filter((i) => i.severity === 'block')).toHaveLength(0)
    expect(result.body).toContain('Vitamin C Serum')
  })
})
