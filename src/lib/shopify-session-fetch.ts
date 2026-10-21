'use client'

// ── Shopify ID token (a.k.a. session token) plumbing ───────────────────────
//
// Apps embedded in the Shopify admin MUST authenticate with ID tokens: the
// admin iframe is a cross-site context, so third-party cookies are not
// reliably available there. App Bridge mints a short-lived ID token
// (`shopify.idToken()`) and the app sends it to its own backend as
// `Authorization: Bearer <token>` on every request.
//
// Two things broke that flow before:
//   1. `idToken()` blocks for up to 60s when the admin never answers, so an
//      unbounded `await` froze the whole app (and the request went out
//      without a header once App Bridge gave up).
//   2. Only some dashboard pages used the session-aware fetch helper, so most
//      /api requests went out without the Authorization header.
//
// Everything below is therefore bounded in time and applied to every
// same-origin /api request, not just the ones that remember to opt in.

const BRIDGE_WAIT_MS = 4000
const TOKEN_WAIT_MS = 6000
const POLL_MS = 50

// ID tokens live ~60s. We re-use one for a short while to avoid hammering the
// admin for a new token on every single request, but never long enough to
// risk handing out an expired one.
const CACHE_TTL_MS = 10000

const RETRY_INVALID_SESSION_HEADER = 'X-Shopify-Retry-Invalid-Session-Request'

type AppBridgeGlobal = {
  idToken?: () => Promise<string>
  ready?: Promise<unknown>
  config?: { shop?: string; host?: string; apiKey?: string }
}

function getBridge(): AppBridgeGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { shopify?: AppBridgeGlobal }).shopify
}

/** True when the page runs inside the Shopify admin (or carries embed params). */
export function isShopifyEmbeddedContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window !== window.top) return true
  try {
    const params = new URLSearchParams(window.location.search)
    return Boolean(params.get('shop'))
  } catch {
    return false
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)
    promise
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

/**
 * Wait for the App Bridge runtime to be usable. The CDN bundle assigns
 * `shopify.idToken` asynchronously and exposes `shopify.ready`, which
 * resolves once the runtime finished initialising.
 */
async function waitForBridge(): Promise<AppBridgeGlobal | null> {
  if (typeof window === 'undefined') return null
  const deadline = Date.now() + BRIDGE_WAIT_MS
  while (Date.now() < deadline) {
    const bridge = getBridge()
    if (bridge && typeof bridge.idToken === 'function') {
      if (bridge.ready && typeof bridge.ready.then === 'function') {
        await withTimeout(bridge.ready as Promise<unknown>, BRIDGE_WAIT_MS, undefined)
      }
      return bridge
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return null
}

let cachedToken: { token: string; at: number } | null = null
let inflightToken: Promise<string | null> | null = null

/**
 * Return a fresh Shopify ID token, or null when the app is not embedded (or
 * the admin did not answer in time). Never throws and never blocks longer
 * than BRIDGE_WAIT_MS + TOKEN_WAIT_MS.
 */
export function getShopifyIdToken(opts?: { force?: boolean }): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  if (!opts?.force && cachedToken && Date.now() - cachedToken.at < CACHE_TTL_MS) {
    return Promise.resolve(cachedToken.token)
  }

  if (inflightToken) return inflightToken

  inflightToken = (async () => {
    if (!isShopifyEmbeddedContext()) return null
    const bridge = await waitForBridge()
    if (!bridge || typeof bridge.idToken !== 'function') return null
    try {
      const token = await withTimeout(
        Promise.resolve(bridge.idToken()),
        TOKEN_WAIT_MS,
        null as string | null
      )
      if (typeof token === 'string' && token) {
        cachedToken = { token, at: Date.now() }
        return token
      }
      return null
    } catch {
      return null
    }
  })().finally(() => {
    inflightToken = null
  })

  return inflightToken
}

/** Drop the cached token (used after a 401 so the next attempt is fresh). */
export function clearShopifyIdTokenCache(): void {
  cachedToken = null
}

function isSameOriginApiRequest(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.origin !== window.location.origin) return false
    return parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (input && typeof (input as Request).url === 'string') return (input as Request).url
  return String(input)
}

function buildRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Headers
): Request {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new Request(input, { headers })
  }
  return new Request(input as RequestInfo, { ...(init || {}), headers })
}

/**
 * Attach the current ID token to a request. Returns the response untouched
 * when the request is not an embedded same-origin /api call, or when no token
 * could be obtained.
 */
export async function shopifySessionFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const url = requestUrl(input)
  if (!isSameOriginApiRequest(url)) {
    return fetch(input, { ...init, credentials: init.credentials || 'include' })
  }

  const existing = new Headers(
    input instanceof Request ? input.headers : init.headers || undefined
  )
  if (existing.has('Authorization')) {
    return fetch(input, { ...init, credentials: init.credentials || 'include' })
  }

  const token = await getShopifyIdToken()
  if (!token) {
    return fetch(input, { ...init, credentials: init.credentials || 'include' })
  }

  const headers = new Headers(existing)
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(buildRequest(input, init, headers), {
    ...init,
    headers,
    credentials: init.credentials || 'include',
  })

  // Shopify asks the app to answer an invalid/expired session with this
  // header; App Bridge then mints a new ID token and retries the request.
  if (response.status === 401 && response.headers.get(RETRY_INVALID_SESSION_HEADER)) {
    const fresh = await getShopifyIdToken({ force: true })
    if (fresh && fresh !== token) {
      const retryHeaders = new Headers(headers)
      retryHeaders.set('Authorization', `Bearer ${fresh}`)
      return fetch(buildRequest(input, init, retryHeaders), {
        ...init,
        headers: retryHeaders,
        credentials: init.credentials || 'include',
      })
    }
  }

  return response
}

let fetchPatched = false

/**
 * Attach the ID token to every same-origin /api request, including the ones
 * that use a plain `fetch()`. Installed as early as possible so the very first
 * request of a page already carries the header.
 */
export function installShopifyAuthFetchPatch(): void {
  if (fetchPatched || typeof window === 'undefined') return
  if (typeof window.fetch !== 'function') return
  fetchPatched = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input)
    if (!isSameOriginApiRequest(url)) {
      return originalFetch(input as RequestInfo, init)
    }

    const existing = new Headers(
      input instanceof Request ? input.headers : init?.headers || undefined
    )
    if (existing.has('Authorization')) {
      return originalFetch(input as RequestInfo, init)
    }

    const token = await getShopifyIdToken()
    if (!token) {
      return originalFetch(input as RequestInfo, init)
    }

    const headers = new Headers(existing)
    headers.set('Authorization', `Bearer ${token}`)

    const response = await originalFetch(buildRequest(input, init, headers) as RequestInfo, {
      ...(init || {}),
      headers,
    })

    if (response.status === 401 && response.headers.get(RETRY_INVALID_SESSION_HEADER)) {
      const fresh = await getShopifyIdToken({ force: true })
      if (fresh && fresh !== token) {
        const retryHeaders = new Headers(headers)
        retryHeaders.set('Authorization', `Bearer ${fresh}`)
        return originalFetch(buildRequest(input, init, retryHeaders) as RequestInfo, {
          ...(init || {}),
          headers: retryHeaders,
        })
      }
    }

    return response
  }
}

// Install the patch as soon as the module is evaluated in an embedded
// context — page effects run bottom-up, so installing it from a React effect
// would be too late for the first requests of a page.
if (typeof window !== 'undefined' && isShopifyEmbeddedContext()) {
  installShopifyAuthFetchPatch()
}
