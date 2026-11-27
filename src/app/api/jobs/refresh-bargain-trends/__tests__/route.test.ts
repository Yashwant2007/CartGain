import { GET, POST } from '@/app/api/jobs/refresh-bargain-trends/route'
import { refreshBargainTrends } from '@/lib/bargain/trend'
import { NextRequest } from 'next/server'

jest.mock('@/lib/bargain/trend', () => ({
  refreshBargainTrends: jest.fn(),
}))

const refreshMock = refreshBargainTrends as jest.Mock

function request(method: 'GET' | 'POST', secret?: string) {
  return new NextRequest('https://cart-gain.com/api/jobs/refresh-bargain-trends', {
    method,
    headers: secret
      ? { authorization: `Bearer ${secret}` }
      : {},
  })
}

describe('bargain trend refresh job', () => {
  const original = process.env.JOB_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JOB_SECRET = 'test-job-secret'
  })

  afterAll(() => {
    if (original === undefined) delete process.env.JOB_SECRET
    else process.env.JOB_SECRET = original
  })

  it('rejects unauthenticated requests', async () => {
    const res = await POST(request('POST'))
    expect(res.status).toBe(401)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('refreshes once for an authenticated POST', async () => {
    refreshMock.mockResolvedValue({ enabled: true, provider: 'wikimedia_pageviews', stores: 2, signals: 5, skipped: 0 })
    const res = await POST(request('POST', 'test-job-secret'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      status: 'ok',
      enabled: true,
      provider: 'wikimedia_pageviews',
      stores: 2,
      signals: 5,
      skipped: 0,
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('supports the configured daily cron GET', async () => {
    refreshMock.mockResolvedValue({ enabled: false, provider: 'wikimedia_pageviews', stores: 0, signals: 0, skipped: 0 })
    const res = await GET(request('GET', 'test-job-secret'))
    expect(res.status).toBe(200)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('returns a safe 500 when the provider registry throws', async () => {
    refreshMock.mockRejectedValue(new Error('provider failed'))
    const res = await POST(request('POST', 'test-job-secret'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ message: 'Something went wrong' })
  })
})
