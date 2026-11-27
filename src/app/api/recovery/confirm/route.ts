import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyOptInConfirmation } from '@/lib/recovery/opt-in-confirmation'
import { recordRecipientConsent } from '@/lib/recovery/recipients'
import { createOrUpdateJourney } from '@/lib/recovery/journeys/service'
import { buildProductContext } from '@/lib/bargain/product-fetcher'
import { cleanCustomerName } from '@/lib/names'

export const dynamic = 'force-dynamic'

function page(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;color:#111;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:480px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;text-align:center}h1{font-size:20px}p{line-height:1.5;color:#374151}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`
  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const confirmation = verifyOptInConfirmation(token)
  if (!confirmation) return page('Confirmation link invalid', 'This link has expired or is not valid.', 400)

  try {
    const store = await prisma.store.findFirst({
      where: { id: confirmation.storeId },
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
    if (!store) return page('Confirmation link invalid', 'This store is no longer available.', 400)

    const identity = await recordRecipientConsent({
      storeId: confirmation.storeId,
      email: confirmation.email,
      name: cleanCustomerName(confirmation.name, confirmation.email),
      source: 'email_confirmation',
      consentEmail: true,
      overrideOptOut: false,
    })
    if (!identity?.consentEmail || identity.suppressed || identity.optedOutAt) {
      return page('Reminders stopped', 'Your email is opted out, so no reminders were enabled.', 400)
    }

    if (confirmation.productId) {
      const context = await buildProductContext({
        store,
        storeId: store.id,
        shopifyProductId: confirmation.productId,
        platform: store.platform,
        platformProductId: confirmation.productId,
        currency: store.currency || 'USD',
        baseUrl: `https://${store.domain}`,
        useCache: true,
      }).catch(() => null)
      if (context && !context.fetchFailed && context.title) {
        const recent = await prisma.recoveryJourney.findFirst({
          where: {
            storeId: store.id,
            customerIdentityId: identity.id,
            journeyType: 'product_browse',
            productId: confirmation.productId,
            status: { in: ['OBSERVED', 'IDENTIFIED', 'ELIGIBILITY_CHECKED', 'SCHEDULED', 'SENT'] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true },
        })
        if (!recent) {
          await createOrUpdateJourney({
            storeId: store.id,
            journeyType: 'product_browse',
            customerIdentityId: identity.id,
            sessionId: confirmation.sessionId,
            productId: confirmation.productId,
            priority: 3,
            delayMinutes: 60,
            metadata: {
              source: 'email_confirmation',
              productTitle: context.title,
              productUrl: context.productUrl,
              productImage: context.imageUrl,
            },
          })
        }
      }
    }

    return page('Reminders confirmed', 'Thanks — your email reminders are now enabled. You can unsubscribe from any reminder.')
  } catch (error: any) {
    console.error('[RECOVERY_CONFIRM]', error?.message || error)
    return page('Confirmation failed', 'We could not enable reminders. Please try again.', 500)
  }
}
