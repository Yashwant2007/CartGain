import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
import { buildRecoveryLink } from '@/lib/recovery/links'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

/**
 * Send the real recovery template to a phone number and report Meta's raw
 * answer. This is how you verify that the approved template, its three body
 * variables and the optional URL button line up with what we send.
 *
 * Auth: the job secret (`Authorization: Bearer $JOB_SECRET` or `x-job-secret`).
 *
 *   curl -sS -X POST https://cart-gain.com/api/jobs/test-whatsapp \
 *     -H "Authorization: Bearer $JOB_SECRET" -H 'content-type: application/json' \
 *     -d '{"phone":"+919999999999","template":"reminder","code":"SAVE10","value":10}'
 */
export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }

    const which = String(body.template || 'reminder').toLowerCase()
    const template =
      which === 'followup' || which === 'final'
        ? which === 'followup'
          ? WhatsAppTemplates.abandoned_cart_followup
          : WhatsAppTemplates.abandoned_cart_urgent
        : WhatsAppTemplates.abandoned_cart

    const cartId = typeof body.cartId === 'string' && body.cartId ? body.cartId : 'test-cart'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com'
    const code = typeof body.code === 'string' && body.code ? body.code : null
    const value = typeof body.value === 'number' ? body.value : 10

    const checkoutLink = buildRecoveryLink({
      appUrl,
      cartId,
      channel: 'whatsapp',
      kind: 'checkout',
      discountCode: code,
    })
    const bargainLink = buildRecoveryLink({ appUrl, cartId, channel: 'whatsapp', kind: 'bargain' })
    const offerLine = code
      ? `Use code ${code} for ${value}% off: ${checkoutLink} — or name your price: ${bargainLink}`
      : `Finish your order: ${checkoutLink} — or name your price: ${bargainLink}`

    const params = template.generateParams(
      'Test',
      'Your cart is saved and this is a template check from CartGain.',
      offerLine,
      undefined,
      {
        buttonUrlSuffix: process.env.WHATSAPP_TEMPLATE_BUTTON_BASE
          ? `${cartId}?c=whatsapp`
          : undefined,
      },
    )

    const result = await sendWhatsAppMessage({
      to: phone,
      templateName: template.name,
      templateParams: params,
    })

    return NextResponse.json({
      success: result.success,
      templateName: template.name,
      // Grouped so you can compare with Meta's approved structure.
      componentsSent: {
        bodyParams: params.body?.length ?? 0,
        header: params.header ? params.header.type : 'none',
        footer: 'none (static footer lives in the template)',
        button: params.buttons?.length ? 'url (dynamic suffix)' : 'none',
      },
      messageId: result.messageId,
      error: result.error,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'failed' }, { status: 500 })
  }
}
