/**
 * @jest-environment node
 */
import { GET, DELETE } from '@/app/api/campaigns/[id]/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    campaign: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    message: { deleteMany: jest.fn() },
    aBTest: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'

const prismaMock = prisma as unknown as {
  campaign: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock }
  message: { deleteMany: jest.Mock }
  aBTest: { deleteMany: jest.Mock }
  $transaction: jest.Mock
}
const authMock = getServerSession as jest.Mock

function req(method = 'GET') {
  return new NextRequest('https://cart-gain.com/api/campaigns/campaign-b', { method })
}
const params = { params: { id: 'campaign-b' } }

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-a' } })
})

describe('campaign tenant isolation', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(req(), params)).status).toBe(401)
    expect(prismaMock.campaign.findUnique).not.toHaveBeenCalled()
  })

  it('does not return another merchant\'s campaign', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'campaign-b', userId: 'user-b' })
    expect((await GET(req(), params)).status).toBe(401)
  })

  it('returns its own campaign', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'campaign-a', userId: 'user-a' })
    const res = await GET(req(), { params: { id: 'campaign-a' } })
    expect(res.status).toBe(200)
  })

  it('refuses to delete another merchant\'s campaign', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: 'campaign-b', userId: 'user-b' })
    const res = await DELETE(req('DELETE'), params)
    expect(res.status).toBe(401)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
