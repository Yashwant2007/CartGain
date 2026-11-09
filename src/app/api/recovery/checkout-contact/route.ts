import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { cleanCustomerName } from '@/lib/names'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'
import {
  normalizeRecipientEmail,
  normalizeRecipientPhone,
  upsertRecipient,
} from '@/lib/recovery/recipients'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

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
 * Checkout contact sync for the checkout UI extension.
 *
 * Shopify populates `buyerIdentity` as the shopper signs in or types their
 * details, sometimes before the checkout webhook reaches us. This endpoint
 * attaches that contact to the cart we already captured so the abandoned-cart
 * job has a name/email/phone without the shopper re-entering anything.
 *
 * It records contact information only. It NEVER sets email or WhatsApp
 * marketing consent; the explicit opt-in banner still owns that decision.
 * The checkout token is an unguessable capability, and only carts that were
 * already created by a Shopify webhook can be updated.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`recovery_checkout_contact_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return json({ message: 'Too many requests. Please try again later.' }, 429)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return json({ message: 'Invalid request' }, 400)
    }

    const shop = text((body as any).shop, 255)
    const cartToken = text((body as any).cartToken, 255)
    if (!shop) return json({ message: 'shop is required' }, 400)
    if (!cartToken) return json({ message: 'cartToken is required' }, 400)

    const storeId = await resolveActiveStoreIdByShopDomain(prisma, shop)
    if (!storeId) return json({ message: 'Store not found' }, 404)

    const email = normalizeRecipientEmail(text((body as any).email, 320))
    const phone = normalizeRecipientPhone(text((body as any).phone, 40))
    const name = cleanCustomerName(text((body as any).name, 120), email)
    if (!email && !phone && !name) return json({ ok: true, linkedCart: false })

    const contactKey = (email || phone || name || '').toLowerCase()
    const contactHash = createHash('sha256').update(contactKey).digest('hex').slice(0, 24)
    const contactRate = await checkSimpleRateLimit(`recovery_checkout_contact_${contactHash}`)
    if (!contactRate.allowed) {
      return json({ message: 'Too many requests. Please try again later.' }, 429)
    }

    const cart = await prisma.cart.findUnique({
      where: { storeId_cartId: { storeId, cartId: cartToken } },
      select: {
        id: true,
        customerEmail: true,
        customerPhone: true,
        customerName: true,
      },
    })
    if (!cart) return json({ message: 'Cart not found' }, 404)

    const update: {
      customerEmail?: string
      customerPhone?: string
      customerName?: string
    } = {}
    if (!cart.customerEmail && email) update.customerEmail = email
    if (!cart.customerPhone && phone) update.customerPhone = phone
    if (!cart.customerName && name) update.customerName = name
    if (Object.keys(update).length > 0) {
      await prisma.cart.update({ where: { id: cart.id }, data: update })
    }

    const identity = await upsertRecipient({
      storeId,
      name: name || cart.customerName,
      email: email || cart.customerEmail,
      phone: phone || cart.customerPhone,
      source: 'shopify_checkout_contact',
    }).catch((error) => {
      console.error('[RECOVERY_CHECKOUT_CONTACT_IDENTITY]', error?.message || error)
      return null
    })

    return json({
      ok: true,
      linkedCart: true,
      hasEmail: Boolean(update.customerEmail),
      hasPhone: Boolean(update.customerPhone),
      hasName: Boolean(update.customerName),
      identityId: identity?.id || null,
    })
  } catch (error: any) {
    console.error('[RECOVERY_CHECKOUT_CONTACT]', error?.message || error)
    return json({ message: 'Something went wrong' }, 500)
  }
}
