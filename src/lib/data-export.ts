import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { sendEmail } from '@/lib/services/email'

// Customer data export (Shopify `customers/data_request`).
//
// When Shopify forwards a customer data request to the app, we are expected to
// make that customer's data available to the merchant so they can fulfill it.
// This module:
//   1. collects every record we hold on the customer (carts, messages,
//      attribution, customer profile + insights, bargain sessions/transcripts,
//      opt-out records);
//   2. persists it as a `CustomerDataExport` row the merchant can download from
//      the dashboard;
//   3. best-effort emails the store owner a copy so the request is fulfilled
//      even if the merchant never opens the dashboard.

// Normalize a Shopify id string: strip "gid://shopify/Customer/" prefixes.
export function normalizeCustomerId(id: string | number | null | undefined): string | null {
  if (id == null || id === '') return null
  const s = String(id)
  const base = s.replace(/^gid:\/\/shopify\/Customer\//, '')
  return base || null
}

export async function collectCustomerData(input: {
  storeId: string
  shopifyCustomerId?: string | null
  email?: string | null
  phone?: string | null
}): Promise<Record<string, unknown>> {
  const { storeId, shopifyCustomerId, email, phone } = input
  const normalize = (v: string | null | undefined) => (v ? v.trim().toLowerCase() : null)
  const emailNorm = normalize(email)
  const phoneNorm = phone ? phone.replace(/\D/g, '') || null : null
  const idMatch = shopifyCustomerId ? { equals: shopifyCustomerId } : undefined

  const [carts, customers, sessions, optOuts] = await Promise.all([
    prisma.cart.findMany({
      where: {
        storeId,
        OR: [
          ...(idMatch ? [{ customerId: idMatch }] : []),
          ...(emailNorm ? [{ customerEmail: emailNorm }] : []),
          ...(phoneNorm ? [{ customerPhone: { contains: phoneNorm } }] : []),
        ],
      },
      include: { messages: true, recoveredCart: true },
      orderBy: { abandonedAt: 'desc' },
      take: 200,
    }),
    prisma.customer.findMany({
      where: {
        storeId,
        OR: [
          ...(idMatch ? [{ customerId: idMatch }] : []),
          ...(emailNorm ? [{ email: emailNorm }] : []),
          ...(phoneNorm ? [{ phone: { contains: phoneNorm } }] : []),
        ],
      },
      include: { customerInsights: true },
      take: 50,
    }),
    prisma.bargainSession.findMany({
      where: {
        storeId,
        OR: [
          ...(emailNorm ? [{ customerEmail: emailNorm }] : []),
          ...(phoneNorm ? [{ customerPhone: { contains: phoneNorm } }] : []),
          ...(idMatch ? [{ cartToken: { in: (await prisma.cart.findMany({ where: { storeId, customerId: idMatch }, select: { cartId: true } })).map(c => c.cartId) } }] : []),
        ],
      },
      include: { messages: true },
      orderBy: { startedAt: 'desc' },
      take: 100,
    }),
    prisma.optOut.findMany({
      where: {
        storeId,
        OR: [
          ...(emailNorm ? [{ email: emailNorm }] : []),
          ...(phoneNorm ? [{ phone: { contains: phoneNorm } }] : []),
        ],
      },
      take: 50,
    }),
  ])

  const exportPayload: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    identity: {
      shopifyCustomerId: shopifyCustomerId || null,
      email: email || null,
      phone: phone || null,
    },
    counts: {
      carts: carts.length,
      customers: customers.length,
      bargainSessions: sessions.length,
      optOuts: optOuts.length,
    },
    carts: carts.map(c => ({
      id: c.id,
      cartId: c.cartId,
      email: c.customerEmail,
      phone: c.customerPhone,
      name: c.customerName,
      items: c.items,
      totalValue: c.totalValue,
      currency: c.currency,
      abandonedAt: c.abandonedAt,
      convertedAt: c.convertedAt,
      isRecovered: c.isRecovered,
      recoveredAt: c.recoveredAt,
      recoveredValue: c.recoveredCart?.recoveredValue ?? null,
      channel: c.recoveredCart?.channel ?? null,
      recoveryStatus: c.recoveredCart?.refundStatus ?? null,
      messages: c.messages.map(m => ({
        id: m.id,
        channel: m.channel,
        content: m.content,
        status: m.status,
        sentAt: m.sentAt,
        deliveredAt: m.deliveredAt,
        clickedAt: m.clickedAt,
        convertedAt: m.convertedAt,
      })),
    })),
    customers: customers.map(c => ({
      id: c.id,
      shopifyCustomerId: c.customerId,
      email: c.email,
      phone: c.phone,
      totalOrders: c.totalOrders,
      codOrders: c.codOrders,
      codRtos: c.codRtos,
      cancellations: c.cancellations,
      firstOrderAt: c.firstOrderAt,
      lastOrderAt: c.lastOrderAt,
      intentType: c.intentType,
      intentScore: c.intentScore,
      insights: c.customerInsights.map(i => ({
        id: i.id,
        intentType: i.intentType,
        intentScore: i.intentScore,
        lifetimeValue: i.lifetimeValue,
        avgOrderValue: i.avgOrderValue,
        totalAbandons: i.totalAbandons,
        totalRecoveries: i.totalRecoveries,
        preferences: i.preferences,
        detectedAt: i.detectedAt,
      })),
    })),
    bargainSessions: sessions.map(s => ({
      id: s.id,
      shopifyProductId: s.shopifyProductId,
      cartToken: s.cartToken,
      email: s.customerEmail,
      phone: s.customerPhone,
      originalPrice: s.originalPrice,
      finalPrice: s.finalPrice,
      discountCode: s.discountCode,
      attemptsUsed: s.attemptsUsed,
      status: s.status,
      language: s.language,
      startedAt: s.startedAt,
      expiredAt: s.expiredAt,
      messages: s.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        offeredPrice: m.offeredPrice,
        createdAt: m.createdAt,
      })),
    })),
    optOuts: optOuts.map(o => ({
      id: o.id,
      email: o.email,
      phone: o.phone,
      reason: o.reason,
      optedOutAt: o.optedOutAt,
    })),
  }

  return exportPayload
}

