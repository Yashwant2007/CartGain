jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(async () => ({ user: { id: 'user_1' } })),
}))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const prismaMock = {
  campaign: { findUnique: jest.fn() },
  message: { findMany: jest.fn() },
  cart: { findMany: jest.fn() },
  recoveredCart: { findMany: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))

import { GET } from '../route'

function request() {
  return new Request('https://cart-gain.com/api/campaigns/camp_1/analytics') as any
}

describe('GET /api/campaigns/[id]/analytics — delivery truthfulness', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: 'camp_1',
      userId: 'user_1',
      name: 'Recovery',
      channels: ['email'],
    })
    prismaMock.cart.findMany.mockResolvedValue([])
    prismaMock.recoveredCart.findMany.mockResolvedValue([])
  })

  it('does not count accepted-but-undelivered messages as delivered', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      { status: 'sent', clickedAt: null, convertedAt: null },
      { status: 'sent', clickedAt: null, convertedAt: null },
      { status: 'delivered', clickedAt: new Date(), convertedAt: null },
      { status: 'failed', clickedAt: null, convertedAt: null },
    ])

    const res = await GET(request(), { params: { id: 'camp_1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.analytics.totalMessagesSent).toBe(3) // sent + delivered, not failed
    expect(body.analytics.totalMessagesDelivered).toBe(1) // only the real receipt
    expect(body.analytics.deliveryRate).toBeCloseTo(33.3, 1)
  })

  it('reports 0% delivery when nothing has a receipt', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      { status: 'sent', clickedAt: null, convertedAt: null },
      { status: 'sent', clickedAt: null, convertedAt: null },
    ])

    const res = await GET(request(), { params: { id: 'camp_1' } })
    const body = await res.json()

    expect(body.analytics.totalMessagesDelivered).toBe(0)
    expect(body.analytics.deliveryRate).toBe(0)
  })
})
