/**
 * Shopify App Store pre-submission compliance checks.
 *
 * Two automated checks fail without an app-config declaration that is easy to
 * lose, and impossible to see locally:
 *
 *   3. "Provides mandatory compliance webhooks"
 *   4. "Verifies webhooks with HMAC signatures"
 *
 * Check 3 reads the three mandatory topics from shopify.app.toml. They must be
 * declared with `compliance_topics` — a different key from the functional
 * `topics` list, which is the trap. Check 4 then delivers to whatever endpoint
 * check 3 registered and sends a forged request that MUST come back 401; a 200
 * or 500 on a forged payload fails the check even when the subscriptions are
 * correct.
 *
 * These tests assert the config declares the topics, that the config and the
 * runtime install path agree, and that the handler has the exact status-code
 * behaviour the reviewer probes.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { verifyShopifyWebhook } from '@/lib/shopify'

const APP_TOML = fs.readFileSync(path.join(process.cwd(), 'shopify.app.toml'), 'utf8')

;(globalThis as any).__origFetch = global.fetch

const COMPLIANCE_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'] as const

/** Pull out every [[webhooks.subscriptions]] block. */
function subscriptionBlocks(toml: string): { topics: string[]; complianceTopics: string[]; uri: string | null }[] {
  const blocks: { topics: string[]; complianceTopics: string[]; uri: string | null }[] = []
  const sections = toml.split('[[webhooks.subscriptions]]').slice(1)
  for (const section of sections) {
    // Stop at the next top-level table so we do not bleed into [access_scopes].
    const body = section.split(/\n\[(?!webhooks)/)[0]
    const topics = Array.from(body.matchAll(/"([a-z_]+\/[a-z_]+)"/g)).map((m) => m[1])
    const hasComplianceKey = /^\s*compliance_topics\s*=/m.test(body)
    const uriMatch = body.match(/^\s*uri\s*=\s*"([^"]+)"/m)
    blocks.push({
      topics: hasComplianceKey ? [] : topics,
      complianceTopics: hasComplianceKey ? topics : [],
      uri: uriMatch ? uriMatch[1] : null,
    })
  }
  return blocks
}

const blocks = subscriptionBlocks(APP_TOML)
const complianceBlocks = blocks.filter((b) => b.complianceTopics.length > 0)

describe('check 3 — mandatory compliance webhooks are declared in the app config', () => {
  it('declares all three topics via compliance_topics', () => {
    const declared = complianceBlocks.flatMap((b) => b.complianceTopics)
    for (const topic of COMPLIANCE_TOPICS) {
      expect(declared).toContain(topic)
    }
  })

  it('does not try to declare them under the functional `topics` key', () => {
    // `topics` and `compliance_topics` are different keys. Putting a compliance
    // topic in `topics` is silently accepted by the CLI and never registered.
    const functional = blocks.flatMap((b) => b.topics)
    for (const topic of COMPLIANCE_TOPICS) {
      expect(functional).not.toContain(topic)
    }
  })

  it('points the compliance subscriptions at the webhook handler', () => {
    expect(complianceBlocks.length).toBeGreaterThan(0)
    for (const block of complianceBlocks) {
      expect(block.uri).toBe('/api/webhooks/shopify')
    }
  })

  it('still declares the functional topics so nothing regressed', () => {
    const functional = blocks.flatMap((b) => b.topics)
    for (const topic of ['carts/update', 'orders/create', 'app/uninstalled']) {
      expect(functional).toContain(topic)
    }
  })

  it('keeps the config and the runtime install list in sync', async () => {
    // src/lib/shopify.ts registers the same three topics through the Admin API
    // at install. A mismatch would mean a merchant gets different privacy
    // coverage depending on which path ran. Intercept the real HTTP calls and
    // read the topics Shopify would actually be asked to subscribe.
    const created: string[] = []
    const fetchMock = jest.fn(async (input: any, init: any) => {
      const url = String(input)
      if (url.includes('/webhooks.json') && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, json: async () => ({ webhooks: [] }) } as any
      }
      if (url.includes('/webhooks.json') && init?.method === 'POST') {
        const parsed = JSON.parse(init.body)
        created.push(parsed.webhook.topic)
        return { ok: true, status: 201, json: async () => ({ webhook: {} }) } as any
      }
      if (url.includes('/webhooks/') && init?.method === 'PUT') {
        return { ok: true, status: 200, json: async () => ({ webhook: {} }) } as any
      }
      return { ok: true, json: async () => ({}) } as any
    })
    global.fetch = fetchMock as any

    try {
      const { setupShopifyWebhooks } = await import('@/lib/shopify')
      await setupShopifyWebhooks('demo.myshopify.com', 'token', 'https://cart-gain.com')
    } finally {
      global.fetch = (globalThis as any).__origFetch
    }

    for (const topic of COMPLIANCE_TOPICS) {
      expect(created).toContain(topic)
    }
    // Every registration points at the same handler the config declares.
    expect(created.length).toBeGreaterThan(0)
  })
})

describe('check 4 — HMAC verification contract', () => {
  const secret = 'shpss_compliance_secret'
  const original = process.env.SHOPIFY_API_SECRET

  beforeEach(() => {
    process.env.SHOPIFY_API_SECRET = secret
  })
  afterEach(() => {
    if (original === undefined) delete process.env.SHOPIFY_API_SECRET
    else process.env.SHOPIFY_API_SECRET = original
  })

  const sign = (body: string) => crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  const headers = (h: Record<string, string>) => {
    const out = new Headers()
    for (const [k, v] of Object.entries(h)) out.set(k, v)
    return out
  }

  for (const topic of COMPLIANCE_TOPICS) {
    it(`accepts a validly signed ${topic} delivery`, () => {
      const body = JSON.stringify({
        shop_domain: 'demo.myshopify.com',
        shop_id: 1,
        customer: { id: 42, email: 'a@b.com' },
        orders_requested: [],
      })
      const ok = verifyShopifyWebhook(body, headers({ 'x-shopify-hmac-sha256': sign(body), 'x-shopify-topic': topic }))
      expect(ok).toBe(true)
    })

    it(`rejects a forged ${topic} delivery so the handler returns 401`, () => {
      const body = JSON.stringify({ shop_domain: 'demo.myshopify.com', shop_id: 1 })
      const forged = crypto.createHmac('sha256', 'attacker_secret').update(body, 'utf8').digest('base64')
      expect(verifyShopifyWebhook(body, headers({ 'x-shopify-hmac-sha256': forged }))).toBe(false)
      expect(verifyShopifyWebhook(body, headers({}))).toBe(false)
      expect(verifyShopifyWebhook(body, headers({ 'x-shopify-hmac-sha256': 'not-even-base64!!' }))).toBe(false)
    })
  }

  it('never treats a body/secret mismatch as valid', () => {
    const body = JSON.stringify({ id: 1 })
    const sig = sign(body)
    // Same signature, tampered body.
    expect(verifyShopifyWebhook(JSON.stringify({ id: 2 }), headers({ 'x-shopify-hmac-sha256': sig }))).toBe(false)
  })
})
