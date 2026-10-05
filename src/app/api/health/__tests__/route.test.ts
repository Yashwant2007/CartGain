import { NextResponse } from 'next/server'

// The health route reads its config through module-scope helpers that touch
// prisma, redis and the AI client. None of them matter here: this file only
// asserts env reporting, so every dependency is mocked out and the route is
// imported with those mocks in place.
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
}))
jest.mock('@/lib/queue', () => ({
  getQueue: jest.fn().mockResolvedValue({ redis: { ping: jest.fn().mockResolvedValue('PONG') } }),
}))
jest.mock('@/lib/ai-client', () => ({
  getAiHealth: jest.fn().mockReturnValue({
    status: 'ok',
    activeTier: 'primary',
    primary: { configured: true },
    fallback: { configured: true, tripped: false, model: '', baseUrl: '' },
  }),
}))

const ALL_REQUIRED = [
  'DATABASE_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'RESEND_API_KEY',
  'OPENAI_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'ENCRYPTION_KEY',
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
]

const snapshot = () => ({ ...process.env })

describe('GET /api/health — env reporting', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    process.env = { ...snapshot() }
    for (const key of ALL_REQUIRED) process.env[key] = `value-${key}`
  })

  afterEach(() => {
    process.env = snapshot()
    warnSpy.mockRestore()
  })

  const load = async () => {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    const json = await (res as NextResponse).json()

    return json
  }

  it('treats the Shopify credentials as required', async () => {
    delete process.env.SHOPIFY_API_SECRET
    delete process.env.SHOPIFY_API_KEY

    const body = await load()
    expect(body.checks.env.status).toBe('degraded')
    expect(body.checks.env.missing).toHaveLength(1)
  })

  it('reports a missing Shopify secret even when the Shopify key is present', async () => {
    delete process.env.SHOPIFY_API_SECRET

    const body = await load()
    expect(body.checks.env.status).toBe('degraded')
    expect(body.checks.env.missing).toHaveLength(1)
  })

  it('does not degrade when a padded Shopify secret is the only difference', async () => {
    process.env.SHOPIFY_API_SECRET = 'padded-secret\n'

    const body = await load()
    expect(body.checks.env.status).toBe('ok')
    expect(body.checks.env.missing).toHaveLength(0)
    expect(body.checks.env.unpadded).toBe(true)
  })

  it('flags padding on any required var, not only the Shopify ones', async () => {
    process.env.RAZORPAY_KEY_SECRET = '  padded  '

    const body = await load()
    expect(body.checks.env.unpadded).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RAZORPAY_KEY_SECRET'))
  })

  it('reports no padding when every value is clean', async () => {
    const body = await load()
    expect(body.checks.env.unpadded).toBe(false)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('never leaks variable names or the padding list in the public response', async () => {
    delete process.env.ENCRYPTION_KEY
    delete process.env.RAZORPAY_KEY_ID
    process.env.SHOPIFY_API_SECRET = 'padded\n'

    const body = await load()
    const serialized = JSON.stringify(body)
    for (const key of ALL_REQUIRED) {
      expect(serialized).not.toContain(key)
    }
    expect(body.checks.env.missing).toEqual(['N'])
    expect(body.checks.env.unpadded).toBe(true)
  })
})