const prismaMock = {
  dataAccessLog: { create: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))

import { logDataAccess, redactSensitive } from '../data-protection'

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.dataAccessLog.create.mockResolvedValue({})
})

describe('redactSensitive', () => {
  it('masks emails, phones, tokens and customer-content keys', () => {
    const redacted = redactSensitive({
      email: 'priya@example.com',
      customerPhone: '+919876543210',
      accessToken: 'secret-token',
      message: 'your cart is waiting',
      nested: { customerEmail: 'arjun@example.com' },
      count: 3,
    }) as any

    expect(redacted.email).toBe('[redacted]')
    expect(redacted.customerPhone).toBe('[redacted]')
    expect(redacted.accessToken).toBe('[redacted]')
    expect(redacted.message).toBe('[redacted]')
    expect(redacted.nested.customerEmail).toBe('[redacted]')
    expect(redacted.count).toBe(3)
  })

  it('masks string values that look like contact data', () => {
    expect(redactSensitive('priya@example.com')).toBe('pr***@example.com')
    expect(redactSensitive('+919876543210')).toBe('***3210')
  })
})

describe('logDataAccess', () => {
  it('redacts metadata and never writes a raw token/email', async () => {
    await logDataAccess({
      actorType: 'system',
      action: 'read',
      resourceType: 'cart',
      purpose: 'test',
      metadata: {
        email: 'priya@example.com',
        token: 'checkout-secret',
        count: 1,
      },
    })

    const data = prismaMock.dataAccessLog.create.mock.calls[0][0].data
    expect(data.metadata).toEqual({ email: '[redacted]', token: '[redacted]', count: 1 })
    expect(JSON.stringify(data)).not.toContain('priya@example.com')
    expect(JSON.stringify(data)).not.toContain('checkout-secret')
  })

  it('does not throw when the audit table is unavailable', async () => {
    const original = prismaMock.dataAccessLog
    ;(prismaMock as any).dataAccessLog = undefined
    await expect(
      logDataAccess({
        actorType: 'system',
        action: 'read',
        resourceType: 'cart',
        purpose: 'test',
      })
    ).resolves.toBeUndefined()
    ;(prismaMock as any).dataAccessLog = original
  })
})
