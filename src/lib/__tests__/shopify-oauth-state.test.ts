import crypto from 'crypto'
import { signOAuthState, verifyOAuthState, getOAuthStateSecret } from '@/lib/shopify-oauth'

// Regression tests for the OAuth state hardening: the state must be bound to
// the shop it was minted for, must expire, and must reject tampering or a
// hand-rolled state with no issued-at — otherwise a state captured for one shop
// could be replayed to bind a different shop's credentials (tenant takeover).
describe('shopify OAuth state', () => {
  const original = { ...process.env }

  beforeAll(() => {
    process.env.SHOPIFY_OAUTH_STATE_SECRET = 'test-state-secret-that-is-long-enough'
  })

  afterAll(() => {
    process.env = original
  })

  it('round-trips the payload and stamps an issued-at', () => {
    const state = signOAuthState({ storeId: 's1', userId: 'u1', shop: 'a.myshopify.com' })
    expect(state).toBeTruthy()

    const decoded = verifyOAuthState(state!)
    expect(decoded).toMatchObject({ storeId: 's1', userId: 'u1', shop: 'a.myshopify.com' })
    expect(typeof decoded!.iat).toBe('number')
  })

  it('rejects a tampered body', () => {
    const state = signOAuthState({ shop: 'a.myshopify.com' })!
    const sig = state.slice(state.lastIndexOf('.') + 1)
    const forgedBody = Buffer.from(
      JSON.stringify({ shop: 'victim.myshopify.com', iat: Date.now() }),
    ).toString('base64url')
    expect(verifyOAuthState(`${forgedBody}.${sig}`)).toBeNull()
  })

  it('rejects an expired state', () => {
    const state = signOAuthState({ shop: 'a.myshopify.com' })!
    // Any maxAge smaller than the elapsed time invalidates it.
    expect(verifyOAuthState(state, -1)).toBeNull()
  })

  it('rejects a signed state that carries no issued-at (legacy)', () => {
    const secret = getOAuthStateSecret()!
    const body = Buffer.from(JSON.stringify({ shop: 'a.myshopify.com' })).toString('base64url')
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyOAuthState(`${body}.${sig}`)).toBeNull()
  })

  it('rejects a completely malformed state', () => {
    expect(verifyOAuthState('not-a-state')).toBeNull()
  })
})
