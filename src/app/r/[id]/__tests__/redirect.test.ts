jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    cart: { findUnique: jest.fn() },
    message: { findFirst: jest.fn(), update: jest.fn() },
    analytics: { upsert: jest.fn() },
  },
}))

import prisma from '@/lib/db'
import { GET } from '../route'

const prismaMock = prisma as any

const cart = {
  id: 'cart_1',
  cartId: 'shopify_cart_123',
  store: { domain: 'shop.myshopify.com', userId: 'user_1' },
}

function request(query: string) {
  return {
    nextUrl: new URL(`https://cart-gain.com/r/cart_1${query}`),
  } as any
}

const location = (res: Response) => res.headers.get('location')

describe('GET /r/[id] — recovery redirect', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://cart-gain.com'
    prismaMock.cart.findUnique.mockResolvedValue(cart)
    prismaMock.message.findFirst.mockResolvedValue(null)
  })

  afterAll(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = original
  })

  it('defaults to the branded cart page', async () => {
    const res = await GET(request('?c=email'), { params: { id: 'cart_1' } })
    expect(res.status).toBe(302)
    expect(location(res)).toBe('https://cart-gain.com/cart/cart_1')
  })

  it('opens the bargain panel', async () => {
    const res = await GET(request('?c=whatsapp&to=bargain'), { params: { id: 'cart_1' } })
    expect(location(res)).toBe('https://cart-gain.com/cart/cart_1?focus=bargain#bargain')
  })

  it('sends checkout clicks to the store with the code applied', async () => {
    const res = await GET(request('?c=whatsapp&to=checkout&code=GAINABC123'), {
      params: { id: 'cart_1' },
    })
    expect(location(res)).toBe(
      'https://shop.myshopify.com/discount/GAINABC123?redirect=%2Fcart%2Fshopify_cart_123'
    )
  })

  it('ignores an unsafe code and sends the plain cart permalink', async () => {
    const res = await GET(request('?c=whatsapp&to=checkout&code=%3Cscript%3E'), {
      params: { id: 'cart_1' },
    })
    expect(location(res)).toBe('https://shop.myshopify.com/cart/shopify_cart_123')
  })

  it('records the click on the most recent sent message', async () => {
    prismaMock.message.findFirst.mockResolvedValue({
      id: 'msg_1',
      clickedAt: null,
    })

    await GET(request('?c=email'), { params: { id: 'cart_1' } })

    expect(prismaMock.message.findFirst).toHaveBeenCalledWith({
      where: { cartId: 'cart_1', status: { in: ['sent', 'delivered'] }, channel: 'email' },
      orderBy: { sentAt: 'desc' },
    })
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'msg_1' },
      data: { clickedAt: expect.any(Date) },
    })
    expect(prismaMock.analytics.upsert).toHaveBeenCalled()
  })

  it('does not double count a second click', async () => {
    prismaMock.message.findFirst.mockResolvedValue({ id: 'msg_1', clickedAt: new Date() })
    await GET(request('?c=email'), { params: { id: 'cart_1' } })
    expect(prismaMock.message.update).not.toHaveBeenCalled()
  })

  it('still redirects when tracking throws', async () => {
    prismaMock.message.findFirst.mockRejectedValue(new Error('db down'))
    const res = await GET(request('?c=email'), { params: { id: 'cart_1' } })
    expect(res.status).toBe(302)
    expect(location(res)).toBe('https://cart-gain.com/cart/cart_1')
  })
})
