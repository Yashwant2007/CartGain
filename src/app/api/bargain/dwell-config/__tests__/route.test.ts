/**
 * @jest-environment node
 *
 * The public dwell-config endpoint is what lets the Shopify theme controller
 * softly nudge shoppers who linger on a product page. It must stay keyed to the
 * shop domain, never leak anything but the safe engagement shape, and always
 * answer `{ enabled: false }` for a page we do not own.
 */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/bargain/dwell-config/route'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
  },
}))

const mock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
}

function req(qs = '') {
  return new NextRequest('https://cart-gain.com/api/bargain/dwell-config' + qs)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/bargain/dwell-config', () => {
  it('answers disabled when shop is missing without touching the DB', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
    expect(mock.store.findFirst).not.toHaveBeenCalled()
    expect(mock.bargainConfig.findUnique).not.toHaveBeenCalled()
  })

  it('answers disabled for an unknown shop and never reads a config', async () => {
    mock.store.findFirst.mockResolvedValue(null)
    const res = await GET(req('?shop=ghost.myshopify.com'))
    expect(await res.json()).toEqual({ enabled: false })
    expect(mock.bargainConfig.findUnique).not.toHaveBeenCalled()
  })

  it('returns the merchant settings for a known shop', async () => {
    mock.store.findFirst.mockResolvedValue({ id: 'store-1' })
    mock.bargainConfig.findUnique.mockResolvedValue({
      dwellNudgeEnabled: true,
      dwellSeconds: 45,
      dwellReminderSeconds: 90,
    })
    const res = await GET(req('?shop=shop.myshopify.com'))
    expect(await res.json()).toEqual({ enabled: true, dwellSeconds: 45, reminderSeconds: 90 })
    expect(mock.bargainConfig.findUnique).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      select: { dwellNudgeEnabled: true, dwellSeconds: true, dwellReminderSeconds: true },
    })
  })

  it('reports disabled when the merchant turned the nudge off', async () => {
    mock.store.findFirst.mockResolvedValue({ id: 'store-1' })
    mock.bargainConfig.findUnique.mockResolvedValue({
      dwellNudgeEnabled: false,
      dwellSeconds: 60,
      dwellReminderSeconds: 60,
    })
    const res = await GET(req('?shop=shop.myshopify.com'))
    expect(await res.json()).toEqual({ enabled: false, dwellSeconds: 60, reminderSeconds: 60 })
  })

  it('fails safe (disabled) if the lookup throws', async () => {
    mock.store.findFirst.mockRejectedValue(new Error('db down'))
    const res = await GET(req('?shop=shop.myshopify.com'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ enabled: false })
  })

  it('exposes CORS + edge-cache headers so the storefront can read it', async () => {
    mock.store.findFirst.mockResolvedValue({ id: 'store-1' })
    mock.bargainConfig.findUnique.mockResolvedValue({
      dwellNudgeEnabled: true,
      dwellSeconds: 60,
      dwellReminderSeconds: 60,
    })
    const res = await GET(req('?shop=shop.myshopify.com'))
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cache-control')).toContain('s-maxage')
  })
})
