// ── STORE RESOLUTION BY WHATSAPP PHONE NUMBER ID ───────────────────────────
//
// Meta delivers every inbound WhatsApp message with the `phone_number_id` of the
// business number that received it. Mapping that back to our Store is what lets
// an inbound STOP keyword be persisted as an OptOut against the RIGHT store's
// contact list. Kept pure + structurally typed so it is unit-testable without a
// live database.

export interface StoreWhatsAppLookup {
  store: {
    findFirst: (args: {
      where: { whatsappPhoneNumberId: string; isActive: true }
      select: { id: true }
    }) => Promise<{ id: string } | null>
    findMany: (args: {
      where: { isActive: true }
      select: { id: true }
      take: number
    }) => Promise<Array<{ id: string }>>
  }
}

export function normalizeWhatsAppPhoneNumberId(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export async function resolveStoreIdByWhatsAppPhoneNumberId(
  client: StoreWhatsAppLookup,
  phoneNumberId: string | null | undefined,
): Promise<string | null> {
  const id = normalizeWhatsAppPhoneNumberId(phoneNumberId)
  if (!id) return null

  const direct = await client.store.findFirst({
    where: { whatsappPhoneNumberId: id, isActive: true },
    select: { id: true },
  })
  if (direct) return direct.id

  // Fallback: the phone_number_id column is new and nullable, so most stores
  // will not have recorded one yet. Before any store is mapped we still honour a
  // STOP — but ONLY when the deployment unambiguously owns a single active
  // store. With two or more stores we refuse to guess: suppressing the wrong
  // store's customer list is worse than requiring the mapping to be configured.
  const actives = await client.store.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 2,
  })
  if (actives.length === 1) return actives[0].id
  return null
}
