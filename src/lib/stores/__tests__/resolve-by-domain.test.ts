import {
  resolveActiveStoreIdByShopDomain,
  normalizeShopDomain,
  type StoreDomainLookup,
} from '../resolve-by-domain'

// A faithful-enough Prisma stub: `findFirst` returns the first active store
// whose domain is EXACTLY the queried value (Prisma's `equals` semantics). This
// is what makes the regression meaningful — if the implementation ever passes a
// `contains`/`endsWith` clause, the stub won't fuzzy-match, just like a real
// exact-only query would not.
function makeClient(stores: Array<{ id: string; domain: string; isActive?: boolean }>): {
  client: StoreDomainLookup
  queriedDomains: string[]
} {
  const queriedDomains: string[] = []
  const client: StoreDomainLookup = {
    store: {
      findFirst: async ({ where }) => {
        queriedDomains.push(where.domain)
        const hit = stores.find(
          (s) => (s.isActive ?? true) === where.isActive && s.domain === where.domain,
        )
        return hit ? { id: hit.id } : null
      },
    },
  }
  return { client, queriedDomains }
}

describe('resolveActiveStoreIdByShopDomain', () => {
  it('resolves by exact full permanent domain', async () => {
    const { client } = makeClient([{ id: 'store-a', domain: 'acme.myshopify.com' }])
    await expect(resolveActiveStoreIdByShopDomain(client, 'acme.myshopify.com')).resolves.toBe(
      'store-a',
    )
  })

  it('normalizes case and a leading www.', async () => {
    const { client } = makeClient([{ id: 'store-a', domain: 'acme.myshopify.com' }])
    await expect(
      resolveActiveStoreIdByShopDomain(client, '  WWW.Acme.MyShopify.com '),
    ).resolves.toBe('store-a')
  })

  it('does NOT match an unrelated store whose domain merely contains the shop', async () => {
    // The original `{ contains: shop }` bug: shop "a.myshopify.com" resolved to
    // "xa.myshopify.com". Exact matching must return null here.
    const { client, queriedDomains } = makeClient([
      { id: 'store-xa', domain: 'xa.myshopify.com' },
    ])
    await expect(resolveActiveStoreIdByShopDomain(client, 'a.myshopify.com')).resolves.toBeNull()
    // And it must have queried the exact full domain, not a substring clause.
    expect(queriedDomains).toContain('a.myshopify.com')
  })

  it('falls back to an exact bare-handle match for legacy rows', async () => {
    const { client } = makeClient([{ id: 'store-legacy', domain: 'acme' }])
    await expect(resolveActiveStoreIdByShopDomain(client, 'acme.myshopify.com')).resolves.toBe(
      'store-legacy',
    )
  })

  it('prefers the full-domain match over a coexisting bare-handle row', async () => {
    const { client } = makeClient([
      { id: 'store-handle', domain: 'acme' },
      { id: 'store-full', domain: 'acme.myshopify.com' },
    ])
    await expect(resolveActiveStoreIdByShopDomain(client, 'acme.myshopify.com')).resolves.toBe(
      'store-full',
    )
  })

  it('returns null when nothing matches', async () => {
    const { client } = makeClient([{ id: 'store-a', domain: 'other.myshopify.com' }])
    await expect(resolveActiveStoreIdByShopDomain(client, 'acme.myshopify.com')).resolves.toBeNull()
  })

  it('handles empty / whitespace shop input', async () => {
    const { client } = makeClient([{ id: 'store-a', domain: 'acme.myshopify.com' }])
    await expect(resolveActiveStoreIdByShopDomain(client, '   ')).resolves.toBeNull()
  })

  it('normalizeShopDomain strips scheme-less www and lowercases', () => {
    expect(normalizeShopDomain('WWW.Shop.MyShopify.com')).toBe('shop.myshopify.com')
  })
})
