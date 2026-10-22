export interface WhatsAppTemplateParams {
  header?: { type: 'image'; imageUrl: string } | { type: 'text'; text: string }
  body?: string[]
  footer?: string
  buttons?: Array<{ type: 'url' | 'quick_reply'; text: string; url?: string }>
}

export interface WhatsAppMessageOptions {
  to: string
  content?: string
  mediaUrl?: string
  templateName?: string
  templateParams?: WhatsAppTemplateParams
  /** Template language code approved in Meta (defaults to WHATSAPP_TEMPLATE_LANG or 'en'). */
  templateLanguage?: string
}

export async function sendWhatsAppMessage({
  to,
  content,
  mediaUrl,
  templateName,
  templateParams,
  templateLanguage,
}: WhatsAppMessageOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
  /** Meta diagnostics, surfaced by the authenticated test endpoint. */
  errorCode?: number
  errorSubcode?: number
  errorDetails?: string
  traceId?: string
  /** Raw parsed Meta response - only returned to the test route. */
  providerResponse?: unknown
}> {
  // Vercel/env files often keep the quotes or a trailing newline; both make
  // the Graph call fail with a cryptic (#100)/OAuth error.
  const cleanEnv = (value: string | undefined): string =>
    (value || '').replace(/^\s*["']|["']\s*$/g, '').trim()
  const phoneNumberId = cleanEnv(process.env.WHATSAPP_PHONE_NUMBER_ID)
  const accessToken = cleanEnv(process.env.WHATSAPP_BUSINESS_TOKEN).replace(/^Bearer\s+/i, '')

  if (!phoneNumberId || !accessToken) {
    console.warn('WhatsApp not configured — set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_TOKEN')
    return { success: false, error: 'WhatsApp not configured' }
  }

  try {
    const formattedTo = formatWhatsAppPhone(to)
    const body: any = {
      messaging_product: 'whatsapp',
      to: formattedTo,
    }

    if (templateName) {
      body.type = 'template'
      const components: any[] = []

      if (templateParams?.header) {
        const headerParam: any = { type: 'header' }
        if (templateParams.header.type === 'image') {
          headerParam.parameters = [
            { type: 'image', image: { link: templateParams.header.imageUrl } },
          ]
        } else {
          headerParam.parameters = [
            { type: 'text', text: templateParams.header.text },
          ]
        }
        components.push(headerParam)
      }

      if (templateParams?.body?.length) {
        components.push({
          type: 'body',
          parameters: templateParams.body.map((param) => ({
            type: 'text',
            text: param,
          })),
        })
      }

      if (templateParams?.footer) {
        components.push({
          type: 'footer',
          parameters: [{ type: 'text', text: templateParams.footer }],
        })
      }

      if (templateParams?.buttons?.length) {
        templateParams.buttons.forEach((btn, idx) => {
          components.push({
            type: 'button',
            sub_type: btn.type === 'url' ? 'url' : 'quick_reply',
            index: idx,
            parameters: btn.type === 'url'
              ? [{ type: 'text', text: btn.url || '' }]
              : [{ type: 'payload', payload: btn.text }],
          })
        })
      }

      body.template = {
        name: templateName,
        language: { code: templateLanguage || process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components,
      }
    } else if (mediaUrl) {
      body.type = 'image'
      body.image = { link: mediaUrl, caption: content || '' }
    } else {
      body.type = 'text'
      body.text = { body: content || '' }
    }

    // Graph versions are sunset on a schedule; v18 is long dead and answers
    // cryptic (#100) errors. Keep this current (override with env if needed).
    const graphVersion = process.env.WHATSAPP_API_VERSION || 'v22.0'
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      }
    )

    const data = await response.json()
    const messageId = data?.messages?.[0]?.id
    if (response.ok && messageId) {
      return { success: true, messageId, providerResponse: data }
    }
    return {
      success: false,
      error: data?.error?.message || 'Failed to send WhatsApp message',
      errorCode: data?.error?.code,
      errorSubcode: data?.error?.error_subcode,
      errorDetails: data?.error?.error_data?.details,
      traceId: data?.error?.fbtrace_id,
      providerResponse: data,
    }
  } catch (error: any) {
    console.error('WhatsApp send error:', error)
    return { success: false, error: error.message }
  }
}

// ─── 3 CORE WHATSAPP TEMPLATES ───
// Register these bodies in Meta Business Manager (WhatsApp Manager → Message
// templates) and keep the names/languages in sync with the env vars below.
//
// Body variable mapping (identical for all three, so one approved template can
// be swapped for another without changing code):
//   {{1}} = customer first name        (never empty — falls back to "there")
//   {{2}} = AI-written body line       (validated, single line)
//   {{3}} = offer line                 (code + 10% off + bargain link; never empty)
//
// IMPORTANT — components must match the APPROVED template exactly. Meta
// rejects the entire send with (#132000) when we pass a component the template
// does not declare. Therefore:
//   * body is ALWAYS sent (the 3 variables above);
//   * a header image is only sent when WHATSAPP_TEMPLATE_IMAGE_HEADER=true
//     (i.e. the approved template has an IMAGE header);
//   * a static footer is never sent as a parameter — it lives in the template;
//   * the URL button is only sent when WHATSAPP_TEMPLATE_BUTTON_BASE is set,
//     which means the approved button is dynamic (https://cart-gain.com/r/{{1}}).
//     Sending a FULL url as the button parameter produces a broken double-url.

export type WhatsAppTemplateContext = {
  /** Dynamic suffix for a url button configured as `<base>/{{1}}`. */
  buttonUrlSuffix?: string
}

type TemplateBuilder = (
  customerName: string,
  bodyContent: string,
  offerLine: string,
  productImage?: string,
  context?: WhatsAppTemplateContext,
) => WhatsAppTemplateParams

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim()
  return trimmed || fallback
}