/**
 * Persist an export column for a data request and try to email the store owner
 * so the request is fulfilled programmatically. Returns the created row.
 */
export async function createCustomerDataExport(input: {
  storeId: string
  shopifyCustomerId?: string | null
  email?: string | null
  payload: Record<string, unknown>
}): Promise<any> {
  return prisma.customerDataExport.create({
    data: {
      storeId: input.storeId,
      shopifyCustomerId: input.shopifyCustomerId || null,
      email: input.email || null,
      payload: input.payload as any,
      status: 'ready',
    },
  })
}

export async function deliverCustomerDataExportToMerchant(input: {
  storeId: string
  storeDomain: string
  ownerEmail: string | null
  exportId: string
  shopifyCustomerId?: string | null
  email?: string | null
}): Promise<{ sent: boolean; message?: string }> {
  if (!input.ownerEmail) {
    return { sent: false, message: 'no merchant email on file' }
  }

  try {
    const result = await sendEmail({
      to: input.ownerEmail,
      subject: 'CartGain — customer data request completed',
      text: [
        `A customer placed a data request on ${input.storeDomain}.`,
        `Our records for ${input.email || input.shopifyCustomerId || 'this customer'} have been gathered.`,
        '',
        `Download a machine-readable copy from your CartGain dashboard:`,
        `https://cart-gain.com/dashboard/data`,
        '',
        `Export id: ${input.exportId}`,
        'If further assistance is needed, contact support.',
      ].join('\n'),
      html: `<p>A customer placed a <strong>data request</strong> on <strong>${input.storeDomain}</strong>.</p>
<p>Our records for <strong>${input.email || input.shopifyCustomerId || 'this customer'}</strong> have been gathered into a machine-readable export.</p>
<p>Download a copy from your <a href="https://cart-gain.com/dashboard/data">CartGain dashboard → Data Protection</a>.</p>
<p style="color:#64748b;font-size:12px">Export id: ${input.exportId}</p>`,
    })

    if (result.success) {
      await prisma.customerDataExport.update({
        where: { id: input.exportId },
        data: { status: 'delivered' },
      })
      await logDataAccess({
        actorType: 'system',
        action: 'access',
        resourceType: 'customer_data_export',
        resourceId: input.exportId,
        purpose: 'shopify customers/data_request delivered to merchant',
        metadata: { storeDomain: input.storeDomain, ownerEmail: input.ownerEmail },
      })
      return { sent: true, message: result.messageId }
    }
    return { sent: false, message: result.error }
  } catch (err: any) {
    return { sent: false, message: err?.message || 'email delivery failed' }
  }
}

// Value helper for the redaction path: given an export of the customer's
// session ids, delete them from the DB. Kept in this module so deletion and
// export share one view of "what did we have".
export async function deleteCustomerDataExport(exportId: string): Promise<void> {
  await prisma.customerDataExport.deleteMany({ where: { id: exportId } }).catch(() => {})
}