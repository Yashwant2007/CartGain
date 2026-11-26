jest.mock('@/lib/job-auth', () => ({
  requireJobAuth: jest.fn(),
}))

jest.mock('@/lib/bargain/trend', () => ({
  refreshBargainTrends: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { requireJobAuth } from '@/lib/job-auth'
import { refreshBargainTrends } from '@/lib/bargain/trend'
import { GET, POST } from '../route'

describe('refresh-bargain-trends job route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects unauthenticated callers before refreshing', async () => {
    ;(requireJobAuth as jest.Mock).mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const response = await POST(new NextRequest('https://cart-gain.com/api/jobs/refresh-bargain-trends'))
    expect(response.status).toBe(401)
    expect(refreshBargainTrends).not.toHaveBeenCalled()
  })

  it('returns bounded refresh counters for authenticated callers', async () => {
    ;(requireJobAuth as jest.Mock).mockResolvedValue(null)
    ;(refreshBargainTrends as jest.Mock).mockResolvedValue({ enabled: true, stores: 2, signals: 5, skipped: 1 })
    const response = await GET(new NextRequest('https://cart-gain.com/api/jobs/refresh-bargain-trends'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      enabled: true,
      storesRefreshed: 2,
      signalsRefreshed: 5,
      storesSkipped: 1,
    })
  })
})
