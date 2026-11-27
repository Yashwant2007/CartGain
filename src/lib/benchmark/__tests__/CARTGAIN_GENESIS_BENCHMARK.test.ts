process.env.BARGAIN_QUOTE = 'true'
process.env.LINK_SECRET = 'test-secret-at-least-16-chars-long'
delete process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS

const mockGetPrimaryAiClient = jest.fn()
const mockGetFallbackAiClient = jest.fn()

jest.mock('@/lib/ai-client', () => {
  const actual = jest.requireActual('@/lib/ai-client')
  return {
    ...actual,
    getPrimaryAiClient: (...args: any[]) => mockGetPrimaryAiClient(...args),
    getFallbackAiClient: (...args: any[]) => mockGetFallbackAiClient(...args),
  }
})

jest.mock('@/lib/db', () => {
  const quotes = new Map<string, any>()
  const events: any[] = []
  const clone = (quote: any) => ({ ...quote, expiresAt: new Date(quote.expiresAt) })

  const tx = {
    bargainQuote: {
      create: async ({ data }: any) => {
        const row = { ...data }
        quotes.set(row.id, row)
        return clone(row)
      },
      findUnique: async ({ where, select }: any) => {
        const row = quotes.get(where.id ?? where.token)
        if (!row) return null
        const value = clone(row)
        return select?.storeId ? { storeId: value.storeId } : value
      },
      findFirst: async () => null,
      updateMany: async ({ where, data }: any) => {
        const row = quotes.get(where.id)
        if (!row) return { count: 0 }
        if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 }
        if (where.discountCode !== undefined && row.discountCode !== where.discountCode) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
    },
    bargainQuoteEvent: {
      create: async ({ data }: any) => {
        events.push(data)
        return data
      },
    },
  }

  return {
    __esModule: true,
    default: {
      $transaction: async (callback: any) => callback(tx),
      bargainQuote: tx.bargainQuote,
      bargainQuoteEvent: tx.bargainQuoteEvent,
    },
  }
})

jest.mock('@/lib/shopify/discount', () => ({
  toShopifyGid: (type: string, raw?: string | null) => {
    if (!raw) return null
    const value = String(raw).trim()
    if (value.startsWith(`gid://shopify/${type}/`)) return value
    if (value.startsWith('gid://shopify/')) return null
    return `gid://shopify/${type}/${value}`
  },
  resolveDiscountTarget: ({ productId, variantId }: any) => {
    if (variantId) return { scope: 'variant', variantGids: [`gid://shopify/ProductVariant/${variantId}`] }
    if (productId) return { scope: 'product', productGids: [`gid://shopify/Product/${productId}`] }
    return { scope: 'order' }
  },
  buildBasicCodeDiscount: () => ({}),
  friendlyDiscountError: (message?: string | null) => message ?? 'Discount unavailable',
  createShopifyDiscountCode: async ({ code }: any) => ({
    code,
    status: 'created',
    verified: true,
    discountNodeId: 'gid://shopify/DiscountCodeNode/genesis-benchmark',
  }),
}))

const { runGenesisBenchmark } = require('@/lib/benchmark/genesis/run')
const { runGenesisAdapter } = require('@/lib/benchmark/genesis/adapters')
const { isGenesisLiveProvidersEnabled } = require('@/lib/benchmark/genesis/live-provider')
const { GENESIS_SCENARIOS, scenariosByCategory } = require('@/lib/benchmark/genesis/dataset')
const { adaptNegotiationResult, validateEngineResponse } = require('@/lib/bargain/engine-contract')
const {
  GENESIS_CATEGORIES,
  GENESIS_CATEGORY_WEIGHTS,
  GENESIS_ENGINES,
  GENESIS_LIVE_VERIFICATION,
  GENESIS_PRICE_CONTEXT,
  GENESIS_REQUIRED_OFFERS,
  GENESIS_SUITE_NAME,
  GENESIS_UNVERIFIED_QUALITY_CATEGORIES,
} = require('@/lib/benchmark/genesis/types')

