'use client'

export function isInShopifyEmbed(): boolean {
  if (typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  const hasShopifyParams = params.has('shop') && params.get('host') !== null
  const isInIframe = window !== window.top

  return hasShopifyParams || isInIframe
}

export function getShopifyEmbedParams(): { shop?: string; host?: string } {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return {
    shop: params.get('shop') || undefined,
    host: params.get('host') || undefined,
  }
}

export function getEmbedAwareRedirectUrl(path: string): string {
  const { shop, host } = getShopifyEmbedParams()
  let url = path
  if (shop) url += `${url.includes('?') ? '&' : '?'}shop=${encodeURIComponent(shop)}`
  if (host) url += `${url.includes('?') ? '&' : '?'}host=${encodeURIComponent(host)}`
  return url
}

export function getGoogleSignInUrl(): string {
  const callbackUrl = getEmbedAwareRedirectUrl('/dashboard')
  return `/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`
}

export function redirectTopForAuth(): void {
  if (typeof window === 'undefined' || !window.top) return
  const authUrl = getGoogleSignInUrl()
  window.top.location.href = `${window.location.origin}${authUrl}`
}

// ── Embedded Google OAuth outcome ──

export type GoogleAuthOutcome =
  | { status: 'success' }
  | { status: 'closed' }
  | { status: 'blocked' }
  | { status: 'error'; error: string }

// Friendly copy for every NextAuth OAuth error code the embedded popup can
// land on. Shared by the popup's /auth/error page and the parent iframe.
const GOOGLE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: 'Google sign-in could not be started. Please try again.',
  OAuthCallback: 'Google did not complete the sign-in. Please try again.',
  OAuthCreateAccount: 'Google could not create your account. Please try again.',
  OAuthAccountNotLinked:
    'This Google account is already used by a different CartGain account. Sign in with that account, or use a different Google/email account.',
  AlreadySignedIn:
    'A different account is currently signed in. Sign out first, then try again.',
  NoAccount:
    'No CartGain account exists for this Google account. Use the Sign up flow instead.',
  AccessDenied: 'Google sign-in was not approved. Allow CartGain access to continue.',
  Configuration:
    'Google sign-in is not fully configured on this deployment. Please contact support.',
  Verification: 'The sign-in link has expired or is invalid. Please try again.',
  Default: 'Google sign-in did not complete. Please try again.',
}

export function googleAuthErrorMessage(code: string): string {
  return GOOGLE_AUTH_ERROR_MESSAGES[code] ?? GOOGLE_AUTH_ERROR_MESSAGES.Default
}

export type GoogleAuthIntent = 'signin' | 'signup'

// Google's OAuth page refuses to render inside any iframe (X-Frame-Options:
// DENY), so the embedded Shopify admin flow cannot navigate the app frame to
// accounts.google.com. Instead we run the OAuth in a real popup window.
//
// The popup is opened SYNCHRONOUSLY (before the first await) so the click's
// transient user activation survives and the browser won't silently block it
// (Safari/Firefox are strictest). The popup loads /shopify-auth-start, which
// sets the sign-in intent cookie first-party (reliable in every browser) and
// then performs the Google sign-in form POST as a real top-level navigation.
//
// The popup reports back with postMessage:
//   cg_auth_complete   — OAuth finished (NextAuth redirected to the success page)
//   cg_auth_error      — NextAuth landed on an error page; listener carries the code
// 'closed'            — user closed / cancelled the popup, or the popup never
//                       surfaced our pages (e.g. NextAuth redirected elsewhere)
//
// Callers should treat 'success' and 'closed' identically: verify the session
// via /api/auth/session before navigating — the popup can finish OAuth and
// land somewhere other than the success page (e.g. /setup?requirePassword=1).
export function openGoogleAuthPopup(opts: {
  callbackUrl: string
  intent: GoogleAuthIntent
}): Promise<GoogleAuthOutcome> {
  if (typeof window === 'undefined') return Promise.resolve({ status: 'blocked' })

  const startUrl =
    `/shopify-auth-start?intent=${opts.intent}` +
    `&cb=${encodeURIComponent(opts.callbackUrl)}`

  // Synchronous window.open: must happen before any await so the popup isn't
  // blocked. The intent cookie is set first-party by the popup itself.
  const popup = window.open(startUrl, 'cartgain_google_auth', 'width=540,height=680')
  if (!popup) return Promise.resolve({ status: 'blocked' })

  // Fire-and-forget fallback: also set the Partitioned intent cookie from the
  // iframe partition. The popup's own first-party set is authoritative under
  // CHIPS; this covers browsers where the popup's set raced the OAuth POST.
  fetch('/api/auth/oauth-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: opts.intent }),
  }).catch(() => {})

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; error?: string } | null
      if (!data || typeof data.type !== 'string') return
      if (data.type === 'cg_auth_complete') {
        cleanup()
        resolve({ status: 'success' })
      } else if (data.type === 'cg_auth_error') {
        cleanup()
        resolve({ status: 'error', error: data.error || 'Default' })
      }
    }
    const poll = window.setInterval(() => {
      if (popup.closed) {
        cleanup()
        resolve({ status: 'closed' })
      }
    }, 800)
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(poll)
    }
    window.addEventListener('message', onMessage)
  })
}