function buildTemplate(
  customerName: string,
  bodyContent: string,
  offerLine: string,
  productImage: string | undefined,
  context: WhatsAppTemplateContext | undefined,
  fallbackOfferLine: string,
): WhatsAppTemplateParams {
  const wantsImageHeader = ['1', 'true', 'yes'].includes(
    (process.env.WHATSAPP_TEMPLATE_IMAGE_HEADER || '').toLowerCase(),
  )
  const params: WhatsAppTemplateParams = {
    header: wantsImageHeader && productImage ? { type: 'image', imageUrl: productImage } : undefined,
    body: [
      nonEmpty(customerName, 'there'),
      nonEmpty(bodyContent, 'Your cart is still saved and ready whenever you are.'),
      nonEmpty(offerLine, fallbackOfferLine),
    ],
    // No footer component: the approved template's footer is static text.
  }
  if (context?.buttonUrlSuffix) {
    params.buttons = [{ type: 'url', text: 'Complete Purchase', url: context.buttonUrlSuffix }]
  }
  return params
}

export const WhatsAppTemplates: Record<string, { name: string; generateParams: TemplateBuilder }> = {
  /**
   * ── REMINDER (step 0, +1h after abandonment) ──
   * Warm, low-pressure: what they picked, one next step.
   *
   * Meta body:
   *   Hey {{1}} 👋
   *
   *   {{2}}
   *
   *   {{3}}
   *
   *   Tap below to pick up where you left off ✨
   *
   * Footer: Powered by CartGain — cart-gain.com
   * Button (static): Complete Purchase → https://cart-gain.com/r/{{1}}
   */
  abandoned_cart: {
    name: process.env.WHATSAPP_TEMPLATE_REMINDER || 'abandoned_cart_reminder',
    generateParams: (customerName, bodyContent, offerLine, productImage, context) =>
      buildTemplate(
        customerName,
        bodyContent,
        offerLine,
        productImage,
        context,
        'Your items are saved — tap below to pick up where you left off.',
      ),
  },

  /**
   * ── FOLLOW-UP (step 1, +4h after abandonment) ──
   * Acknowledges the pause, repeats the offer once if there is one.
   *
   * Meta body:
   *   {{1}}, still thinking it over? 💫
   *
   *   {{2}}
   *
   *   {{3}}
   *
   *   Your cart is right here whenever you're ready 👉
   *
   * Footer: Powered by CartGain — cart-gain.com
   * Button (static): Complete Order → https://cart-gain.com/r/{{1}}
   */
  abandoned_cart_followup: {
    name: process.env.WHATSAPP_TEMPLATE_FOLLOWUP || 'abandoned_cart_followup',
    generateParams: (customerName, bodyContent, offerLine, productImage, context) =>
      buildTemplate(
        customerName,
        bodyContent,
        offerLine,
        productImage,
        context,
        'Still deciding? Your cart is right here, and we are happy to talk price.',
      ),
  },

  /**
   * ── FINAL (step 2, +24h after abandonment) ──
   * Says plainly that this is the last message. No false urgency.
   *
   * Meta body:
   *   {{1}}, last note from us ✌️
   *
   *   {{2}}
   *
   *   {{3}}
   *
   *   We won't keep messaging you about this cart.
   *
   * Footer: Powered by CartGain — cart-gain.com
   * Button (static): Complete Now → https://cart-gain.com/r/{{1}}
   */
  abandoned_cart_urgent: {
    name: process.env.WHATSAPP_TEMPLATE_FINAL || 'abandoned_cart_urgent',
    generateParams: (customerName, bodyContent, offerLine, productImage, context) =>
      buildTemplate(
        customerName,
        bodyContent,
        offerLine,
        productImage,
        context,
        'This is our last message about this cart — your items stay saved if you come back.',
      ),
  },
}

export function formatWhatsAppPhone(phone: string): string {
  const sanitized = phone.replace(/[^\d+]/g, '')

  if (!sanitized.startsWith('+')) {
    if (sanitized.length === 10) {
      return `+91${sanitized}`
    }
    return `+${sanitized}`
  }

  return sanitized
}

export function isValidWhatsAppPhone(phone: string): boolean {
  const sanitized = formatWhatsAppPhone(phone)
  const match = sanitized.match(/^\+(\d{1,3})(\d{7,15})$/)
  return match !== null
}
