/**
 * Provider failover, end to end, through the real `negotiateStep`.
 *
 * Both shopper surfaces — the storefront widget (`/api/bargain/offer`) and the
 * /demo negotiation window (`/api/bargain/demo`) — negotiate through this one
 * function, so proving failover here proves it for both. The thing that matters
 * is not merely "the fallback is configured" (that is what `/api/health` shows)
 * but that a primary outage is absorbed *inside the same request*: the shopper
 * gets a real model reply from Groq instead of a canned template line.
 */
import { negotiateStep, type NegotiationContext } from '@/lib/services/bargain'
import { resetQuotaBreakForTests, isTierTripped } from '@/lib/ai-quota'
import * as quota from '@/lib/ai-quota'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    bargainProduct: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}))

jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(),
}))

const ORIGINAL_ENV = { ...process.env }
const makeCreate = () => jest.fn()

/** Records which model + host each call went out on, keyed by model name. */
let sentModels: string[] = []
let ctorBaseUrls: (string | undefined)[] = []

jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    baseURL?: string
    chat: any
    constructor(opts: any) {
      ctorBaseUrls.push(opts?.baseURL)
      this.chat = {
        completions: {
          create: (req: any) => {
            sentModels.push(req?.model)
            return (globalThis as any).__nextCreate(req)
          },
        },
      }
    }
  },
}))

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

function ctx(over: Partial<NegotiationContext> = {}): NegotiationContext {
  return {
    storeName: 'Test Store',
    currencySymbol: '₹',
    originalPrice: 100,
    minPrice: 80,
    attemptsUsed: 1,
    maxAttempts: 3,
    persona: 'friendly_shopkeeper',
    ...over,
  }
}

