// ── STORE RESOLUTION BY SHOPIFY SHOP DOMAIN ────────────────────────────────
// Resolves the storefront's store from the Shopify permanent shop domain
// (`*.myshopify.com`). Resolution is STRICTLY by exact match: we never
// substring-match, because `{ contains: shop }` let one shop resolve to an
// unrelated store whose domain merely contained the requested value (e.g.
// "a.myshopify.com" matching "xa.myshopify.com"). That leaked another
// merchant's config/persona and opened bargain sessions against the wrong
// store. The exact full-domain match is authoritative; the only fallback is an
// exact bare-handle match for legacy rows that stored the handle instead of the
// full permanent domain.
//
// A domain is also NOT proof of ownership: signup stores whatever domain the
// visitor types (and only marks it active after email verification), so an
// attacker can park a row on a victim shop's domain. Domain-keyed lookups must
// therefore also require the Shopify connection itself (`platform: shopify` +
// a stored access token). Unconnected placeholder rows can never win.

export interface StoreDomainLookup {
  store: {
    findFirst: (args: {
      where: {
        isActive: boolean
        domain: string
        platform: 'shopify'
        apiKey: { not: null }
      }
      orderBy: { createdAt: 'asc' }
      select: { id: true }
    }) => Promise<{ id: string } | null>
  }
}

// Domains we may have stored for a shop: the full permanent domain and, for
// legacy rows, the bare handle. Never substring-match.
export function shopDomainCandidates(shop: string): string[] {
  const normalized = normalizeShopDomain(shop)
  if (!normalized) return []
  const candidates = [normalized]
  if (normalized.endsWith('.myshopify.com')) {
    const handle = normalized.slice(0, -'.myshopify.com'.length)
    if (handle) candidates.push(handle)
  } else if (!normalized.includes('.')) {
    candidates.push(`${normalized}.myshopify.com`)
  }
  return candidates
}

export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/^www\./, '')
}

export async function resolveActiveStoreIdByShopDomain(
  client: StoreDomainLookup,
  shop: string,
): Promise<string | null> {
  const normalizedShop = normalizeShopDomain(shop)
  if (!normalizedShop) return null

  const connected = {
    isActive: true,
    platform: 'shopify' as const,
    apiKey: { not: null } as const,
  }

  const byFullDomain = await client.store.findFirst({
    where: { ...connected, domain: normalizedShop },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (byFullDomain) return byFullDomain.id

  for (const candidate of shopDomainCandidates(normalizedShop)) {
    if (candidate === normalizedShop) continue
    const match = await client.store.findFirst({
      where: { ...connected, domain: candidate },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (match) return match.id
  }

  return null
}
