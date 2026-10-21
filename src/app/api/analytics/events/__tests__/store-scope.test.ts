jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(async () => ({ user: { id: 'user_1' } })),
}))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true })),
  clientIp: jest.fn(() => '127.0.0.1'),
}))
jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(async () => {}),
  CLIENT_FIREABLE_EVENTS: new Set(['onboarding_started', 'onboarding_completed']),
}))

const prismaMock = {
  store: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))

import { track } from '@/lib/analytics/track'
import { POST } from '../route'

const trackMock = track as jest.Mock

function request(body: unknown) {
  return new Request('https://cart-gain.com/api/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

describe('POST /api/analytics/events — store attribution', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('attributes the event to the requested store when the user owns it', async () => {
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store_b' })

    const res = await POST(request({ name: 'onboarding_started', storeId: 'store_b' }))

    expect(res.status).toBe(200)
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store_b', userId: 'user_1' },
      select: { id: true },
    })
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'store_b', userId: 'user_1' })
    )
  })

  it('refuses a store the user does not own', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)

    const res = await POST(request({ name: 'onboarding_started', storeId: 'store_someone_else' }))

    expect(res.status).toBe(404)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('falls back to the oldest store only when no storeId is supplied', async () => {
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store_oldest' })

    await POST(request({ name: 'onboarding_completed' }))

    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    expect(trackMock).toHaveBeenCalledWith(expect.objectContaining({ storeId: 'store_oldest' }))
  })

  it('rejects event names outside the allowlist', async () => {
    const res = await POST(request({ name: 'arbitrary_event' }))
    expect(res.status).toBe(400)
    expect(trackMock).not.toHaveBeenCalled()
  })
})