function modelReply(counterOffer: number, extra: Record<string, unknown> = {}) {
  return {
    choices: [{ message: { content: JSON.stringify({ reply: 'Groq answered you.', decision: 'counter', counterOffer, ...extra }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }
}

beforeEach(() => {
  jest.resetModules()
  quota.resetQuotaBreakForTests()
  process.env = { ...ORIGINAL_ENV }
  sentModels = []
  ctorBaseUrls = []
  setEnv({
    OPENAI_API_KEY: 'sk-primary',
    AI_FALLBACK_API_KEY: 'fb-key',
    AI_FALLBACK_BASE_URL: 'https://api.groq.com/openai/v1',
    AI_FALLBACK_MODEL: 'openai/gpt-oss-120b',
    BARGAIN_MODEL: 'gpt-4o',
  })
})

afterAll(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('primary outage is absorbed inside the same request', () => {
  it('serves a real Groq reply when OpenAI returns insufficient quota', async () => {
    // First call (primary) dies with the exact error that degraded the
    // storefront; the retry must land on the Groq tier.
    ;(globalThis as any).__nextCreate = jest.fn(async (req: any) => {
      if (req.model === 'gpt-4o') {
        throw { status: 429, error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }
      }
      return modelReply(90)
    })

    const res = await negotiateStep(ctx(), [{ role: 'customer', content: 'hi' }], 'can you do 90?', 90, 'sess-1')

    expect(res.reply).toBe('Groq answered you.')
    expect(res.decision).toBe('counter')
    // The tactic pacing bound lifts the model's early ₹90 up to the round-one
    // schedule (orig 100 / floor 81 → ₹96.72): concessions must be earned.
    expect(res.counterOffer).toBe(96.72)
    // Both tiers were exercised, in order, inside one call.
    expect(sentModels).toEqual(['gpt-4o', 'openai/gpt-oss-120b'])
    expect(isTierTripped('primary')).toBe(true)
  })

  it('serves a real Groq reply when OpenAI 401s (revoked key)', async () => {
    ;(globalThis as any).__nextCreate = jest.fn(async (req: any) => {
      if (req.model === 'gpt-4o') throw { status: 401, error: { message: 'Incorrect API key provided' } }
      return modelReply(88)
    })

    const res = await negotiateStep(ctx(), [], '88?', 88, 'sess-2')

    expect(res.reply).toBe('Groq answered you.')
    expect(sentModels).toEqual(['gpt-4o', 'openai/gpt-oss-120b'])
  })

  it('serves a real Groq reply on a plain 429 rate-limit (the silent-degrade bug)', async () => {
    // The exact production failure: OpenAI returns a bare 429 rate-limit with
    // NO insufficient_quota code. This used to be swallowed silently (no
    // userKey on the bargain path → no cooldown, no trip, no log), so the retry
    // re-resolved the SAME primary tier and the shopper got a template. It must
    // now trip the primary and fail over to Groq inside the same request.
    ;(globalThis as any).__nextCreate = jest.fn(async (req: any) => {
      if (req.model === 'gpt-4o') {
        throw { status: 429, error: { message: 'Rate limit reached for gpt-4o', type: 'requests', code: 'rate_limit_exceeded' } }
      }
      return modelReply(90)
    })

    const res = await negotiateStep(ctx(), [{ role: 'customer', content: 'hi' }], 'can you do 90?', 90, 'sess-429')

    expect(res.reply).toBe('Groq answered you.')
    expect(res.decision).toBe('counter')
    expect(sentModels).toEqual(['gpt-4o', 'openai/gpt-oss-120b'])
    expect(isTierTripped('primary')).toBe(true)
  })

  it('does NOT fail over on a single timeout, and keeps the primary breaker closed', async () => {
    // Deliberate: a one-off slow response is not an outage. Tripping the tier
    // would push every shopper onto Groq for 15 minutes because of one slow
    // request, and retrying in-request would add up to 10s + 20s of shopper
    // waiting. Instead that turn degrades to the rules and the next turn is
    // still served by OpenAI.
    ;(globalThis as any).__nextCreate = jest.fn(async () => {
      const e: any = new Error('Request timed out.')
      e.code = 'ETIMEDOUT'
      throw e
    })

    const res = await negotiateStep(ctx({ minPrice: 80, attemptsUsed: 3, maxAttempts: 3 }), [], '70?', 70, 'sess-3')

    expect(sentModels).toEqual(['gpt-4o']) // no failover attempted
    expect(isTierTripped('primary')).toBe(false) // primary still considered healthy
    expect(res.reply).not.toMatch(/lowest i can go/i) // degrades safely anyway
    expect(res.reply).not.toContain('80.00')
  })

  it('goes straight to Groq on the very first call when no primary key exists', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => modelReply(92))

    const res = await negotiateStep(ctx(), [], '92?', 92, 'sess-4')

    expect(res.reply).toBe('Groq answered you.')
    expect(sentModels).toEqual(['openai/gpt-oss-120b'])
  })

  it('still enforces the floor on a Groq reply', async () => {
    // Groq must not be able to sell below the floor just because it is the
    // fallback tier.
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => modelReply(1))

    const res = await negotiateStep(ctx({ minPrice: 80 }), [], '1 rupee?', 1, 'sess-5')

    expect(res.counterOffer!).toBeGreaterThanOrEqual(80)
  })

  it('lands on the rules only when BOTH tiers fail, and stays floor-safe', async () => {
    ;(globalThis as any).__nextCreate = jest.fn(async () => {
      throw { status: 429, error: { code: 'insufficient_quota' } }
    })

    const res = await negotiateStep(ctx({ minPrice: 80, attemptsUsed: 3, maxAttempts: 3 }), [], '70?', 70, 'sess-6')

    expect(sentModels).toEqual(['gpt-4o', 'openai/gpt-oss-120b'])
    expect(res.reply).not.toMatch(/lowest i can go/i)
    expect(res.reply).not.toContain('80.00')
    if (res.decision === 'counter') expect(res.counterOffer!).toBeGreaterThan(80)
  })

  it('recursion is bounded — a flapping tier cannot loop forever', async () => {
    // Both breakers open, so the retry resolve has nothing left to offer and
    // must terminate on the rules rather than recursing.
    ;(globalThis as any).__nextCreate = jest.fn(async () => {
      throw { status: 500 }
    })

    const res = await negotiateStep(ctx(), [], 'hello there', undefined, 'sess-7')

    expect(typeof res.reply).toBe('string')
    expect(sentModels.length).toBeLessThanOrEqual(2)
  })

  it('keeps JSON-object mode, which the Groq tier must support', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    const seen: any[] = []
    ;(globalThis as any).__nextCreate = jest.fn(async (req: any) => {
      seen.push(req)
      return modelReply(87)
    })

    await negotiateStep(ctx(), [], '87?', 87, 'sess-8')

    expect(seen[0].response_format).toEqual({ type: 'json_object' })
    expect(seen[0].messages[0].role).toBe('system')
  })

  it('salvages a non-JSON prose reply from Groq instead of serving a template', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [{ message: { content: 'Bhai, 88 pe bhi thoda kam pad raha hai — 90 pe set karein?' } }],
      usage: {},
    }))

    const res = await negotiateStep(ctx(), [], 'kuch kam karo', 88, 'sess-prose')

    // A real, human reply — not a canned template line.
    expect(res.reply).toContain('Bhai')
    expect(res.decision).toBe('counter')
    expect(res.counterOffer!).toBeGreaterThanOrEqual(80)
  })

  it('recovers a JSON reply wrapped in markdown fences', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        {
          message: {
            content:
              'Here you go:\n```json\n' +
              JSON.stringify({ reply: 'Fenced reply.', decision: 'counter', counterOffer: 90, tactic: 't', sentiment: 'happy' }) +
              '\n```',
          },
        },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx(), [], '90?', 90, 'sess-fence')

    expect(res.reply).toBe('Fenced reply.')
    expect(res.decision).toBe('counter')
    expect(res.counterOffer).toBe(96.72)
  })

  it('degrades safely when Groq returns empty content (reasoning ate the budget)', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
      usage: { completion_tokens_details: { reasoning_tokens: 1200 } },
    }))

    const res = await negotiateStep(ctx({ minPrice: 80, attemptsUsed: 3, maxAttempts: 3 }), [], '70?', 70, 'sess-empty')

    expect(res.reply).not.toContain('80.00')
    if (res.decision === 'counter') expect(res.counterOffer!).toBeGreaterThan(80)
  })

  it('retries the SAME tier with the compact prompt on a 413 too-large error, without tripping the breaker', async () => {
    // The exact production failure: the request overflowed the provider's
    // per-minute token bucket. It is a size problem, not an outage, so we retry
    // in-request with the compact prompt + smaller budget — never a template.
    const seen: any[] = []
    ;(globalThis as any).__nextCreate = jest.fn(async (req: any) => {
      seen.push(req)
      if (seen.length === 1) {
        throw {
          status: 413,
          error: {
            message:
              'Request too large for model `gpt-4o` on tokens per minute (TPM): Limit 8000, Requested 8181, please reduce your message size',
          },
        }
      }
      return modelReply(90)
    })

    const res = await negotiateStep(ctx(), [], 'can you do 90?', 90, 'sess-413')

    expect(res.reply).toBe('Groq answered you.')
    // Two attempts, both on the primary (no failover), the second compact.
    expect(sentModels).toEqual(['gpt-4o', 'gpt-4o'])
    expect(seen[0].messages[0].content).toContain('NEGOTIATION PSYCHOLOGY')
    expect(seen[1].messages[0].content).toContain('professional salesperson and master negotiator')
    expect(seen[1].messages[0].content).not.toContain('NEGOTIATION PSYCHOLOGY')
    expect(seen[1].max_completion_tokens).toBeLessThan(seen[0].max_completion_tokens)
    // A size error is not an outage — the primary stays healthy for the next turn.
    expect(isTierTripped('primary')).toBe(false)
  })

  it('sends the compact prompt on the fallback tier from the very first call', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    const seen: any[] = []
    ;(globalThis as any).__nextCreate = jest.fn(async (req: any) => {
      seen.push(req)
      return modelReply(90)
    })

    await negotiateStep(ctx(), [], '90?', 90, 'sess-compact-fb')

    expect(seen[0].messages[0].content).toContain('professional salesperson and master negotiator')
    expect(seen[0].messages[0].content).not.toContain('NEGOTIATION PSYCHOLOGY')
    expect(seen[0].max_completion_tokens).toBe(700)
  })

  it('rewrites a below-floor price the model named so the spoken price matches the real offer', async () => {
    // Live demos showed the model say "₹790" while the backend clamped the real
    // offer to ₹808 — the shopper saw a price we would not honour. The reply text
    // must be corrected to the clamped value.
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({ reply: 'I can do ₹70 for you.', decision: 'counter', counterOffer: 70 }),
          },
        },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ minPrice: 80 }), [], '70?', 70, 'sess-rw')

    expect(res.reply).not.toContain('70')
    expect(res.counterOffer!).toBeGreaterThanOrEqual(80)
    expect(res.reply).toContain(String(res.counterOffer))
  })

  it('pins an AI accept to the customer offer, not a stale pacing number (badge/text mismatch)', async () => {
    // The live bug: the reply said "you've got it at ₹1000" but the counter badge
    // read ₹962.59 — the pacing fallback leaked into the accepted deal. On accept
    // the returned price must be the customer's own (bounded) offer.
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({ reply: "You've got it at ₹1000. Deal!", decision: 'accept' }),
          },
        },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], 'ok, 1000 final', 1000, 'sess-accept')

    expect(res.decision).toBe('accept')
    expect(res.counterOffer).toBe(1000)
  })

  it('reconciles an AI-stated accept figure with the true accepted price', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              reply: 'Alright, I can do ₹962.59 for you. Deal!',
              decision: 'accept',
              counterOffer: 962.59,
            }),
          },
        },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], '1000, take it', 1000, 'sess-accept-rw')

    expect(res.decision).toBe('accept')
    expect(res.counterOffer).toBe(1000)
    // The spoken figure is corrected to the agreed price so text and badge agree.
    expect(res.reply).toContain('1000')
    expect(res.reply).not.toContain('962.59')
  })

  it('still refuses an accept below the floor (downgrades to a floor-safe counter)', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        { message: { content: JSON.stringify({ reply: 'Okay, ₹50 it is.', decision: 'accept' }) } },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], '50 only', 50, 'sess-accept-low')

    expect(res.decision).toBe('counter')
    expect(res.counterOffer!).toBeGreaterThanOrEqual(800)
  })

  it('never quotes the listed price as a concession (a counter must be a real drop)', async () => {
    // The live "₹500 is a bold play! I can bring it down to ₹1000" on a ₹1000
    // item: the model held at the sticker. The backend steps it down to the
    // round's real pacing price and rewrites the spoken figure to match.
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              reply: 'I can bring it down to ₹1000 for you.',
              decision: 'counter',
              counterOffer: 1000,
            }),
          },
        },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], 'the other store gives 500', 500, 'sess-list')

    expect(res.decision).toBe('counter')
    expect(res.counterOffer!).toBeLessThan(1000)
    expect(res.counterOffer!).toBeGreaterThan(800)
    expect(res.reply).not.toContain('1000')
  })

  it('accepts a full-price offer instead of countering it', async () => {
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [
        { message: { content: JSON.stringify({ reply: 'Let me think about that.', decision: 'counter', counterOffer: 980 }) } },
      ],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], 'I will pay the full price, 1000', 1000, 'sess-full')

    expect(res.decision).toBe('accept')
    expect(res.counterOffer).toBe(1000)
  })

  it('degrades safely when even the compact retry is too large', async () => {
    ;(globalThis as any).__nextCreate = jest.fn(async () => {
      throw { status: 413, error: { message: 'Request too large' } }
    })

    const res = await negotiateStep(ctx({ minPrice: 80, attemptsUsed: 3, maxAttempts: 3 }), [], '70?', 70, 'sess-413-2')

    // Compact retried exactly once on the same tier, then degraded to the rules.
    expect(sentModels).toEqual(['gpt-4o', 'gpt-4o'])
    expect(res.reply).not.toContain('80.00')
    if (res.decision === 'counter') expect(res.counterOffer!).toBeGreaterThan(80)
  })
})