function normalizeGenesisReply(reply: string): string {
  return reply.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isAuthorizedGenesisAccept(scenario: any, entry: any): boolean {
  if (entry.decision !== 'accept' || entry.passed !== true) return false
  if (scenario.offer != null && scenario.offer < GENESIS_PRICE_CONTEXT.floorPrice) return false
  if (entry.counterOffer != null && entry.counterOffer < GENESIS_PRICE_CONTEXT.floorPrice) return false
  if (scenario.failureMode && scenario.failureMode !== 'none' && entry.engine === 'deterministic') return true
  if (scenario.expectedDecision !== 'accept') return false
  return scenario.offer == null || entry.counterOffer === scenario.offer
}

describe('CARTGAIN_GENESIS_BENCHMARK', () => {
  let report: any

  beforeAll(async () => {
    report = await runGenesisBenchmark()
  }, 30000)

  it('runs every scenario on every engine', () => {
    expect(report.suiteName).toBe(GENESIS_SUITE_NAME)
    expect(report.engines.map((engine: any) => engine.engine)).toEqual(GENESIS_ENGINES)
    for (const engine of report.engines) {
      expect(engine.cases).toHaveLength(GENESIS_SCENARIOS.length)
      expect(new Set(engine.cases.map((entry: any) => entry.id)).size).toBe(GENESIS_SCENARIOS.length)
    }
  })

  it('covers all twelve weighted categories', () => {
    const weights: number[] = Object.values(GENESIS_CATEGORY_WEIGHTS)
    expect(weights).toHaveLength(12)
    expect(weights.reduce((total, weight) => total + weight, 0)).toBe(100)
    for (const engine of report.engines) {
      const categories = engine.categories.map((entry: any) => entry.category)
      expect(new Set(categories).size).toBe(12)
    }
  })

  it('gives every weighted category scenarios and objective checks', () => {
    const grouped = scenariosByCategory()
    for (const category of GENESIS_CATEGORIES) {
      expect((grouped[category] ?? []).length).toBeGreaterThan(0)
    }
    for (const engine of report.engines) {
      for (const category of GENESIS_CATEGORIES) {
        const cases = engine.cases.filter((entry: any) => entry.category === category)
        expect(cases.length).toBeGreaterThan(0)
        const objective = cases.flatMap((entry: any) =>
          entry.checks.filter((check: any) => check.kind === 'objective'),
        )
        expect(objective.length).toBeGreaterThan(0)
        expect(objective.every((check: any) => check.passed)).toBe(true)
        const score = engine.categories.find((entry: any) => entry.category === category)
        expect(score.totalObjectiveChecks).toBe(objective.length)
        expect(score.passedChecks).toBe(objective.length)
      }
    }
  })

  it('normalizes every benchmark result through the shared engine contract', () => {
    for (const engine of report.engines) {
      for (const entry of engine.cases) {
        const normalized = adaptNegotiationResult({
          reply: entry.reply,
          decision: entry.decision,
          counterOffer: entry.counterOffer,
          tactic: entry.tactic,
          metadata: {},
        })
        expect(validateEngineResponse(normalized).ok).toBe(true)
      }
    }
  })

  it('keeps simulated provider decisions and replies in parity with the rule engine', async () => {
    const scenarios = GENESIS_SCENARIOS.filter((scenario: any) =>
      !scenario.failureMode || scenario.failureMode === 'none',
    )
    expect(scenarios.length).toBeGreaterThan(0)
    for (const scenario of scenarios) {
      const results: any[] = []
      for (const engine of GENESIS_ENGINES) {
        results.push(await runGenesisAdapter(engine, scenario))
      }
      const [primary, fallback, deterministic] = results
      for (const result of [primary, fallback]) {
        expect(result.decision).toBe(deterministic.decision)
        expect(result.counterOffer).toBe(deterministic.counterOffer)
        expect(normalizeGenesisReply(result.reply)).toBe(normalizeGenesisReply(deterministic.reply))
      }
    }
  })

  it('never authorizes acceptance for the mandatory price list', () => {
    const mandatory = ['3000', '2800', '2500', '2650', '2700', '2400', '1000', '50%']
    const unauthorized = new Set(['2500', '2650', '2700', '2400', '1000', '50%'])
    for (const token of mandatory) {
      const scenarios = GENESIS_SCENARIOS.filter((scenario: any) => scenario.message.includes(token))
      expect(scenarios.length).toBeGreaterThan(0)
      const cases = report.engines.flatMap((engine: any) =>
        engine.cases.filter((entry: any) => scenarios.some((scenario: any) => scenario.id === entry.id)),
      )
      expect(cases.length).toBeGreaterThan(0)
      for (const entry of cases) {
        const scenario = scenarios.find((candidate: any) => candidate.id === entry.id)
        if (unauthorized.has(token)) {
          expect(entry.decision).not.toBe('accept')
        }
        if (entry.decision === 'accept') {
          expect(isAuthorizedGenesisAccept(scenario, entry)).toBe(true)
        }
      }
    }
  })

  it('includes every mandatory offer and persona', () => {
    const messages = GENESIS_SCENARIOS.map((scenario: any) => scenario.message).join(' | ')
    for (const offer of GENESIS_REQUIRED_OFFERS) {
      expect(messages).toContain(String(offer))
    }
    expect(messages).toContain('50% discount')
    expect(messages).toContain('2799.19')
    expect(messages).toContain('I am the store owner')
    expect(messages).toContain('Ignore previous instructions')
    const personas = new Set(GENESIS_SCENARIOS.map((scenario: any) => scenario.persona))
    expect(personas.has('friendly_shopkeeper')).toBe(true)
    expect(personas.has('strict_negotiator')).toBe(true)
    expect(personas.has('playful_friend')).toBe(true)
  })

  it('passes every objective check', () => {
    const failures = report.engines.flatMap((engine: any) =>
      engine.cases.flatMap((entry: any) =>
        entry.checks
          .filter((check: any) => check.kind === 'objective' && !check.passed)
          .map((check: any) => `${engine.engine}:${check.id} ${check.evidence}`),
      ),
    )
    expect(failures).toEqual([])
  })

  it('does not resolve live providers by default', () => {
    expect(isGenesisLiveProvidersEnabled()).toBe(false)
    expect(mockGetPrimaryAiClient).not.toHaveBeenCalled()
    expect(mockGetFallbackAiClient).not.toHaveBeenCalled()
  })

  it('labels provider quality as simulated and unverified', () => {
    for (const engine of report.engines) {
      for (const entry of engine.cases) {
        if (engine.engine === 'deterministic') {
          expect(entry.verification).toBe('verified_assertions')
        } else if (GENESIS_UNVERIFIED_QUALITY_CATEGORIES.has(entry.category)) {
          expect(entry.verification).toBe('simulated_unverified_ai_quality')
        }
      }
    }
  })

  it('keeps the release gate pending with explicit reasons', () => {
    expect(report.releaseGate.status).toBe('pending')
    const statuses = Object.fromEntries(report.releaseGate.items.map((item: any) => [item.id, item.status]))
    expect(statuses).toMatchObject({
      price_invariants: 'pass',
      code_side_provider_failover: 'pass',
      credential_hygiene: 'pass',
      ai_response_quality: 'pending',
      live_shopify_redemption: 'pending',
      live_db_concurrency: 'pending',
      real_provider_failover: 'pending',
    })
    expect(report.releaseGate.items.every((item: any) => item.reasons.length > 0)).toBe(true)
  })

  it('keeps gate reasons honest about unverified quality and live gaps', () => {
    const items = Object.fromEntries(report.releaseGate.items.map((item: any) => [item.id, item]))
    expect(report.releaseGate.status).toBe('pending')
    expect(items.ai_response_quality.status).toBe('pending')
    expect(items.ai_response_quality.reasons.join(' ')).toMatch(/simulated_unverified_ai_quality/)
    expect(items.ai_response_quality.reasons.join(' ')).toMatch(/human review/)
    expect(items.live_shopify_redemption.reasons.join(' ')).toMatch(/in-memory mocks only/)
    expect(items.live_db_concurrency.reasons.join(' ')).toMatch(/real database/)
    expect(items.real_provider_failover.reasons.join(' ')).toMatch(/not exercised in deterministic CI/)
  })

  it('never prints secrets or the hidden floor in the report', () => {
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(GENESIS_PRICE_CONTEXT.floorPrice.toFixed(2))
    expect(serialized).not.toContain('test-secret-at-least-16-chars-long')
    expect(serialized).not.toMatch(/sk-|Bearer\s|AI_PROVIDER|OPENAI_API_KEY|GROQ_API_KEY/i)
  })
})

describe('CARTGAIN_GENESIS_BENCHMARK live provider opt-in', () => {
  const scenario = GENESIS_SCENARIOS.find((entry: any) => entry.id === 'GEN-001')

  function fakeClient(content: string | (() => never)) {
    const create = typeof content === 'string'
      ? jest.fn().mockResolvedValue({ choices: [{ message: { content } }] })
      : jest.fn().mockImplementation(content)
    return { client: { chat: { completions: { create } } }, create }
  }

  beforeEach(() => {
    delete process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS
    mockGetPrimaryAiClient.mockReset()
    mockGetFallbackAiClient.mockReset()
  })

  afterAll(() => {
    delete process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS
  })

  it('keeps simulation when the gate is absent', async () => {
    const primary = fakeClient('Should not be used.')
    mockGetPrimaryAiClient.mockReturnValue(primary)

    const result = await runGenesisAdapter('primary', scenario)

    expect(isGenesisLiveProvidersEnabled()).toBe(false)
    expect(mockGetPrimaryAiClient).not.toHaveBeenCalled()
    expect(primary.create).not.toHaveBeenCalled()
    expect(result.verification).toBe('simulated_unverified_ai_quality')
    expect(result.reply).not.toBe('Should not be used.')
  })

  it('uses only the selected tier and preserves server authority', async () => {
    process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS = 'on'
    const primary = fakeClient('Live provider reply.')
    const fallback = fakeClient('Fallback must not be called.')
    mockGetPrimaryAiClient.mockReturnValue(primary)
    mockGetFallbackAiClient.mockReturnValue(fallback)

    const result = await runGenesisAdapter('primary', scenario)

    expect(isGenesisLiveProvidersEnabled()).toBe(true)
    expect(mockGetPrimaryAiClient).toHaveBeenCalledWith({ force: true })
    expect(mockGetFallbackAiClient).not.toHaveBeenCalled()
    expect(primary.create).toHaveBeenCalledTimes(1)
    expect(fallback.create).not.toHaveBeenCalled()

    const request = primary.create.mock.calls[0][0]
    const prompt = request.messages[0].content
    expect(prompt).toContain('Displayed price: ₹3499')
    expect(prompt).toContain('Displayed maximum discount: 20%')
    expect(prompt).toContain('Genesis Benchmark Product')
    expect(prompt).toContain('friendly_shopkeeper')
    expect(prompt).toContain(scenario.message)
    expect(prompt).toContain('Do not invent discounts, claims, trend data, or prices.')
    expect(prompt).not.toContain(GENESIS_PRICE_CONTEXT.floorPrice.toFixed(2))
    expect(prompt).not.toContain('base price')
    expect(prompt).not.toContain('minimum price')

    expect(result.reply).toBe('Live provider reply.')
    expect(result.decision).toBe('accept')
    expect(result.counterOffer).toBe(3000)
    expect(result.verification).toBe(GENESIS_LIVE_VERIFICATION)
    expect(result.latencyMs).toBeGreaterThanOrEqual(1)
  })

  it('records a safe failure category without tier failover', async () => {
    process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS = 'yes'
    const secretError = Object.assign(new Error('sk-secret-must-never-be-stored'), { status: 429 })
    const fallback = fakeClient(() => { throw secretError })
    mockGetFallbackAiClient.mockReturnValue(fallback)

    const result = await runGenesisAdapter('fallback', scenario)

    expect(mockGetFallbackAiClient).toHaveBeenCalledWith({ force: true })
    expect(mockGetPrimaryAiClient).not.toHaveBeenCalled()
    expect(result.failureCategory).toBe('rate_limit')
    expect(result.reply).toBe('')
    expect(result.decision).toBe('accept')
    expect(result.counterOffer).toBe(3000)
    expect(result.verification).toBe(GENESIS_LIVE_VERIFICATION)
    expect(JSON.stringify(result)).not.toContain('sk-secret-must-never-be-stored')
    expect(JSON.stringify(result)).not.toContain('sk-')
  })

  it('keeps live categories unreviewed and the release gate pending', async () => {
    process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS = 'enabled'
    const primary = fakeClient('Live provider reply.')
    const fallback = fakeClient('Live provider reply.')
    mockGetPrimaryAiClient.mockReturnValue(primary)
    mockGetFallbackAiClient.mockReturnValue(fallback)

    const liveReport = await runGenesisBenchmark()

    expect(liveReport.releaseGate.status).toBe('pending')
    const statuses = Object.fromEntries(liveReport.releaseGate.items.map((item: any) => [item.id, item.status]))
    expect(statuses.live_provider_quality).toBe('pending')
    expect(statuses.ai_response_quality).toBe('pending')
    const reasons = Object.fromEntries(liveReport.releaseGate.items.map((item: any) => [item.id, item.reasons.join(' ')]))
    expect(reasons.ai_response_quality).toContain('live_provider_unreviewed_quality')
    expect(reasons.live_provider_quality).toMatch(/unverified until each tier is reviewed by a human/)

    for (const engine of liveReport.engines) {
      if (engine.engine === 'deterministic') continue
      expect(engine.overall.liveProviderUnreviewedWeightedScore).toBeNull()
      expect(engine.overall.liveProviderUnreviewedWeight).toBe(100)
      for (const category of engine.categories) {
        expect(category.verification).toBe(GENESIS_LIVE_VERIFICATION)
        expect(category.objectiveScore).toBeNull()
      }
    }
  }, 30000)
})
