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

function redactUrls(value: unknown): string | null {
  if (value == null) return null
  return String(value).replace(/https?:\/\/\S+/gi, '[link redacted]')
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
  const idVariants = Array.from(new Set(
    [shopifyCustomerId, normalizeCustomerId(shopifyCustomerId)].filter(Boolean),
  )) as string[]

  const [carts, customers, sessions, optOuts, identities] = await Promise.all([
    prisma.cart.findMany({
      where: {
        storeId,
        OR: [
          ...idVariants.map((id) => ({ customerId: { equals: id } })),
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
          ...idVariants.map((id) => ({ customerId: { equals: id } })),
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
          ...(idVariants.length ? [{ cartToken: { in: (await prisma.cart.findMany({ where: { storeId, customerId: { in: idVariants } }, select: { cartId: true } })).map(c => c.cartId) } }] : []),
        ],
      },
      include: { messages: true, learningOutcome: true, learningEvents: true },
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
    prisma.customerIdentity.findMany({
      where: {
        storeId,
        OR: [
          ...(idVariants.length ? [{ shopifyCustomerId: { in: idVariants } }] : []),
          ...(emailNorm ? [{ email: emailNorm }] : []),
          ...(phoneNorm ? [{ phone: { contains: phoneNorm } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ])

  const cartIds = carts.map((c: any) => c.id).filter(Boolean)
  const cartTokens = carts.map((c: any) => c.cartId).filter(Boolean)
  const sessionIds = sessions.map((s: any) => s.id).filter(Boolean)
  const sessionFingerprints = sessions.map((s: any) => s.customerFingerprint).filter(Boolean)
  const identityIds = identities.map((i: any) => i.id).filter(Boolean)
  const emailMatches = Array.from(new Set([
    ...(emailNorm ? [emailNorm] : []),
    ...carts.map((c: any) => c.customerEmail).filter(Boolean),
    ...identities.map((i: any) => i.email).filter(Boolean),
  ])) as string[]
  const phoneMatches = Array.from(new Set([
    ...(phoneNorm ? [phoneNorm] : []),
    ...carts.map((c: any) => (c.customerPhone ? String(c.customerPhone).replace(/\D/g, '') : null)).filter(Boolean),
    ...identities.map((i: any) => (i.phone ? String(i.phone).replace(/\D/g, '') : null)).filter(Boolean),
  ])) as string[]

  const [
    purchaseMemory,
    quotes,
    dealFollowups,
    experienceEvents,
    behavioralEvents,
    journeys,
    platformOrders,
    priorExports,
  ] = await Promise.all([
    prisma.bargainPurchaseMemory.findMany({
      where: {
        storeId,
        OR: [
          ...idVariants.map((id) => ({ customerId: id })),
          ...emailMatches.map((e) => ({ customerEmail: e })),
          ...phoneMatches.map((p) => ({ customerPhone: { contains: p } })),
          ...cartTokens.map((token) => ({ cartToken: token })),
        ],
      },
      take: 200,
    }),
    prisma.bargainQuote.findMany({
      where: {
        storeId,
        OR: [
          ...idVariants.map((id) => ({ shopifyCustomerId: id })),
          ...emailMatches.map((e) => ({ customerEmail: e })),
          ...sessionFingerprints.map((fingerprint) => ({ customerFingerprint: fingerprint })),
          ...cartTokens.map((token) => ({ cartToken: token })),
        ],
      },
      take: 200,
    }),
    sessionIds.length
      ? prisma.bargainDealFollowup.findMany({ where: { storeId, sessionId: { in: sessionIds } }, take: 200 })
      : Promise.resolve([]),
    sessionIds.length
      ? prisma.bargainExperienceEvent.findMany({ where: { storeId, sessionId: { in: sessionIds } }, take: 200 })
      : Promise.resolve([]),
    prisma.behavioralEvent.findMany({
      where: {
        storeId,
        OR: [
          ...idVariants.map((id) => ({ customerId: id })),
          ...emailMatches.map((e) => ({ email: e })),
          ...phoneMatches.map((p) => ({ phone: { contains: p } })),
        ],
      },
      take: 200,
    }),
    prisma.recoveryJourney.findMany({
      where: {
        storeId,
        OR: [
          ...cartTokens.map((token) => ({ cartId: token })),
          ...identityIds.map((id) => ({ customerIdentityId: id })),
          ...sessionIds.map((id) => ({ sessionId: id })),
        ],
      },
      take: 200,
    }),
    prisma.platformOrder.findMany({
      where: {
        storeId,
        OR: [
          ...idVariants.map((id) => ({ externalCustomerId: id })),
          ...emailMatches.map((e) => ({ customerEmail: e })),
          ...phoneMatches.map((p) => ({ customerPhone: { contains: p } })),
          ...cartIds.map((id) => ({ cartId: id })),
        ],
      },
      take: 200,
    }),
    prisma.customerDataExport.findMany({
      where: {
        storeId,
        OR: [
          ...idVariants.map((id) => ({ shopifyCustomerId: id })),
          ...emailMatches.map((e) => ({ email: e })),
        ],
      },
      take: 50,
    }),
  ])

  const journeyIds = (journeys as any[]).map((j) => j.id).filter(Boolean)
  const reminders = journeyIds.length
    ? await prisma.recoveryReminder.findMany({ where: { storeId, journeyId: { in: journeyIds } }, take: 200 })
    : []

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
      identities: identities.length,
      purchaseMemories: (purchaseMemory as any[]).length,
      bargainQuotes: (quotes as any[]).length,
      dealFollowups: (dealFollowups as any[]).length,
      experienceEvents: (experienceEvents as any[]).length,
      behavioralEvents: (behavioralEvents as any[]).length,
      recoveryJourneys: (journeys as any[]).length,
      recoveryReminders: (reminders as any[]).length,
      platformOrders: (platformOrders as any[]).length,
      priorExports: (priorExports as any[]).length,
    },
    identities: identities.map(i => ({
      phone: i.phone,
      email: i.email,
      name: i.name,
      shopifyCustomerId: i.shopifyCustomerId,
      consentWhatsApp: i.consentWhatsApp,
      consentEmail: i.consentEmail,
      emailConsentBasis: i.emailConsentBasis,
      consentSms: i.consentSms,
      whatsappConsentAt: i.whatsappConsentAt,
      whatsappConsentSource: i.whatsappConsentSource,
      emailConsentAt: i.emailConsentAt,
      emailConsentSource: i.emailConsentSource,
      optedOutAt: i.optedOutAt,
      suppressed: i.suppressed,
      lastContactedAt: i.lastContactedAt,
      lastChannel: i.lastChannel,
      lastSeenAt: i.lastSeenAt,
      createdAt: i.createdAt,
    })),
    carts: carts.map(c => ({
      id: c.id,
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
          content: redactUrls(m.content),
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
        content: redactUrls(m.content),
        offeredPrice: m.offeredPrice,
        createdAt: m.createdAt,
      })),
      learningOutcome: s.learningOutcome
        ? {
            environment: s.learningOutcome.environment,
            strategy: s.learningOutcome.strategy,
            strategyVersion: s.learningOutcome.strategyVersion,
            originalPrice: s.learningOutcome.originalPrice,
            finalPrice: s.learningOutcome.finalPrice,
            accepted: s.learningOutcome.accepted,
            purchased: s.learningOutcome.purchased,
            purchaseValue: s.learningOutcome.purchaseValue,
            refundedAmount: s.learningOutcome.refundedAmount,
            shopifyOrderId: s.learningOutcome.shopifyOrderId,
            acceptedAt: s.learningOutcome.acceptedAt,
            purchasedAt: s.learningOutcome.purchasedAt,
            finalizedAt: s.learningOutcome.finalizedAt,
          }
        : null,
      learningEvents: (s.learningEvents ?? []).map((event: any) => ({
        eventType: event.eventType,
        strategy: event.strategy,
        strategyVersion: event.strategyVersion,
        mode: event.mode,
        value: event.value,
        createdAt: event.createdAt,
      })),
    })),
    optOuts: optOuts.map(o => ({
      id: o.id,
      email: o.email,
      phone: o.phone,
      reason: o.reason,
      optedOutAt: o.optedOutAt,
    })),
    purchaseMemories: (purchaseMemory as any[]).map((p) => ({
      id: p.id,
      shopifyOrderId: p.shopifyOrderId,
      customerEmail: p.customerEmail,
      customerPhone: p.customerPhone,
      cartToken: p.cartToken,
      customerId: p.customerId,
      shopifyProductId: p.shopifyProductId,
      productTitle: p.productTitle,
      price: p.price,
      currency: p.currency,
      platform: p.platform,
      platformOrderId: p.platformOrderId,
      externalCustomerId: p.externalCustomerId,
      purchasedAt: p.purchasedAt,
    })),
    bargainQuotes: (quotes as any[]).map((q) => ({
      id: q.id,
      sessionId: q.sessionId,
      cartToken: q.cartToken,
      shopifyProductId: q.shopifyProductId,
      variantId: q.variantId,
      quantity: q.quantity,
      originalPrice: q.originalPrice,
      finalPrice: q.finalPrice,
      discountPercent: q.discountPercent,
      currency: q.currency,
      customerEmail: q.customerEmail,
      shopifyCustomerId: q.shopifyCustomerId,
      status: q.status,
      discountCode: q.discountCode,
      orderId: q.orderId,
      expiresAt: q.expiresAt,
      acceptedAt: q.acceptedAt,
      redeemedAt: q.redeemedAt,
      createdAt: q.createdAt,
    })),
    dealFollowups: (dealFollowups as any[]).map((f) => ({
      id: f.id,
      sessionId: f.sessionId,
      stage: f.stage,
      channel: f.channel,
      status: f.status,
      sentAt: f.sentAt,
    })),
    experienceEvents: (experienceEvents as any[]).map((e) => ({
      id: e.id,
      eventType: e.eventType,
      designVariant: e.designVariant,
      personality: e.personality,
      productId: e.productId,
      occurredAt: e.occurredAt,
      receivedAt: e.receivedAt,
    })),
    behavioralEvents: (behavioralEvents as any[]).map((e) => ({
      id: e.id,
      eventType: e.eventType,
      productId: e.productId,
      variantId: e.variantId,
      cartId: e.cartId,
      checkoutId: e.checkoutId,
      orderId: e.orderId,
      occurredAt: e.occurredAt,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt,
    })),
    recoveryJourneys: (journeys as any[]).map((j) => ({
      id: j.id,
      cartId: j.cartId,
      checkoutId: j.checkoutId,
      journeyType: j.journeyType,
      status: j.status,
      scheduledFor: j.scheduledFor,
      convertedAt: j.convertedAt,
      createdAt: j.createdAt,
    })),
    recoveryReminders: (reminders as any[]).map((r) => ({
      id: r.id,
      journeyId: r.journeyId,
      channel: r.channel,
      status: r.status,
      scheduledFor: r.scheduledFor,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
      failedAt: r.failedAt,
      reasonCode: r.reasonCode,
      attemptCount: r.attemptCount,
      createdAt: r.createdAt,
    })),
    platformOrders: (platformOrders as any[]).map((o) => ({
      id: o.id,
      platform: o.platform,
      platformOrderId: o.platformOrderId,
      status: o.status,
      currency: o.currency,
      total: o.total,
      refundedTotal: o.refundedTotal,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      customerName: o.customerName,
      items: o.items,
      couponCodes: o.couponCodes,
      placedAt: o.placedAt,
      paidAt: o.paidAt,
      cancelledAt: o.cancelledAt,
      refundedAt: o.refundedAt,
      createdAt: o.createdAt,
    })),
    priorExports: (priorExports as any[]).map((e) => ({
      id: e.id,
      shopifyCustomerId: e.shopifyCustomerId,
      email: e.email,
      status: e.status,
      requestedAt: e.requestedAt,
      createdAt: e.createdAt,
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