describe('counter consistency — pinned to a tight schedule band', () => {
  it('lifts a below-schedule AI counter up to the round schedule', async () => {
    // Model low-balls its own counter; the backend must pin it up to the earned
    // round-one schedule (orig 1000 / floor 800 → ~966.90), never below.
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ reply: 'I can do ₹820.', decision: 'counter', counterOffer: 820 }) } }],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], 'how about 820?', 820, 'sess-band-low')
    expect(res.decision).toBe('counter')
    expect(res.counterOffer!).toBeGreaterThan(960)
    expect(res.counterOffer!).toBeLessThan(1000)
  })

  it('caps an above-schedule AI counter so it never parks at the sticker', async () => {
    // Model tries to hold at the list price (the classic "stuck" behaviour). The
    // band clamps it just above the schedule, always a real drop below the list.
    setEnv({ OPENAI_API_KEY: undefined })
    ;(globalThis as any).__nextCreate = jest.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ reply: 'Best I can do is ₹990.', decision: 'counter', counterOffer: 990 }) } }],
      usage: {},
    }))

    const res = await negotiateStep(ctx({ originalPrice: 1000, minPrice: 800 }), [], 'what about it?', 820, 'sess-band-high')
    expect(res.decision).toBe('counter')
    expect(res.counterOffer!).toBeLessThanOrEqual(980)
    expect(res.counterOffer!).toBeGreaterThan(960)
  })
})
