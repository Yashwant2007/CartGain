import { getAppBaseUrl } from '../app-base-url'

const ORIG_ENV = { ...process.env }

function setEnv(updates: Record<string, string>) {
  for (const [k, v] of Object.entries(updates)) {
    ;(process.env as Record<string, string>)[k] = v
  }
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete (process.env as Record<string, string>)[key]
  Object.assign(process.env, ORIG_ENV)
})

describe('getAppBaseUrl', () => {
  it('falls back to the production origin when nothing is configured', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(getAppBaseUrl()).toBe('https://cart-gain.com')
  })

  it('uses a valid HTTPS NEXT_PUBLIC_APP_URL in production', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://cart-gain.com/' })
    expect(getAppBaseUrl()).toBe('https://cart-gain.com')
  })

  it('never emits a localhost/http URL in production, even from env', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    // Falls back to the request origin…
    expect(getAppBaseUrl({ url: 'https://cart-gain.com/api/shopify/install' })).toBe('https://cart-gain.com')
    // …and to the production origin when no request is available.
    expect(getAppBaseUrl()).toBe('https://cart-gain.com')
  })

  it('prefers the request origin over the env default when env is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    setEnv({ NODE_ENV: 'production' })
    expect(
      getAppBaseUrl({ url: 'https://cart-gain.com/api/shopify/install?shop=test.myshopify.com' })
    ).toBe('https://cart-gain.com')
  })

  it('allows localhost outside production (dev needs a whitelisted dev redirect)', () => {
    setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    expect(getAppBaseUrl()).toBe('http://localhost:3000')
  })
})