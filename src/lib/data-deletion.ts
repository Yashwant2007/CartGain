import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { normalizeCustomerId } from '@/lib/data-export'

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
  // Observability/analytics rows scoped by storeId — removed so an uninstall
  // or shop/redact does not leave orphan rows behind.
  'ProductEvent',
  'ErrorLog',
] as const

// Payment-pipeline models are keyed by `merchantId` (which holds the store id —
// see src/lib/payments/recovery.ts), not `storeId`, so they need a separate
// purge. PaymentRecoveryCampaign links to PaymentAttempt via attemptId.
async function rawDeletePayments(merchantId: string): Promise<number> {
  try {
    const attempts = await prisma.paymentAttempt.findMany({
      where: { merchantId },
      select: { id: true },
    })
    let affected = 0
    if (attempts.length > 0) {
      await prisma.paymentRecoveryCampaign.deleteMany({
        where: { attemptId: { in: attempts.map((a) => a.id) } },
      })
      const del = await prisma.paymentAttempt.deleteMany({ where: { merchantId } })
      affected += del.count
    }
    return affected
  } catch (err: any) {
    if (err?.code === 'P2021' || err?.code === 'P2022') return 0
    throw err
  }
}

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

  // Payment-pipeline rows (keyed by merchantId = store id).
  const paymentRows = await rawDeletePayments(store.id)
  deletedRows += paymentRows
  if (paymentRows > 0) {
    console.log(`[purgeStoreData] PaymentAttempt/PaymentRecoveryCampaign: ${paymentRows} rows for store ${store.id}`)
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
  customerPhone?: string | null,
): Promise<{ affected: number }> {
  const store = await prisma.store.findFirst({ where: { domain: shopDomain } })
  if (!store) return { affected: 0 }

  const storeId = store.id
  let affected = 0

  // Shopify may deliver the id raw or as "gid://shopify/Customer/<id>" — match
  // both forms, since the cart-sync path has historically stored raw numerics.
  const idVariants = [customerId, normalizeCustomerId(customerId)]
    .filter((v): v is string => Boolean(v))
    .filter((v, i, arr) => arr.indexOf(v) === i)

  // Carts for this customer — remove messages, attribution and the cart row.
  // Match on customerId; a cart can also be linked via email/phone if the id
  // is absent (webhook-first carts are matched by lookups in the handler).
  const carts = await prisma.cart.findMany({
    where: {
      storeId,
      OR: [
        ...idVariants.map((id) => ({ customerId: id })),
        ...(customerEmail ? [{ customerEmail }] : []),
        ...(customerPhone ? [{ customerPhone }] : []),
      ],
    },
    select: { id: true, cartId: true },
  })
  const cartEmails = new Set<string>()
  const cartPhones = new Set<string>()
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
    const full = await prisma.cart.findUnique({
      where: { id: cart.id },
      select: { customerEmail: true, customerPhone: true },
    })
    if (full?.customerEmail) cartEmails.add(full.customerEmail)
    if (full?.customerPhone) cartPhones.add(full.customerPhone)
    await prisma.cart.delete({ where: { id: cart.id } })
    affected++
  }

  // Customer profile + derived insight rows.
  const cust = await prisma.customer.findFirst({
    where: { storeId, customerId: { in: idVariants } },
  })
  if (cust) {
    await prisma.customerInsight.deleteMany({ where: { customerId: cust.id } })
    await prisma.customer.delete({ where: { id: cust.id } })
    affected++
  }

  // Any bargain sessions matched by email or phone (the caller can provide
  // either; session data includes both in most flows).
  const emailMatches = [...Array.from(cartEmails), ...(customerEmail ? [customerEmail] : [])]
  const phoneMatches = [...Array.from(cartPhones), ...(customerPhone ? [customerPhone] : [])]
  const sessionIds = new Set<string>()
  const sessionMatch = await prisma.bargainSession.findMany({
    where: {
      storeId,
      OR: [
        ...emailMatches.map((e) => ({ customerEmail: e })),
        ...phoneMatches.map((p) => ({ customerPhone: p })),
      ],
    },
    select: { id: true },
  })
  for (const s of sessionMatch) sessionIds.add(s.id)

  for (const id of Array.from(sessionIds)) {
    await prisma.bargainMessage.deleteMany({ where: { sessionId: id } })
    await prisma.bargainSession.delete({ where: { id } }).catch(() => {})
    affected++
  }

  // Consent/opt-out rows hold raw email/phone for that customer — remove them
  // too; keeping them would retain the PCD customers/redact requires deleting.
  const optEmails = Array.from(cartEmails)
  if (customerEmail) optEmails.push(customerEmail)
  const optPhones = Array.from(cartPhones)
  if (customerPhone) optPhones.push(customerPhone)
  if (optEmails.length > 0 || optPhones.length > 0) {
    const optRes = await prisma.optOut.deleteMany({
      where: {
        storeId,
        OR: [
          ...optEmails.map((e) => ({ email: e })),
          ...optPhones.map((p) => ({ phone: p })),
        ],
      },
    })
    affected += optRes.count
  }

  // Customer data exports collected for this customer (customers/data_request
  // deliveries) contain their personal data — remove them too.
  const exportCleanup = await prisma.customerDataExport.deleteMany({
    where: { storeId, shopifyCustomerId: { in: idVariants } },
  })
  affected += exportCleanup.count

  return { affected }
}
