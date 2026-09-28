/**
 * Fallback-tier alignment.
 *
 * `getAiHealth()` only proves the env vars are present. These tests prove the
 * fallback tier is actually *engaged and correctly addressed* when the primary
 * is unusable — the exact condition that silently served hard-coded templates
 * to shoppers before the `BARGAIN_AI_DEGRADED` signal existed.
 *
 * The OpenAI SDK is mocked so we assert the constructor arguments (baseURL,
 * apiKey, timeout) and the model actually sent on the wire, without a network
 * call or a real key.
 */
const openAiMock = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: class MockOpenAI {
    baseURL?: string
    apiKey?: string
    timeout?: number
    chat = { completions: { create: openAiMock } }
    constructor(opts: any) {
      openAiMock(opts)
      this.baseURL = opts?.baseURL
      this.apiKey = opts?.apiKey
      this.timeout = opts?.timeout
    }
  },
}))

const ORIGINAL_ENV = { ...process.env }

async function loadFresh() {
  jest.resetModules()
  const quota = await import('@/lib/ai-quota')
  quota.resetQuotaBreakForTests()
  return {
    quota,
    ai: await import('@/lib/ai-client'),
  }
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

beforeEach(() => {
  openAiMock.mockClear()
  process.env = { ...ORIGINAL_ENV }
})

afterAll(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('fallback tier selection', () => {
  it('uses the primary when its key is present and the breaker is closed', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-primary', AI_FALLBACK_API_KEY: 'fb-key' })
    const { ai } = await loadFresh()

    expect(ai.getAiClient()?.tier).toBe('primary')
    // The primary must NOT be pointed at the fallback host.
    const ctorArg = openAiMock.mock.calls[0][0]
    expect(ctorArg.baseURL).toBeUndefined()
    expect(ai.getAiHealth().activeTier).toBe('primary')
  })

  it('engages the fallback with the exact base URL and model when the primary key is absent', async () => {
    setEnv({
      OPENAI_API_KEY: undefined,
      AI_FALLBACK_API_KEY: 'fb-key',
      AI_FALLBACK_BASE_URL: 'https://api.groq.com/openai/v1',
      AI_FALLBACK_MODEL: 'openai/gpt-oss-120b',
    })
    const { ai } = await loadFresh()

    const resolved = ai.getAiClient()
    expect(resolved?.tier).toBe('fallback')

    const ctorArg = openAiMock.mock.calls[0][0]
    expect(ctorArg.baseURL).toBe('https://api.groq.com/openai/v1')
    expect(ctorArg.apiKey).toBe('fb-key')
    expect(ctorArg.timeout).toBe(20000)

    // The request that goes on the wire must carry the fallback model, never
    // the primary's, and must land on the fallback host.
    await (resolved!.client as any).chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })
    const sent = openAiMock.mock.calls[openAiMock.mock.calls.length - 1][0]
    expect(sent.model).toBe('openai/gpt-oss-120b')

    expect(ai.getAiHealth().activeTier).toBe('fallback')
    expect(ai.getAiHealth().fallback).toMatchObject({
      configured: true,
      tripped: false,
      model: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
    })
  })

  it('fails over to the fallback when the primary breaker is tripped (quota/401)', async () => {
    setEnv({
      OPENAI_API_KEY: 'sk-primary',
      AI_FALLBACK_API_KEY: 'fb-key',
      AI_FALLBACK_BASE_URL: 'https://api.groq.com/openai/v1',
    })
    const { ai, quota } = await loadFresh()

    expect(ai.getAiClient()?.tier).toBe('primary')

    // Simulate the real failure that degraded the storefront: quota exhausted.
    ai.handleAiFailure(
      { status: 429, error: { code: 'insufficient_quota' } },
      'bargain',
      'user-1',
      'primary',
    )
    expect(quota.isTierTripped('primary')).toBe(true)

    const resolved = ai.getAiClient()
    expect(resolved?.tier).toBe('fallback')
    expect(openAiMock.mock.calls[openAiMock.mock.calls.length - 1][0].baseURL).toBe(
      'https://api.groq.com/openai/v1',
    )
    expect(ai.getAiHealth().activeTier).toBe('fallback')
  })

  it('fails over on a 401 as well, not just on quota', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-revoked', AI_FALLBACK_API_KEY: 'fb-key' })
    const { ai, quota } = await loadFresh()

    ai.handleAiFailure({ status: 401 }, 'bargain', 'user-1', 'primary')
    expect(quota.isTierTripped('primary')).toBe(true)
    expect(ai.getAiClient()?.tier).toBe('fallback')
  })

  it('returns null only when BOTH tiers are unavailable — the template case', async () => {
    setEnv({ OPENAI_API_KEY: undefined, AI_FALLBACK_API_KEY: undefined })
    const { ai } = await loadFresh()

    expect(ai.getAiClient()).toBeNull()
    expect(ai.getAiHealth().activeTier).toBe('none')
    expect(ai.getAiHealth().fallback.configured).toBe(false)
  })

  it('returns null when both tiers are tripped', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-primary', AI_FALLBACK_API_KEY: 'fb-key' })
    const { ai, quota } = await loadFresh()

    quota.tripTierBreaker('primary')
    quota.tripTierBreaker('fallback')

    expect(ai.getAiClient()).toBeNull()
    expect(ai.getAiHealth().activeTier).toBe('none')
  })

  it('keeps a whitespace-padded key from being mistaken for a working tier', async () => {
    setEnv({ OPENAI_API_KEY: '  \n ', AI_FALLBACK_API_KEY: 'fb-key' })
    const { ai } = await loadFresh()

    // Treated as unset → falls through to the fallback rather than 401-ing.
    expect(ai.getAiClient()?.tier).toBe('fallback')
  })
})
