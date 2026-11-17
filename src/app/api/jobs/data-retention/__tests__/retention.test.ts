/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

const prismaMock = {
  $executeRawUnsafe: jest.fn(),
  cart: { updateMany: jest.fn() },
  message: { updateMany: jest.fn() },
  bargainExperienceEvent: { deleteMany: jest.fn() },
  bargainSession: { deleteMany: jest.fn() },
  dataAccessLog: { deleteMany: jest.fn() },
  verificationToken: { deleteMany: jest.fn() },
  customerDataExport: { deleteMany: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))
jest.mock('@/lib/job-auth', () => ({ requireJobAuth: jest.fn(async () => null) }))

import { POST } from '@/app/api/jobs/data-retention/route'


beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.$executeRawUnsafe.mockResolvedValue(3)
  prismaMock.cart.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.message.updateMany.mockResolvedValue({ count: 4 })
  prismaMock.bargainExperienceEvent.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.bargainSession.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.dataAccessLog.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.customerDataExport.deleteMany.mockResolvedValue({ count: 0 })
})

describe('data retention job', () => {
  it('clears PII, checkout recovery URLs and tokens, and redacts message bodies', async () => {
    const res = await POST(new NextRequest('https://cart-gain.com/api/jobs/data-retention', { method: 'POST' }))
    expect(res.status).toBe(200)

    const sql = prismaMock.$executeRawUnsafe.mock.calls[0][0] as string
    expect(sql).toContain('"customerEmail" = NULL')
    expect(sql).toContain('"customerPhone" = NULL')
    expect(sql).toContain('"customerId" = NULL')
    expect(sql).toContain('"cartId" = \'anon_\' || "id"')
    expect(sql).toContain('"recoveryUrlEncrypted" = NULL')

    const messageArgs = prismaMock.message.updateMany.mock.calls[0][0]
    expect(messageArgs.data.content).toBe('[redacted after retention period]')
    expect(messageArgs.data.providerId).toBeNull()
    expect(messageArgs.where.cart).toEqual({ abandonedAt: { lt: expect.any(Date) } })

    const body = await res.json()
    expect(body.anonymizedCarts).toBe(3)
    expect(body.redactedMessages).toBe(4)
  })

  it('falls back to legacy PII fields when the new migration is not applied', async () => {
    prismaMock.$executeRawUnsafe.mockRejectedValue(
      Object.assign(new Error('column "recoveryUrlEncrypted" does not exist'), {
        code: 'P2010',
      })
    )
    prismaMock.cart.updateMany.mockResolvedValue({ count: 2 })

    const res = await POST(new NextRequest('https://cart-gain.com/api/jobs/data-retention', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(prismaMock.cart.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerEmail: null, customerPhone: null }),
      })
    )
    expect((await res.json()).anonymizedCarts).toBe(2)
  })
})
