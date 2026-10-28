import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'
import {
  normalizeRecipientEmail,
  normalizeRecipientPhone,
  recordRecipientConsent,
} from '@/lib/recovery/recipients'
import { createOrUpdateJourney } from '@/lib/recovery/journeys/service'
import { buildProductContext } from '@/lib/bargain/product-fetcher'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const ALLOWED_SOURCES = new Set([
  'storefront_product',
  'storefront_cart',
  'checkout_extension',
])

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * Public, explicit reminder opt-in for the storefront theme block and the
 * checkout UI extension.
 *
 * Anonymous product views do not expose an email or phone, so this endpoint is
 * the consent boundary: it stores the contact the shopper typed (or Shopify
 * gave the checkout) and the channels they explicitly opted into. It never
 * infers WhatsApp consent from a Shopify phone number.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`recovery_optin_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return json({ message: 'Too many requests. Please try again later.' }, 429)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return json({ message: 'Invalid request' }, 400)
    }

    const shop = text((body as any).shop, 255)
    if (!shop) return json({ message: 'shop is required' }, 400)

    const storeId = await resolveActiveStoreIdByShopDomain(prisma, shop)
    if (!storeId) return json({ message: 'Store not found' }, 404)

    const email = normalizeRecipientEmail(text((body as any).email, 320))
    const phone = normalizeRecipientPhone(text((body as any).phone, 40))
    const consentEmail = (body as any).consentEmail === true
    const consentWhatsApp = (body as any).consentWhatsApp === true
    const source = ALLOWED_SOURCES.has(String((body as any).source || ''))
      ? String((body as any).source)
      : 'storefront_product'

    if (consentEmail && !email) {
      return json({ message: 'A valid email is required for email reminders' }, 400)
    }
    if (consentWhatsApp && !phone) {
      return json({ message: 'A valid phone number is required for WhatsApp reminders' }, 400)
    }
    if (!consentEmail && !consentWhatsApp) {
      return json({ message: 'Choose at least one reminder channel' }, 400)
    }
    if (!email && !phone) {
      return json({ message: 'Enter an email or phone number' }, 400)
    }

    const contactKey = email || phone!.replace(/\D/g, '')
    const contactHash = createHash('sha256').update(contactKey).digest('hex').slice(0, 24)
    const contactRate = await checkSimpleRateLimit(`recovery_optin_contact_${contactHash}`)
    if (!contactRate.allowed) {
      return json({ message: 'Too many requests. Please try again later.' }, 429)
    }

    const consentSource = `${source}_opt_in`
    const identity = await recordRecipientConsent({
      storeId,
      email,
      phone,
      name: null,
      source: consentSource,
      consentEmail,
      consentWhatsApp,
      overrideOptOut: false,
    })
    if (!identity) {
      return json({ message: 'Could not save your reminder preference' }, 400)
    }

    const cartToken = text((body as any).cartToken, 255)
    let linkedCart = false

    if (cartToken) {
      const cart = await prisma.cart.findUnique({
        where: { storeId_cartId: { storeId, cartId: cartToken } },
        select: {
          id: true,
          customerEmail: true,
          customerPhone: true,
          customerName: true,
          convertedAt: true,
          isRecovered: true,
        },
      })
      if (cart) {
        linkedCart = true
        const update: {
          customerEmail?: string
          customerPhone?: string
          customerName?: string
        } = {}
        if (!cart.customerEmail && email) update.customerEmail = email
        if (!cart.customerPhone && phone) update.customerPhone = phone
        if (Object.keys(update).length > 0) {
          await prisma.cart.update({ where: { id: cart.id }, data: update }).catch(() => {})
        }
      }
    }

    // A captured cart is already owned by the abandoned-cart job, so do not
    // create a second product-browse journey that could double-message the
    // shopper. Without a cart, schedule a single product reminder.
    const productId = text((body as any).productId, 255)
    const sessionId = text((body as any).sessionId, 128)

    // Product title/link/image are NEVER trusted from the public form: a
    // crafted request could otherwise use the merchant's brand to send
    // arbitrary copy or a phishing link to any email address. Resolve the
    // product from Shopify and drop the reminder if it cannot be verified.
    let productTitle: string | null = null
    let productUrl: string | null = null
    let productImage: string | null = null
    if (!linkedCart && productId) {
      const store = await prisma.store.findFirst({
        where: { id: storeId },
        select: {
          id: true,
          domain: true,
          currency: true,
          apiKey: true,
          shopifyRefreshToken: true,
          shopifyTokenExpiresAt: true,
        },
      })
      if (store) {
        const context = await buildProductContext({
          store,
          storeId,
          shopifyProductId: productId,
          currency: store.currency || 'USD',
          baseUrl: `https://${store.domain}`,
          useCache: true,
        }).catch(() => null)
        if (context && !context.fetchFailed) {
          productTitle = context.title || null
          productUrl = context.productUrl || null
          productImage = context.imageUrl || null
        }
      }
    }

    let reminderScheduled = false
    if (!linkedCart && productId && productTitle && (consentEmail || consentWhatsApp)) {
      const recent = await prisma.recoveryJourney.findFirst({
        where: {
          storeId,
          customerIdentityId: identity.id,
          journeyType: 'product_browse',
          productId,
          status: { in: ['OBSERVED', 'IDENTIFIED', 'ELIGIBILITY_CHECKED', 'SCHEDULED', 'SENT'] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      })
      if (!recent) {
        await createOrUpdateJourney({
          storeId,
          journeyType: 'product_browse',
          customerIdentityId: identity.id,
          sessionId,
          productId,
          priority: 3,
          delayMinutes: 60,
          metadata: {
            source,
            productTitle,
            productUrl,
            productImage,
          },
        })
        reminderScheduled = true
      }
    }

    return json({
      ok: true,
      email: consentEmail,
      whatsapp: consentWhatsApp,
      linkedCart,
      reminderScheduled,
    })
  } catch (error: any) {
    console.error('[RECOVERY_OPT_IN]', error?.message || error)
    return json({ message: 'Something went wrong' }, 500)
  }
}
