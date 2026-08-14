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

// Google's OAuth page refuses to render inside any iframe (X-Frame-Options:
// DENY), so the embedded Shopify admin flow cannot navigate the app frame to
// accounts.google.com. Instead we run the OAuth in a real popup window. On
// success, /shopify-auth-success posts a message back to this window.
// 'success'  — OAuth completed and the popup signalled back
// 'closed'   — user closed / cancelled the popup without completing
// 'blocked'  — browser blocked window.open (no popup at all)
export function openGoogleAuthPopup(callbackUrl: string): Promise<'success' | 'closed' | 'blocked'> {
  if (typeof window === 'undefined') return Promise.resolve('blocked')

  const popupUrl = `${window.location.origin}/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`
  const popup = window.open(popupUrl, 'cartgain_google_auth', 'width=520,height=640')
  if (!popup) return Promise.resolve('blocked')

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'cg_auth_complete') return
      cleanup()
      resolve('success')
    }
    const poll = window.setInterval(() => {
      if (popup.closed) {
        cleanup()
        resolve('closed')
      }
    }, 800)
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(poll)
    }
    window.addEventListener('message', onMessage)
  })
}
