import crypto from 'crypto'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    message: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => [{ cart: { storeId: 'store-1', customerEmail: 'buyer@example.com' } }]),
    },
  },
}))

jest.mock('@/lib/observability/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}))

jest.mock('@/lib/opt-out', () => ({
  recordOptOut: jest.fn(async () => ({})),
}))

import prisma from '@/lib/db'
import { recordOptOut } from '@/lib/opt-out'
import { POST } from '../route'

const prismaMock = prisma as any
const recordOptOutMock = recordOptOut as jest.Mock
const SECRET = 'whsec_' + Buffer.from('test-signing-secret-32-bytes-long!!').toString('base64')

function signedRequest(payload: unknown, opts?: { secret?: string; timestamp?: number; id?: string }) {
  const body = JSON.stringify(payload)
  const id = opts?.id ?? 'msg_1'
  const timestamp = String(opts?.timestamp ?? Math.floor(Date.now() / 1000))
  const secret = Buffer.from((opts?.secret ?? SECRET).replace('whsec_', ''), 'base64')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${body}`, 'utf8')
    .digest('base64')

  return new Request('https://cart-gain.com/api/webhooks/email', {
    method: 'POST',
    body,
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
      'content-type': 'application/json',
    },
  }) as any
}

describe('POST /api/webhooks/email', () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.RESEND_WEBHOOK_SECRET = SECRET
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret
  })

  it('rejects an unsigned request', async () => {
    const res = await POST(new Request('https://cart-gain.com/api/webhooks/email', { method: 'POST', body: '{}' }) as any)
    expect(res.status).toBe(401)
    expect(prismaMock.message.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a bad signature', async () => {
    const res = await POST(signedRequest({ type: 'email.delivered', data: { email_id: 'x' } }, { secret: 'whsec_' + Buffer.from('wrong-secret').toString('base64') }))
    expect(res.status).toBe(401)
  })

  it('rejects a stale timestamp', async () => {
    const res = await POST(
      signedRequest({ type: 'email.delivered', data: { email_id: 'x' } }, { timestamp: Math.floor(Date.now() / 1000) - 3600 })
    )
    expect(res.status).toBe(401)
  })

  it('marks the matching message delivered', async () => {
    const res = await POST(signedRequest({ type: 'email.delivered', data: { email_id: 're_123' } }))
    expect(res.status).toBe(200)
    expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
      where: { providerId: 're_123', deliveredAt: null },
      data: expect.objectContaining({ status: 'delivered' }),
    })
  })

  it('marks bounces and complaints as failed and records opt-out', async () => {
    await POST(signedRequest({ type: 'email.bounced', data: { email_id: 're_456' } }))
    expect(prismaMock.message.findMany).toHaveBeenCalledWith({
      where: { providerId: 're_456', channel: 'email' },
      select: { cart: { select: { storeId: true, customerEmail: true } } },
    })
    expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
      where: { providerId: 're_456' },
      data: { status: 'failed', reasonCode: 'email_bounce' },
    })
    expect(recordOptOutMock).toHaveBeenCalledWith('store-1', { email: 'buyer@example.com' }, 'email_bounce')
  })

  it('records complaint opt-out', async () => {
    await POST(signedRequest({ type: 'email.complained', data: { email_id: 're_457' } }))
    expect(recordOptOutMock).toHaveBeenCalledWith('store-1', { email: 'buyer@example.com' }, 'email_complaint')
  })

  it('ignores unknown event types', async () => {
    const res = await POST(signedRequest({ type: 'email.opened', data: { email_id: 're_789' } }))
    expect(res.status).toBe(200)
    expect(prismaMock.message.updateMany).not.toHaveBeenCalled()
  })
})
