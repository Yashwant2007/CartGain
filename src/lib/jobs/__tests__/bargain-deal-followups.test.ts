/**
 * @jest-environment node
 */
import { processBargainDealFollowups } from '../processBargainDealFollowups'
import prisma from '@/lib/db'
import { canSendToIdentity } from '@/lib/recovery/journeys/service'
import { sendEmail } from '@/lib/services/email'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainConfig: { findMany: jest.fn() },
    bargainSession: { findMany: jest.fn(), findUnique: jest.fn() },
    bargainDealFollowup: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    customerIdentity: { findFirst: jest.fn() },
    cart: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/recovery/journeys/service', () => ({ canSendToIdentity: jest.fn(async () => ({ ok: true })) }))
jest.mock('@/lib/services/email', () => ({ sendEmail: jest.fn(async () => ({ success: true, messageId: 'em_1' })) }))
jest.mock('@/lib/services/whatsapp', () => ({ sendWhatsAppMessage: jest.fn(async () => ({ success: true })) }))

const p = prisma as any
const gate = canSendToIdentity as jest.Mock
const email = sendEmail as jest.Mock

const baseSession = {
  id: 's1',
  storeId: 'store-1',
  status: 'accepted',
  purchasedAt: null,
  expiredAt: new Date(Date.now() + 3600_000),
  purchaseUrl: 'https://cart-gain.com/r/abc',
  finalPrice: 950,
  customerEmail: 'a@b.com',
  customerPhone: null,
  cartToken: null,
  createdAt: new Date(Date.now() - 30 * 60000),
  store: { id: 'store-1', name: 'GlowCo', domain: 'glow.myshopify.com', currency: 'INR' },
}

beforeEach(() => {
  jest.clearAllMocks()
  gate.mockResolvedValue({ ok: true })
  email.mockResolvedValue({ success: true, messageId: 'em_1' })
  p.bargainConfig.findMany.mockResolvedValue([
    { storeId: 'store-1', dealFollowupDelaysMinutes: [15, 180, 1200], dealFollowupMax: 3 },
  ])
  p.bargainDealFollowup.findMany.mockResolvedValue([])
  p.bargainDealFollowup.create.mockResolvedValue({ id: 'f1' })
  p.bargainDealFollowup.update.mockResolvedValue({})
  p.customerIdentity.findFirst.mockResolvedValue(null)
  p.cart.findUnique.mockResolvedValue(null)
})

describe('processBargainDealFollowups', () => {
  it('sends an email reminder for a due accepted-but-unpaid deal', async () => {
    p.bargainSession.findMany.mockResolvedValue([baseSession])
    p.bargainSession.findUnique.mockResolvedValue(baseSession)
    const res = await processBargainDealFollowups()
    expect(res.sent).toBe(1)
    expect(email).toHaveBeenCalledTimes(1)
    expect(p.bargainDealFollowup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 0, channel: 'email' }) }),
    )
  })

  it('is idempotent — a claimed (session, stage, channel) is skipped, never double-sent', async () => {
    p.bargainSession.findMany.mockResolvedValue([baseSession])
    p.bargainSession.findUnique.mockResolvedValue(baseSession)
    p.bargainDealFollowup.findMany.mockResolvedValue([{ stage: 0 }])
    // stage 0 already sent; stage 1 not yet due at 30 min
    const res = await processBargainDealFollowups()
    expect(res.sent).toBe(0)
    expect(email).not.toHaveBeenCalled()
  })

  it('never sends when the deal was already purchased', async () => {
    p.bargainSession.findMany.mockResolvedValue([baseSession])
    p.bargainSession.findUnique.mockResolvedValue({ ...baseSession, purchasedAt: new Date() })
    const res = await processBargainDealFollowups()
    expect(res.sent).toBe(0)
    expect(email).not.toHaveBeenCalled()
  })

  it('never sends when the deal has expired', async () => {
    p.bargainSession.findMany.mockResolvedValue([baseSession])
    p.bargainSession.findUnique.mockResolvedValue({ ...baseSession, expiredAt: new Date(Date.now() - 1000) })
    const res = await processBargainDealFollowups()
    expect(res.sent).toBe(0)
    expect(email).not.toHaveBeenCalled()
  })

  it('respects consent — an opted-out identity is skipped', async () => {
    p.bargainSession.findMany.mockResolvedValue([baseSession])
    p.bargainSession.findUnique.mockResolvedValue(baseSession)
    p.customerIdentity.findFirst.mockResolvedValue({ id: 'i1', consentEmail: false, optedOutAt: new Date() })
    gate.mockResolvedValue({ ok: false, reason: 'opted_out' })
    const res = await processBargainDealFollowups()
    expect(res.sent).toBe(0)
    expect(email).not.toHaveBeenCalled()
  })

  it('records a failure without throwing when the email provider fails', async () => {
    p.bargainSession.findMany.mockResolvedValue([baseSession])
    p.bargainSession.findUnique.mockResolvedValue(baseSession)
    email.mockResolvedValue({ success: false, error: 'boom' })
    const res = await processBargainDealFollowups()
    expect(res.failed).toBe(1)
    expect(p.bargainDealFollowup.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    )
  })

  it('does nothing when no store has deal follow-up enabled', async () => {
    p.bargainConfig.findMany.mockResolvedValue([])
    const res = await processBargainDealFollowups()
    expect(res.sent).toBe(0)
    expect(p.bargainSession.findMany).not.toHaveBeenCalled()
  })
})
