/**
 * @jest-environment node
 */
import { GET } from '@/app/api/recipients/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    customerIdentity: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/auth-context', () => ({
  authenticate: jest.fn(),
  hasPermission: jest.fn(),
}))
jest.mock('@/lib/recovery/recipients', () => ({
  canSendRecoveryEmail: jest.fn(() => true),
  normalizeEmailBasis: jest.fn(() => 'explicit'),
  normalizeRecipientPhone: jest.fn((p: string) => p),
  recordWhatsAppConsent: jest.fn(),
}))
jest.mock('@/lib/opt-out', () => ({ recordOptOut: jest.fn() }))
jest.mock('@/lib/whatsapp/config', () => ({
  isWhatsAppConfigured: jest.fn(() => false),
  resolveWhatsAppPhoneNumberId: jest.fn(() => null),
  resolveWhatsAppAppSecret: jest.fn(() => null),
}))

import prisma from '@/lib/db'
import { authenticate } from '@/lib/auth-context'

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  customerIdentity: { findMany: jest.Mock }
}
const authMock = authenticate as jest.Mock

function req(storeId?: string) {
  const q = storeId ? `?storeId=${storeId}` : ''
  return new NextRequest(`https://cart-gain.com/api/recipients${q}`, { method: 'GET' })
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ success: true, ctx: { userId: 'user-a' } })
})

describe('recipients tenant isolation', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' })
    expect((await GET(req('store-a'))).status).toBe(401)
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
  })

  it('does not list another merchant\'s recipients', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await GET(req('store-b'))
    expect(res.status).toBe(404)
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-b', userId: 'user-a' },
    })
    expect(prismaMock.customerIdentity.findMany).not.toHaveBeenCalled()
  })
})
