import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { cleanCustomerName } from '@/lib/names'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'
import {
  normalizeRecipientEmail,
  normalizeRecipientPhone,
  recordRecipientConsent,
  upsertRecipient,
} from '@/lib/recovery/recipients'
import { createOrUpdateJourney } from '@/lib/recovery/journeys/service'
import { buildProductContext } from '@/lib/bargain/product-fetcher'
import { buildOptInConfirmationUrl } from '@/lib/recovery/opt-in-confirmation'
import { storefrontCorsHeaders } from '@/lib/cors/storefront'
import { sendEmail } from '@/lib/services/email'

export const dynamic = 'force-dynamic'

const ALLOWED_SOURCES = new Set([
  'storefront_product',
  'storefront_cart',
])

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function respond(body: unknown, status: number, headers: Record<string, string>) {
  return NextResponse.json(body, { status, headers })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: storefrontCorsHeaders(request.headers.get('origin')),
  })
}

export async function POST(request: NextRequest) {
  const cors = storefrontCorsHeaders(request.headers.get('origin'))
  try {
    const rate = await checkSimpleRateLimit(`recovery_optin_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return respond({ message: 'Too many requests. Please try again later.' }, 429, cors)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return respond({ message: 'Invalid request' }, 400, cors)
    }

    const shop = text((body as any).shop, 255)
    if (!shop) return respond({ message: 'shop is required' }, 400, cors)

    const storeId = await resolveActiveStoreIdByShopDomain(prisma, shop)
    if (!storeId) return respond({ message: 'Store not found' }, 404, cors)

    const email = normalizeRecipientEmail(text((body as any).email, 320))
    const phone = normalizeRecipientPhone(text((body as any).phone, 40))
    const name = cleanCustomerName(text((body as any).name, 120), email)
    const consentEmail = (body as any).consentEmail === true
    const consentWhatsApp = (body as any).consentWhatsApp === true
    const sourceValue = String((body as any).source || '')
    if (!ALLOWED_SOURCES.has(sourceValue)) {
      return respond({ message: 'Invalid opt-in source' }, 400, cors)
    }
    const source = sourceValue

    if (consentEmail && !email) {
      return respond({ message: 'A valid email is required for email reminders' }, 400, cors)
    }
    if (consentWhatsApp && !phone) {
      return respond({ message: 'A valid phone number is required for WhatsApp reminders' }, 400, cors)
    }
    if (!consentEmail && !consentWhatsApp) {
      return respond({ message: 'Choose at least one reminder channel' }, 400, cors)
    }
    if (!email && !phone) {
      return respond({ message: 'Enter an email or phone number' }, 400, cors)
    }

    const contactKey = email || phone!.replace(/\D/g, '')
    const contactHash = createHash('sha256').update(contactKey).digest('hex').slice(0, 24)
    const contactRate = await checkSimpleRateLimit(`recovery_optin_contact_${contactHash}`)
    if (!contactRate.allowed) {
      return respond({ message: 'Too many requests. Please try again later.' }, 429, cors)
    }

    const cartToken = text((body as any).cartToken, 255)
    let cart: {
      id: string
      customerEmail: string | null
      customerPhone: string | null
      customerName: string | null
    } | null = null
    if (cartToken) {
      cart = await prisma.cart.findUnique({
        where: { storeId_cartId: { storeId, cartId: cartToken } },
        select: {
          id: true,
          customerEmail: true,
          customerPhone: true,
          customerName: true,
        },
      })
      if (!cart) return respond({ message: 'Cart not found' }, 404, cors)
    }

    const consentSource = `${source}_opt_in`
    const contact = await upsertRecipient({
      storeId,
      email,
      phone,
      name,
      seenAt: new Date(),
      source: consentSource,
    }).catch(() => null)
    if (!contact) {
      return respond({ message: 'Could not save your reminder preference' }, 400, cors)
    }

    const verifiedEmail =
      consentEmail && cart != null && normalizeRecipientEmail(cart.customerEmail) === email
    const verifiedPhone =
      consentWhatsApp && cart != null && normalizeRecipientPhone(cart.customerPhone) === phone

    let granted: Awaited<ReturnType<typeof recordRecipientConsent>> = null
    if (verifiedEmail && email) {
      granted = await recordRecipientConsent({
        storeId,
        email,
        phone,
        name,
        source: consentSource,
        consentEmail: true,
        consentWhatsApp: false,
        overrideOptOut: false,
      })
    }
    const emailApplied = Boolean(granted?.consentEmail && !granted.suppressed && !granted.optedOutAt)
    const whatsappApplied = contact.consentWhatsApp === true && Boolean(phone)
    let emailConfirmationSent = false

    if (consentEmail && !emailApplied && email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com').replace(/\/$/, '')
      const confirmationUrl = buildOptInConfirmationUrl(appUrl, {
        storeId,
        email,
        productId: text((body as any).productId, 255),
        sessionId: text((body as any).sessionId, 128),
        name,
      })
      const result = await sendEmail({
        to: email,
        subject: 'Confirm your CartGain reminders',
        html: `<p>Confirm that you want product reminders from CartGain.</p><p><a href="${escapeHtml(confirmationUrl)}">Confirm reminders</a></p><p>If you did not request this, ignore this email.</p>`,
        text: `Confirm your CartGain reminders: ${confirmationUrl}`,
      })
      if (!result.success) {
        return respond({ message: 'Could not send the confirmation email' }, 502, cors)
      }
      emailConfirmationSent = true
    }

    if (cart) {
      const update: {
        customerEmail?: string
        customerPhone?: string
        customerName?: string
      } = {}
      if (!cart.customerEmail && email) update.customerEmail = email
      if (!cart.customerPhone && phone) update.customerPhone = phone
      if (!cart.customerName && name) update.customerName = name
      if (Object.keys(update).length > 0) {
        await prisma.cart.update({ where: { id: cart.id }, data: update }).catch(() => {})
      }
    }

    const productId = text((body as any).productId, 255)
    const sessionId = text((body as any).sessionId, 128)
    let reminderScheduled = false
    const confirmedIdentityId = emailApplied ? granted?.id : whatsappApplied ? contact.id : null
    if (productId && confirmedIdentityId) {
      const store = await prisma.store.findFirst({
        where: { id: storeId },
        select: {
          id: true,
          domain: true,
          currency: true,
          platform: true,
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
          platform: store.platform,
          platformProductId: productId,
          currency: store.currency || 'USD',
          baseUrl: `https://${store.domain}`,
          useCache: true,
        }).catch(() => null)
        if (context && !context.fetchFailed && context.title) {
          const recent = await prisma.recoveryJourney.findFirst({
            where: {
              storeId,
              customerIdentityId: confirmedIdentityId,
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
              customerIdentityId: confirmedIdentityId,
              sessionId,
              productId,
              priority: 3,
              delayMinutes: 60,
              metadata: {
                source,
                productTitle: context.title,
                productUrl: context.productUrl,
                productImage: context.imageUrl,
              },
            })
            reminderScheduled = true
          }
        }
      }
    }

    return respond({
      ok: true,
      email: emailApplied,
      emailConfirmationSent,
      whatsapp: whatsappApplied,
      whatsappConfirmationRequired: consentWhatsApp && !whatsappApplied,
      linkedCart: cart != null,
      reminderScheduled,
    }, 200, cors)
  } catch (error: any) {
    console.error('[RECOVERY_OPT_IN]', error?.message || error)
    return respond({ message: 'Something went wrong' }, 500, cors)
  }
}
