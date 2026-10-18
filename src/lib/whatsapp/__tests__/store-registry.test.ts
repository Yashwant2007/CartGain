import {
  resolveStoreIdByWhatsAppPhoneNumberId,
  normalizeWhatsAppPhoneNumberId,
  type StoreWhatsAppLookup,
} from '../store-registry'

type StoreRow = { id: string; whatsappPhoneNumberId?: string | null; isActive?: boolean }

function makeClient(rows: StoreRow[]) {
  const client: StoreWhatsAppLookup = {
    store: {
      findFirst: async ({ where }) => {
        const hit = rows.find(
          (r) =>
            (r.isActive ?? true) === where.isActive &&
            (r.whatsappPhoneNumberId ?? null) === where.whatsappPhoneNumberId,
        )
        return hit ? { id: hit.id } : null
      },
      findMany: async ({ where, take }) => {
        const actives = rows.filter((r) => (r.isActive ?? true) === where.isActive)
        return actives.slice(0, take).map((r) => ({ id: r.id }))
      },
    },
  }
  return client
}

describe('resolveStoreIdByWhatsAppPhoneNumberId', () => {
  it('resolves the exact store that owns the phone number id', async () => {
    const client = makeClient([
      { id: 'store-a', whatsappPhoneNumberId: 'PN1' },
      { id: 'store-b', whatsappPhoneNumberId: 'PN2' },
    ])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, 'PN2')).resolves.toBe('store-b')
  })

  it('trims surrounding whitespace from the inbound phone number id', async () => {
    const client = makeClient([{ id: 'store-a', whatsappPhoneNumberId: 'PN1' }])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, '  PN1 ')).resolves.toBe('store-a')
  })

  it('never matches an inactive store', async () => {
    const client = makeClient([{ id: 'store-off', whatsappPhoneNumberId: 'PN1', isActive: false }])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, 'PN1')).resolves.toBeNull()
  })

  it('falls back to the sole active store when none records a phone number id', async () => {
    const client = makeClient([{ id: 'only-store' }])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, 'PN1')).resolves.toBe('only-store')
  })

  it('refuses to guess when multiple stores are active and none match', async () => {
    const client = makeClient([
      { id: 'store-a' },
      { id: 'store-b' },
    ])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, 'PN1')).resolves.toBeNull()
  })

  it('prefers the direct match even when several stores are active', async () => {
    const client = makeClient([
      { id: 'store-a' },
      { id: 'store-b', whatsappPhoneNumberId: 'PN1' },
    ])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, 'PN1')).resolves.toBe('store-b')
  })

  it('returns null for an empty / missing phone number id', async () => {
    const client = makeClient([{ id: 'only-store' }])
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, '')).resolves.toBeNull()
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, null)).resolves.toBeNull()
    await expect(resolveStoreIdByWhatsAppPhoneNumberId(client, undefined)).resolves.toBeNull()
  })

  it('normalizeWhatsAppPhoneNumberId trims and tolerates null', () => {
    expect(normalizeWhatsAppPhoneNumberId('  PN1 ')).toBe('PN1')
    expect(normalizeWhatsAppPhoneNumberId(null)).toBe('')
    expect(normalizeWhatsAppPhoneNumberId(undefined)).toBe('')
  })
})
