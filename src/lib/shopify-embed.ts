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
