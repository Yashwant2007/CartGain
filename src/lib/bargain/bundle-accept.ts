import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { buildBundle, validateBundleOffer, type BundleItem } from '@/lib/bargain/bundle'
import { findBundleQuoteByToken } from '@/lib/bargain/bundle-quote'
import { generateBargainBundleDiscountCode } from '@/lib/bargain/discount'
import { computeMinPrice } from '@/lib/services/bargain'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { validateOffer } from '@/lib/bargain/offer-validation'
import { bargainCampaignStatus, couponMentionedInMessages } from '@/lib/bargain/policy'
import { getBargainGate, decideDealMode, recordBargainDealOps, BARGAIN_DEALS_EXHAUSTED } from '@/lib/bargain/gate'
import { generateBargainCode, buildBargainCheckoutUrl } from '@/lib/bargain/purchase'
import { recordLearningAcceptance } from '@/lib/bargain/learning/outcomes'
import { track } from '@/lib/analytics/track'
import { formatMoney } from '@/lib/bargain/i18n'
import { dealAcceptedMessage } from '@/lib/bargain/post-deal'
import { detectPaymentIntent } from '@/lib/bargain/payment'
import { bargainPlatformFor } from '@/lib/woocommerce/bargain-adapter'

const round2 = (n: number) => Math.round(n * 100) / 100

