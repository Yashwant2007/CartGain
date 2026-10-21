'use client'

// How long we are willing to wait for App Bridge to hand out a session token.
// The token is normally available within a few hundred milliseconds (App Bridge
// assigns `idToken` asynchronously right after it boots), so a short bounded
// wait is enough. Never block a request for seconds: if App Bridge is not
// present at all, return immediately.
const TOKEN_WAIT_TIMEOUT_MS = 2500
const TOKEN_POLL_MS = 25

async function readAppBridgeIdToken(bridge: any): Promise<string | null> {
  try {
    if (typeof bridge?.idToken === 'function') {
      const token = await bridge.idToken()
      if (typeof token === 'string' && token) return token
    }
  } catch {}
  try {
    if (typeof bridge?.auth?.idToken === 'function') {
      const token = await bridge.auth.idToken()
      if (typeof token === 'string' && token) return token
    }
  } catch {}
  try {
    if (typeof bridge?.auth?.getSessionToken === 'function') {
      const token = await bridge.auth.getSessionToken()
      if (typeof token === 'string' && token) return token
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      const cached = (window as any).__shopifySessionTokenCached
      if (typeof cached === 'string' && cached) return cached
    }
  } catch {}
  return null
}

async function getShopifyIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const w = window as any

  if (typeof w.__shopifySessionTokenCached === 'string' && w.__shopifySessionTokenCached) {
    return w.__shopifySessionTokenCached
  }

  // App Bridge is only loaded for embedded (Shopify admin) requests. If it is
  // not on the page there is no session token to wait for — bail out instead
  // of stalling every request.
  if (!w.shopify) return null

  const deadline = Date.now() + TOKEN_WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const token = await readAppBridgeIdToken(w.shopify)
    if (token) return token
    await new Promise((r) => setTimeout(r, TOKEN_POLL_MS))
  }
  return null
}

export async function shopifySessionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)

  try {
    const token = await getShopifyIdToken()
    if (token && typeof token === 'string') {
      headers.set('Authorization', `Bearer ${token}`)
    }
  } catch (err) {
    // ignore
  }

  return fetch(input, { ...init, headers, credentials: init.credentials || 'include' })
}
