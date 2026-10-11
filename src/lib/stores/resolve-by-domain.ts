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

export interface StoreDomainLookup {
  store: {
    findFirst: (args: {
      where: { isActive: boolean; domain: string }
      orderBy: { createdAt: 'asc' }
      select: { id: true }
    }) => Promise<{ id: string } | null>
  }
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

  const byFullDomain = await client.store.findFirst({
    where: { isActive: true, domain: normalizedShop },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (byFullDomain) return byFullDomain.id

  if (normalizedShop.endsWith('.myshopify.com')) {
    const handle = normalizedShop.slice(0, -'.myshopify.com'.length)
    if (handle) {
      const byHandle = await client.store.findFirst({
        where: { isActive: true, domain: handle },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (byHandle) return byHandle.id
    }
  }

  return null
}