export async function acceptBundleQuoteForSession(opts: {
  session: any
  token: string
}): Promise<NextResponse> {
  const { session } = opts
  if (bargainPlatformFor(session.store, null) !== 'shopify') {
    return NextResponse.json({ message: 'Bundle deals are only available for Shopify stores.' }, { status: 400 })
  }
  const quote = await findBundleQuoteByToken(opts.token)
  if (!quote) {
    return NextResponse.json({ message: 'This bundle offer is invalid or has expired.' }, { status: 409 })
  }
  if (quote.storeId !== session.storeId || quote.sessionId !== session.id) {
    return NextResponse.json({ message: 'This bundle offer belongs to another session.' }, { status: 403 })
  }
  if (quote.status !== 'CREATED') {
    return NextResponse.json({ message: 'This bundle offer was already used.' }, { status: 409 })
  }
  if (new Date(quote.expiresAt).getTime() <= Date.now() || session.expiredAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: 'This bundle offer has expired. Start a new conversation to get a fresh one.' }, { status: 409 })
  }

  const stored: any[] = Array.isArray(quote.items) ? quote.items : []
  if (stored.length < 2) {
    return NextResponse.json({ message: 'This bundle offer is no longer available.' }, { status: 409 })
  }

  const current = await Promise.all(stored.map(async (item) => {
    const productId = String(item?.productId ?? '')
    if (!productId) return null
    const currentPrice = await fetchShopifyProductPrice(session.store, productId, item?.variantId ?? null).catch(() => null)
    if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return null
    const floor = await computeMinPrice({
      storeId: session.storeId,
      shopifyProductId: productId,
      originalPrice: currentPrice,
      platform: 'shopify',
      platformProductId: productId,
    }).catch(() => null)
    if (!floor?.isBargainable) return null
    return {
      productId,
      variantId: item?.variantId ?? null,
      title: typeof item?.title === 'string' ? item.title : 'Item',
      price: currentPrice,
      floor: Math.min(floor.minPrice, currentPrice),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
    } as BundleItem
  }))
  if (current.some((item) => item == null)) {
    return NextResponse.json({ message: 'One or more bundle items are no longer available for bargaining.' }, { status: 409 })
  }

  const rebuilt = buildBundle(current as BundleItem[], { discountPercent: Number(quote.discountPercent) })
  if (!rebuilt || !validateBundleOffer(rebuilt).ok) {
    return NextResponse.json({ message: 'The bundle price is no longer valid. Please refresh and negotiate again.' }, { status: 409 })
  }
  if (Math.abs(round2(rebuilt.listTotal - Number(quote.listTotal))) > 0.01 || Math.abs(round2(rebuilt.offerTotal - Number(quote.offerTotal))) > 0.01) {
    return NextResponse.json({ message: 'Bundle item prices changed — please refresh and negotiate again.' }, { status: 409 })
  }
  if (rebuilt.discountPercent <= 0 || rebuilt.offerTotal >= rebuilt.listTotal) {
    return NextResponse.json({ message: 'This bundle has no discount to issue.' }, { status: 409 })
  }

  const recentCustomerMessages = await prisma.bargainMessage.findMany({
    where: { sessionId: session.id, role: 'customer' },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { content: true, metadata: true },
  })
  const couponMentioned =
    couponMentionedInMessages(recentCustomerMessages) ||
    recentCustomerMessages.some((m) => (m.metadata as any)?.couponMentioned === true)
  const config = await prisma.bargainConfig.findUnique({
    where: { storeId: session.storeId },
    select: {
      campaignStart: true,
      campaignEnd: true,
      couponStackingEnabled: true,
      emergencyPaused: true,
      maxAttempts: true,
    },
  })
  const validation = validateOffer({
    requestedPrice: rebuilt.offerTotal,
    originalPrice: rebuilt.listTotal,
    floorPrice: rebuilt.floorTotal,
    attemptsUsed: Math.max(0, session.attemptsUsed - 1),
    maxAttempts: config?.maxAttempts ?? 3,
    campaignActive: bargainCampaignStatus(config, new Date()) === 'active',
    sessionExpired: session.expiredAt.getTime() <= Date.now(),
    emergencyPaused: config?.emergencyPaused === true,
    couponMentioned,
    couponsAllowed: config?.couponStackingEnabled === true,
  })
  if (!validation.ok) {
    await track({ name: 'cartgain_offer_rejected', storeId: session.storeId, properties: { reason: validation.reason, bundle: true } })
    return NextResponse.json({
      message: validation.message ?? 'Cannot accept this bundle right now.',
      reason: validation.reason,
      code: `OFFER_REJECTED_${validation.reason}`,
    }, { status: 409 })
  }

  const gate = await getBargainGate(session.storeId)
  const dealMode = decideDealMode(gate)
  if (dealMode === 'blocked_free' || dealMode === 'blocked_no_overage') {
    return NextResponse.json({
      message:
        dealMode === 'blocked_free'
          ? 'This store has reached its free bargain deal limit. Please ask the store to upgrade.'
          : 'This store has reached its bargain deal limit. Please ask the store to upgrade or contact you directly.',
      code: BARGAIN_DEALS_EXHAUSTED,
      planId: gate.planId,
      mode: dealMode,
      upgradeUrl: 'https://cart-gain.com/pricing',
    }, { status: 402 })
  }

  const claim = await prisma.bargainSession.updateMany({
    where: { id: session.id, status: { in: ['active', 'accepted'] }, discountCode: null },
    data: { status: 'accepting' },
  })
  if (claim.count === 0) {
    const refreshed = await prisma.bargainSession.findUnique({
      where: { id: session.id },
      select: { status: true, discountCode: true, finalPrice: true, purchaseUrl: true },
    })
    if (refreshed?.status === 'accepted' && refreshed.discountCode) {
      return NextResponse.json({
        sessionId: session.id,
        finalPrice: refreshed.finalPrice ?? rebuilt.offerTotal,
        discountPercent: rebuilt.discountPercent,
        discountCode: refreshed.discountCode,
        shopifyStatus: 'created',
        purchaseUrl: refreshed.purchaseUrl ?? buildBargainCheckoutUrl({ domain: session.store.domain, code: refreshed.discountCode }),
        currency: session.store.currency,
        expiresAt: session.expiredAt.toISOString(),
        message: 'Deal already locked — code issued.',
        bundle: true,
      })
    }
    return NextResponse.json({
      message: refreshed?.status === 'accepting'
        ? 'Acceptance is being processed — please retry in a moment.'
        : `Cannot accept — session is ${refreshed?.status ?? 'gone'}.`,
    }, { status: 409 })
  }

  const code = generateBargainCode()
  const customerEmail = session.customerEmail
  const cartToken = session.cartToken
  let shopifyCustomerId: string | null = null
  if (cartToken) {
    const cart = await prisma.cart.findUnique({
      where: { storeId_cartId: { storeId: session.storeId, cartId: cartToken } },
      select: { customerId: true },
    }).catch(() => null)
    shopifyCustomerId = cart?.customerId ?? null
  }

  let shopifyCode: { code: string; status: 'created' | 'pending' | 'failed'; error?: string }
  try {
    shopifyCode = await generateBargainBundleDiscountCode({
      store: session.store,
      items: rebuilt.items,
      listTotal: rebuilt.listTotal,
      offerTotal: rebuilt.offerTotal,
      discountPercent: rebuilt.discountPercent,
      code,
      customerEmail,
      cartToken,
      shopifyCustomerId,
    })
  } catch (err: any) {
    console.error('[BARGAIN_ACCEPT_BUNDLE]', err?.message ?? err)
    shopifyCode = { code, status: 'failed', error: err?.message ?? 'unknown' }
  }

  if (shopifyCode.status !== 'created') {
    await prisma.bargainSession.updateMany({
      where: { id: session.id, status: 'accepting' },
      data: { status: 'active' },
    })
    return NextResponse.json({
      message: shopifyCode.status === 'pending'
        ? 'Your bundle is ready, but this store is not connected to Shopify yet. Please try again shortly.'
        : `Bundle discount creation failed — please try again. ${shopifyCode.error || ''}`,
    }, { status: shopifyCode.status === 'pending' ? 503 : 500 })
  }

  const paymentIntent =
    (recentCustomerMessages.find((m) => (m.metadata as any)?.paymentIntent)?.metadata as any)?.paymentIntent ??
    detectPaymentIntent(recentCustomerMessages[0]?.content ?? '', recentCustomerMessages.slice(1).map((m) => String(m.content)))
  const purchaseUrl = buildBargainCheckoutUrl({ domain: session.store.domain, code: shopifyCode.code })
  const bundleQuantity = rebuilt.items.reduce((sum, item) => sum + Math.max(1, Math.floor(item.quantity)), 0)
  await prisma.$transaction([
    ...recordBargainDealOps(gate, session.id, rebuilt.listTotal, rebuilt.offerTotal, dealMode as 'included' | 'overage'),
    prisma.bargainBundleQuote.updateMany({
      where: { id: quote.id, status: 'CREATED' },
      data: { status: 'ACCEPTED', discountCode: shopifyCode.code, acceptedAt: new Date() },
    }),
    prisma.bargainMessage.create({
      data: {
        sessionId: session.id,
        role: 'system',
        content: `Customer accepted bundle price of ${formatMoney(rebuilt.offerTotal, session.store.currency)}. Discount code issued: ${shopifyCode.code} (${rebuilt.discountPercent}% off)`,
        metadata: {
          event: 'accept',
          bundle: true,
          bundleItems: rebuilt.items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })),
          finalPrice: rebuilt.offerTotal,
          discountPercent: rebuilt.discountPercent,
          code: shopifyCode.code,
          customerEmail,
          cartToken,
          dealMode,
          bulkQuantity: bundleQuantity,
          originalPriceUsed: rebuilt.listTotal,
          ...(paymentIntent !== 'unknown' ? { conditions: { paymentIntent } } : {}),
        } as any,
      },
    }),
    prisma.bargainSession.updateMany({
      where: { id: session.id, status: 'accepting' },
      data: {
        status: 'accepted',
        finalPrice: rebuilt.offerTotal,
        bargainFloor: rebuilt.floorTotal,
        bulkQuantity: bundleQuantity,
        discountCode: shopifyCode.code,
        discountCodeCustomerEmail: customerEmail,
        discountCodeCartToken: cartToken,
        purchaseUrl,
      },
    }),
  ])

  await recordLearningAcceptance(session.id)
  await track({
    name: 'cartgain_bundle_accepted',
    storeId: session.storeId,
    properties: { items: rebuilt.items.length, offerTotal: rebuilt.offerTotal, discountPercent: rebuilt.discountPercent },
  })

  return NextResponse.json({
    sessionId: session.id,
    finalPrice: rebuilt.offerTotal,
    discountPercent: rebuilt.discountPercent,
    discountCode: shopifyCode.code,
    shopifyStatus: shopifyCode.status,
    platform: 'shopify',
    purchaseUrl,
    currency: session.store.currency,
    expiresAt: session.expiredAt.toISOString(),
    message: dealAcceptedMessage({
      price: formatMoney(rebuilt.offerTotal, session.store.currency),
      code: shopifyCode.code,
      verified: shopifyCode.status === 'created',
    }),
    bundle: true,
  })
}
