export {}

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

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes', 'enabled'])
const liveRunEnabled = ENABLED_VALUES.has(
  String(process.env.CARTGAIN_GENESIS_LIVE_RUN ?? '').trim().toLowerCase(),
)

function loadEnvFile(file) {
  const resolved = path.resolve(process.cwd(), file)
  if (!fs.existsSync(resolved)) return
  const text = fs.readFileSync(resolved, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

if (liveRunEnabled) {
  loadEnvFile('.env.local')
  loadEnvFile('.env')
  process.env.BARGAIN_QUOTE = 'true'
  process.env.LINK_SECRET = process.env.LINK_SECRET || 'genesis-live-benchmark-link-secret'
  process.env.CARTGAIN_GENESIS_LIVE_PROVIDERS = 'on'
}

const { runGenesisBenchmark, summarizeGenesisReport } = require('../genesis/run')
const { GENESIS_LIVE_VERIFICATION } = require('../genesis/types')

const liveDescribe = liveRunEnabled ? describe : describe.skip

liveDescribe('CARTGAIN_GENESIS_BENCHMARK live provider runner', () => {
  it('runs real provider tiers and records objective safety without claiming human approval', async () => {
    const report = await runGenesisBenchmark()
    const summary = summarizeGenesisReport(report)
    const statuses = Object.fromEntries(
      report.releaseGate.items.map((item) => [item.id, item.status]),
    )
    const liveCases = report.engines.flatMap((engine) => engine.cases).filter(
      (entry) => entry.verification === GENESIS_LIVE_VERIFICATION,
    )
    const outputPath = path.resolve(
      process.env.GENESIS_LIVE_REPORT_PATH || path.join(os.tmpdir(), 'cartgain-genesis-live-report.json'),
    )

    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, report }, null, 2)}\n`)
    console.log(summary)
    console.log(`genesis_live_report=${outputPath}`)

    expect(liveCases.length).toBeGreaterThan(0)
    expect(statuses.live_provider_objective_safety).toBe('pass')
    expect(statuses.live_provider_quality).toBe('pending')
    expect(statuses.ai_response_quality).toBe('pending')
    expect(statuses.real_provider_failover).toBe('pending')
    expect(summary).toContain('live_objective=')
    expect(summary).toContain('live_unreviewed=n/a')

    for (const engine of report.engines) {
      if (engine.engine === 'deterministic') continue
      expect(engine.overall.liveProviderObjectiveWeight).toBeGreaterThan(0)
      expect(engine.overall.liveProviderUnreviewedWeightedScore).toBeNull()
      for (const category of engine.categories) {
        expect(category.verification).toBe(GENESIS_LIVE_VERIFICATION)
        expect(category.objectiveScore).toBeNull()
        expect(category.liveObjectiveScore).not.toBeNull()
      }
    }

  }, 20 * 60 * 1000)
})
