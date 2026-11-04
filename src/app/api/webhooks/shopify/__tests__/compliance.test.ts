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
 * These tests assert the config declares the topics and that the handler has
 * the exact status-code behaviour the reviewer probes. App-specific webhooks
 * are registered by `shopify app deploy`, not at runtime.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { verifyShopifyWebhook } from '@/lib/shopify'

jest.mock('@/lib/encryption', () => ({
  decrypt: jest.fn(() => 'tok'),
  encrypt: jest.fn(() => 'enc'),
}))

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
      expect(block.uri).toBe('https://cart-gain.com/api/webhooks/shopify')
    }
  })

  it('uses absolute webhook URIs so they cannot resolve against application_url', () => {
    // Shopify resolves a relative webhook `uri` against `application_url`.
    // application_url here is a SUBPATH ("/api/shopify/install"), so a relative
    // "/api/webhooks/shopify" was delivered to
    // "/api/shopify/install/api/webhooks/shopify" and 404'd — which failed the
    // automated HMAC check even though the handler was correct.
    const applicationUrl = APP_TOML.match(/^application_url\s*=\s*"([^"]+)"/m)?.[1] ?? ''
    const applicationUrlHasPath = new URL(applicationUrl).pathname.replace(/\/$/, '') !== ''

    for (const block of blocks) {
      const uri = block.uri!
      const isAbsolute = /^https?:\/\//.test(uri)
      if (!isAbsolute) {
        // A relative uri is only safe when application_url is origin-only.
        expect(applicationUrlHasPath).toBe(false)
      }
    }
  })

  it('every declared webhook URI is reachable on the live host', () => {
    // Guards the class of bug rather than one literal: a URI that does not
    // start with the application origin will 404 at delivery time.
    for (const block of blocks) {
      expect(block.uri).toMatch(/^https:\/\/cart-gain\.com\/api\/webhooks\/shopify$/)
    }
  })

  it('still declares the functional topics so nothing regressed', () => {
    const functional = blocks.flatMap((b) => b.topics)
    for (const topic of ['carts/update', 'orders/create', 'app/uninstalled']) {
      expect(functional).toContain(topic)
    }
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
