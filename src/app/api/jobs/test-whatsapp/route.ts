import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
import { buildRecoveryLink } from '@/lib/recovery/links'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

/**
 * Send a real recovery template to a phone number and report Meta's raw
 * answer, including the component shape and the diagnostics
 * (code / subcode / details / trace id) needed to fix an approval mismatch.
 *
 * Auth: the job secret (`Authorization: Bearer $JOB_SECRET` or `x-job-secret`).
 *
 *   POST /api/jobs/test-whatsapp
 *   { "phone": "+919999999999", "template": "reminder", "code": "SAVE10", "value": 10 }
 *
 * Optional: "language" (defaults to WHATSAPP_TEMPLATE_LANG/en),
 *           "mode": "text" to send a plain-text message (checks the token and
 *           number without touching the template).
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

    if (String(body.mode || '').toLowerCase() === 'text') {
      const result = await sendWhatsAppMessage({
        to: phone,
        content: 'CartGain test message - your WhatsApp credentials are working.',
      })
      return NextResponse.json({
        success: result.success,
        mode: 'text',
        messageId: result.messageId,
        error: result.error,
        errorCode: result.errorCode,
        errorSubcode: result.errorSubcode,
        errorDetails: result.errorDetails,
        traceId: result.traceId,
      })
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

    const language = typeof body.language === 'string' && body.language ? body.language : undefined

    const result = await sendWhatsAppMessage({
      to: phone,
      templateName: template.name,
      templateParams: params,
      templateLanguage: language,
    })

    const rawId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
    const cleanId = rawId.replace(/^\s*["']|["']\s*$/g, '').trim()

    return NextResponse.json({
      success: result.success,
      templateName: template.name,
      language: language || process.env.WHATSAPP_TEMPLATE_LANG || 'en',
      // Non-secret config checks: a quoted/padded id or a short token is the
      // usual cause of a bare (#100) from Meta.
      config: {
        phoneNumberId: cleanId ? `${cleanId.slice(0, 3)}...${cleanId.slice(-3)} (${cleanId.length} chars)` : 'MISSING',
        phoneNumberIdHadQuotesOrPadding: rawId !== cleanId,
        tokenLength: (process.env.WHATSAPP_BUSINESS_TOKEN || '').trim().length,
        graphVersion: process.env.WHATSAPP_API_VERSION || 'v22.0',
        templateLanguage: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
      },
      // Compare this with the approved structure in WhatsApp Manager.
      componentsSent: {
        bodyParams: params.body?.length ?? 0,
        body: params.body,
        header: params.header ? params.header.type : 'none',
        footer: 'none (static footer lives in the template)',
        button: params.buttons?.length ? 'url (dynamic suffix)' : 'none',
      },
      messageId: result.messageId,
      error: result.error,
      errorCode: result.errorCode,
      errorSubcode: result.errorSubcode,
      errorDetails: result.errorDetails,
      traceId: result.traceId,
      // Meta's full answer helps when the message alone is generic (#100).
      providerResponse: result.providerResponse,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'failed' }, { status: 500 })
  }
}
