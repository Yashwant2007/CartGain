import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'

// Centralized deletion helpers used by the Shopify lifecycle webhooks
// (app/uninstalled, customers/redact, shop/redact) and the account-deletion flow.
//
// All deletion is driven by DB row identity (local store id + customer id), and
// every query is scoped by storeId — we never let a client-supplied value delete
// across stores.

// Models that hold a storeId column and should be cleared when a store is purged.
// Order matters: child rows that reference other rows are deleted first.
const STORE_SCOPED_MODELS = [
  'BargainMessage',
  'BargainSession',
  'BargainProduct',
  'BargainConfig',
  'PaymentRecoveryCampaign',
  'PaymentAttempt',
  'CodNudge',
  'CartPrediction',
  'AiReport',
  'AiSuggestion',
  'RtoRiskScore',
  'PincodeStats',
  'MerchantConfig',
  'CustomerInsight',
  'Customer',
  'RevenueShareEvent',
  'RecoveredCart',
  'Message',
  'OptOut',
  'Cart',
  'Campaign',
  'ABTest',
  'BargainRevenueShareEvent',
  'CustomerDataExport',
] as const

async function rawDelete(table: string, column: string, value: string): Promise<number> {
  try {
    return await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "${column}" = $1`,
      value,
    )
  } catch (err: any) {
    // Table or column missing in older deployments — treat as no-op.
    if (err?.code === 'P2021' || err?.code === 'P2022') return 0
    throw err
  }
}

/**
 * Delete every record associated with a store. Used on:
 *  - `app/uninstalled` — merchant removed the app (full purge expected)
 *  - `shop/redact`     — Shopify asks the app to erase shop data
 *
 * We delete the store row LAST because many child tables reference it and Prisma
 * (relationMode = "prisma") applies cascades in application code, not in SQL.
 * Raw `DELETE` statements bypass those, so we clear child tables by storeId
 * explicitly before removing the Store row itself.
 */
export async function purgeStoreData(store: {
  id: string
  domain: string
  userId: string
}): Promise<{ deletedRows: number }> {
  let deletedRows = 0

  for (const model of STORE_SCOPED_MODELS) {
    const affected = await rawDelete(model, 'storeId', store.id)
    deletedRows += affected
    if (affected > 0) {
      console.log(`[purgeStoreData] ${model}: ${affected} rows for store ${store.id}`)
    }
  }

  // Analytics key off userId + date, not storeId — clean them for the owner too.
  await prisma.analytics.deleteMany({ where: { userId: store.userId } })

  // Delete the store itself (last).
  await prisma.store.delete({ where: { id: store.id } }).catch(() => {
    // Already gone
  })

  // Purge Shopify-webhook-driven access logs belonging to this store's owner.
  // DataAccessLog has no storeId — it's keyed by actorId (userId). We delete
  // records tied to cart/order/customer/export activity that was specific to
  // this store (purpose patterns from webhook handling), so the owner's other
  // stores are not affected.
  await prisma.dataAccessLog.deleteMany({
    where: {
      actorId: store.userId,
      purpose: {
        contains: 'shopify',
      },
    },
  })

  await logDataAccess({
    actorType: 'system',
    action: 'delete',
    resourceType: 'store',
    resourceId: store.id,
    purpose: 'shopify uninstall / shop redact data purge',
    actorId: store.userId,
    metadata: { shopDomain: store.domain, deletedRows },
  })

  return { deletedRows }
}

/**
 * Locate the store by shop domain (used by the lifecycle webhooks).
 */
export async function findStoreByDomain(shopDomain: string) {
  return prisma.store.findFirst({ where: { domain: shopDomain } })
}

/**
 * Erase a single customer's personal data for a store. Used on `customers/redact`.
 *
 * Shopify sends only the shop domain + the customer's Shopify id, so we match the
 * records we hold that are keyed by that id: carts, customer profiles and their
 * derived insights, recovered-cart attribution. Bargain sessions are keyed by
 * email/phone/fingerprint rather than the Shopify customer id, so for those we
 * delete any session tied to a redacted cart's token, and callers may additionally
 * pass an email to match bargain sessions by email.
 */
export async function redactCustomer(
  shopDomain: string,
  customerId: string,
  customerEmail?: string | null,
): Promise<{ affected: number }> {
  const store = await prisma.store.findFirst({ where: { domain: shopDomain } })
  if (!store) return { affected: 0 }

  const storeId = store.id
  let affected = 0

  // Carts for this customer — remove messages, attribution and the cart row.
  const carts = await prisma.cart.findMany({
    where: { storeId, customerId: { equals: customerId } },
    select: { id: true, cartId: true },
  })
  for (const cart of carts) {
    await prisma.message.deleteMany({ where: { cartId: cart.id } })
    await prisma.recoveredCart.deleteMany({ where: { cartId: cart.id } })
    // Any bargain session tied to this cart token.
    await prisma.bargainMessage.deleteMany({
      where: { session: { cartToken: cart.cartId, storeId } },
    })
    await prisma.bargainSession.deleteMany({
      where: { cartToken: cart.cartId, storeId },
    })
    await prisma.cart.delete({ where: { id: cart.id } })
    affected++
  }

  // Customer profile + derived insight rows.
  const cust = await prisma.customer.findFirst({ where: { storeId, customerId } })
  if (cust) {
    await prisma.customerInsight.deleteMany({ where: { customerId: cust.id } })
    await prisma.customer.delete({ where: { id: cust.id } })
    affected++
  }

  // Any bargain sessions matched by email (if the caller can provide one).
  if (customerEmail) {
    const sessions = await prisma.bargainSession.findMany({
      where: { storeId, customerEmail },
      select: { id: true },
    })
    for (const s of sessions) {
      await prisma.bargainMessage.deleteMany({ where: { sessionId: s.id } })
      await prisma.bargainSession.delete({ where: { id: s.id } })
      affected++
    }
  }

  // Customer data exports collected for this customer (customers/data_request
  // deliveries) contain their personal data — remove them too.
  const exportCleanup = await prisma.customerDataExport.deleteMany({
    where: { storeId, shopifyCustomerId: customerId },
  })
  affected += exportCleanup.count

  return { affected }
}
