jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
}))

jest.mock('@/lib/services/bargain', () => ({
  chatFallback: jest.fn(() => 'Fallback reply'),
  classifySeriousness: jest.fn(() => 'serious'),
  negotiateStep: jest.fn(async () => ({ reply: 'Great question.', decision: 'chat', tactic: 'home_demo' })),
  ruleBasedDecision: jest.fn(() => ({ reply: 'Fallback offer.', decision: 'counter', counterOffer: 1180 })),
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'
import { negotiateStep } from '@/lib/services/bargain'

const request = (message: string, history: unknown[] = []) => new NextRequest('http://localhost/api/bargain/home-demo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message, history, attemptsUsed: 1 }),
})

describe('home bargain demo route', () => {
  beforeEach(() => jest.clearAllMocks())

  it('does not treat a product question as an offer', async () => {
    const res = await POST(request('What makes this serum special?'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.offerDetected).toBe(false)
    expect(data.offer).toBeNull()
    expect(negotiateStep).toHaveBeenCalledWith(
      expect.objectContaining({ originalPrice: 1299, minPrice: 1100 }),
      expect.any(Array),
      'What makes this serum special?',
      undefined,
      'home_demo',
    )
  })

  it('extracts a real bid and returns the engine counter', async () => {
    ;(negotiateStep as jest.Mock).mockResolvedValueOnce({
      reply: 'I can do ₹1,180.',
      decision: 'counter',
      counterOffer: 1180,
    })

    const res = await POST(request('₹999 please'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.offerDetected).toBe(true)
    expect(data.offer).toBe(999)
    expect(data.counterOffer).toBe(1180)
    expect(negotiateStep).toHaveBeenCalledWith(
      expect.objectContaining({ originalPrice: 1299, minPrice: 1100 }),
      expect.any(Array),
      '₹999 please',
      999,
      'home_demo',
    )
  })
})
