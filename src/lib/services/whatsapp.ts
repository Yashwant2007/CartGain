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
        // Templates created in WhatsApp Manager default to NAMED parameters
        // ({{name}}, {{body}}, {{discount}}); positional {{1}} templates use
        // the plain shape. Sending the wrong one is a 132000/100 rejection.
        const namedFormat =
          (process.env.WHATSAPP_TEMPLATE_PARAM_FORMAT || '').trim().toLowerCase() === 'named'
        const paramNames = (process.env.WHATSAPP_TEMPLATE_PARAM_NAMES || 'name,body,discount')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
        components.push({
          type: 'body',
          parameters: templateParams.body.map((param, index) => ({
            type: 'text',
            ...(namedFormat ? { parameter_name: paramNames[index] || `param${index + 1}` } : {}),
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
    const post = async (payload: any) => {
      const response = await fetch(
        `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        }
      )
      const json = await response.json().catch(() => ({}))
      return { ok: response.ok, json }
    }

    let attempt = await post(body)

    // Compatibility retries. Meta's wording is opaque, so translate the two
    // approval mismatches we can actually fix:
    //   132001 = template not found for that language → try en_US
    //   132000/131008 = component/param mismatch → drop the header first, then
    //   (only if it still fails) drop the button too. Dropping everything at
    //   once would break an approved dynamic URL button.
    if (!attempt.ok && templateName) {
      const codeOf = () => attempt.json?.error?.code
      if (codeOf() === 132001) {
        body.template.language.code = 'en_US'
        attempt = await post(body)
      }
      if (codeOf() === 132000 || codeOf() === 131008) {
        const components: any[] = body.template?.components || []
        const withoutHeader = components.filter((c) => c.type !== 'header')
        if (withoutHeader.length !== components.length) {
          body.template.components = withoutHeader
          attempt = await post(body)
        }
      }
      if (codeOf() === 132000 || codeOf() === 131008) {
        const components: any[] = body.template?.components || []
        const bodyOnly = components.filter((c) => c.type === 'body')
        if (bodyOnly.length !== components.length) {
          body.template.components = bodyOnly
          attempt = await post(body)
        }
      }
    }

    const data = attempt.json
    const messageId = data?.messages?.[0]?.id
    if (attempt.ok && messageId) {
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

/**
 * Try the small set of payload shapes we can send, and report which one Meta
 * accepts. Used to diagnose an approval/auth mismatch in one call instead of
 * guessing: a text message proves the token can send, a body-only template
 * proves the template is usable, and the button variant proves the dynamic
 * URL parameter matches.
 */
export async function runProbe(
  to: string,
  opts?: {
    templateName?: string
    accessToken?: string
    phoneNumberId?: string
    headerImageUrl?: string
  },
): Promise<Array<{ label: string; ok: boolean; code?: number; subcode?: number; message?: string; details?: string }>> {
  const cleanEnv = (value: string | undefined): string =>
    (value || '').replace(/^\s*["']|["']\s*$/g, '').trim()
  const phoneNumberId = cleanEnv(opts?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID)
  const accessToken = cleanEnv(opts?.accessToken || process.env.WHATSAPP_BUSINESS_TOKEN).replace(/^Bearer\s+/i, '')
  const graphVersion = process.env.WHATSAPP_API_VERSION || 'v22.0'
  const templateName = opts?.templateName || 'cart_reminders'
  const recipient = formatWhatsAppPhone(to)

  const post = async (payload: any) => {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        },
      )
      const json = await response.json().catch(() => ({}))
      return { ok: response.ok, json }
    } catch (error: any) {
      return { ok: false, json: { error: { message: error?.message || 'request failed' } } }
    }
  }

  const bodyParams = [
    { type: 'text', text: 'Test' },
    { type: 'text', text: 'Your cart is saved and this is a template check from CartGain.' },
    { type: 'text', text: 'Use code SAVE10 for 10% off' },
  ]

  const imageUrl =
    opts?.headerImageUrl || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || 'https://cart-gain.com/logo.png'
  const imageHeader = {
    type: 'header',
    parameters: [{ type: 'image', image: { link: imageUrl } }],
  }
  const button = {
    type: 'button',
    sub_type: 'url',
    index: 0,
    parameters: [{ type: 'text', text: 'probe-cart-id' }],
  }
  const positional = bodyParams
  const named = [
    { type: 'text', parameter_name: 'name', text: 'Test' },
    { type: 'text', parameter_name: 'body', text: 'Your cart is saved and this is a template check from CartGain.' },
    { type: 'text', parameter_name: 'discount', text: 'Use code SAVE10 for 10% off' },
  ]

  const variants: Array<{ label: string; payload: any }> = [
    {
      label: 'text message',
      payload: { messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body: 'CartGain test message.' } },
    },
    {
      label: `template ${templateName} image header + positional body (en)`,
      payload: {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [imageHeader, { type: 'body', parameters: positional }],
        },
      },
    },
    {
      label: `template ${templateName} image header + named body (en)`,
      payload: {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [imageHeader, { type: 'body', parameters: named }],
        },
      },
    },
    {
      label: `template ${templateName} image header + positional body + url button (en)`,
      payload: {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [imageHeader, { type: 'body', parameters: positional }, button],
        },
      },
    },
  ]

  const results: Array<{ label: string; ok: boolean; code?: number; subcode?: number; message?: string; details?: string }> = []
  for (const variant of variants) {
    const attempt = await post(variant.payload)
    const error = attempt.json?.error
    results.push({
      label: variant.label,
      ok: attempt.ok && Boolean(attempt.json?.messages?.[0]?.id),
      code: error?.code,
      subcode: error?.error_subcode,
      message: error?.message,
      details: error?.error_data?.details,
    })
  }
  return results
}

/**
 * Fetch the phone number's own metadata with the configured token. This proves
 * whether WHATSAPP_PHONE_NUMBER_ID belongs to the WhatsApp Business Account
 * that issued WHATSAPP_BUSINESS_TOKEN — a mismatch is the usual cause of a bare
 * (#100) OAuthException on /messages.
 */
export async function getWhatsAppAccountInfo(opts?: {
  /** Copy this from WhatsApp Manager when the token cannot enumerate businesses. */
  wabaId?: string
  /** Test a different token (e.g. the app's temporary one) without redeploying. */
  accessToken?: string
}): Promise<{
  ok: boolean
  status: number
  body: unknown
}> {
  const cleanEnv = (value: string | undefined): string =>
    (value || '').replace(/^\s*["']|["']\s*$/g, '').trim()
  const phoneNumberId = cleanEnv(process.env.WHATSAPP_PHONE_NUMBER_ID)
  const accessToken = cleanEnv(opts?.accessToken || process.env.WHATSAPP_BUSINESS_TOKEN).replace(
    /^Bearer\s+/i,
    '',
  )
  const graphVersion = process.env.WHATSAPP_API_VERSION || 'v22.0'

  if (!phoneNumberId || !accessToken) {
    return { ok: false, status: 0, body: { error: 'WhatsApp env vars are missing' } }
  }

  const get = async (path: string): Promise<{ ok: boolean; status: number; body: any }> => {
    try {
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      })
      const body = await response.json().catch(() => ({}))
      return { ok: response.ok, status: response.status, body }
    } catch (error: any) {
      return { ok: false, status: 0, body: { error: error?.message || 'request failed' } }
    }
  }

  try {
    const account = await get(
      `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,account_mode,name_status,code_verification_status,platform_type`,
    )

    const tokenInfo = await get(`debug_token?input_token=${encodeURIComponent(accessToken)}`)
    const scopes: string[] = tokenInfo.body?.data?.scopes || []
    const tokenSummary = {
      appId: tokenInfo.body?.data?.app_id,
      type: tokenInfo.body?.data?.type,
      isValid: tokenInfo.body?.data?.is_valid,
      expiresAt: tokenInfo.body?.data?.expires_at === 0 ? 'never' : tokenInfo.body?.data?.expires_at,
      scopes,
      canSend: scopes.includes('whatsapp_business_messaging'),
      canManage: scopes.includes('whatsapp_business_management'),
    }
    // The phone-number node does not expose its WABA, so try the explicit id,
    // then walk me → businesses → owned WhatsApp accounts to match the number.
    let wabaId: string | null = opts?.wabaId ? String(opts.wabaId) : null
    const lookupErrors: string[] = []
    if (!wabaId) {
      const businessesRes = await get('me/businesses?fields=id,name')
      if (!businessesRes.ok) lookupErrors.push(`me/businesses: ${businessesRes.body?.error?.message}`)
      for (const business of businessesRes.body?.data || []) {
        const owned = await get(`${business.id}/owned_whatsapp_business_accounts?fields=id,name`)
        if (!owned.ok) lookupErrors.push(`${business.id}: ${owned.body?.error?.message}`)
        for (const waba of owned.body?.data || []) {
          const numbers = await get(`${waba.id}/phone_numbers?fields=id,display_phone_number,status`)
          if ((numbers.body?.data || []).some((n: any) => String(n.id) === phoneNumberId)) {
            wabaId = String(waba.id)
            break
          }
        }
        if (wabaId) break
      }
    }
    const subscribed = wabaId ? await get(`${wabaId}/subscribed_apps`) : null
    const wabaNumbers = wabaId
      ? await get(`${wabaId}/phone_numbers?fields=id,display_phone_number,status,platform_type`)
      : null
    const templatesRes = wabaId
      ? await get(`${wabaId}/message_templates?limit=100&fields=name,status,language,category,parameter_format,components`)
      : { ok: false, status: 0, body: null }

    return {
      ok: account.ok,
      status: account.status,
      body: {
        account: account.body,
        wabaId,
        wabaLookup: wabaId
          ? opts?.wabaId
            ? 'from the wabaId you supplied'
            : 'matched via business → owned WhatsApp accounts'
          : 'not discoverable — supply "wabaId" (WhatsApp Manager → account overview)',
        wabaLookupErrors: lookupErrors,
        wabaNumbers: wabaNumbers?.ok ? wabaNumbers.body?.data : wabaNumbers?.body,
        token: tokenSummary,
        subscribedApps: subscribed
          ? subscribed.ok
            ? subscribed.body?.data
            : subscribed.body
          : 'unknown (no wabaId)',
        templates: templatesRes.ok
          ? (templatesRes.body?.data || []).map((t: any) => {
              const body = (t.components || []).find((c: any) => c.type === 'BODY')
              const header = (t.components || []).find((c: any) => c.type === 'HEADER')
              const buttons = (t.components || []).find((c: any) => c.type === 'BUTTONS')
              const variables = Array.from(
                new Set(
                  String(body?.text || '')
                    .split(/\{\{([^}]+)\}\}/)
                    .filter((_: string, i: number) => i % 2 === 1),
                ),
              )
              return {
                name: t.name,
                status: t.status,
                language: t.language,
                category: t.category,
                parameterFormat: t.parameter_format,
                bodyText: body?.text,
                variableTokens: variables,
                headerFormat: header?.format || 'NONE',
                bodyExample: body?.example?.body_params,
                buttons: (buttons?.buttons || []).map((b: any) => ({
                  type: b.type,
                  text: b.text,
                  url: b.url,
                  example: b.example,
                })),
              }
            })
          : templatesRes.body,
      },
    }
  } catch (error: any) {
    return { ok: false, status: 0, body: { error: error?.message || 'request failed' } }
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
  // The approved templates declare an IMAGE header, so the parameter is
  // mandatory on every send — a cart item without a photo must fall back to a
  // brand image instead of omitting the header (Meta answers #132012).
  const headerImage =
    productImage || process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || 'https://cart-gain.com/logo.png'
  const params: WhatsAppTemplateParams = {
    header: wantsImageHeader ? { type: 'image', imageUrl: headerImage } : undefined,
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
    name: process.env.WHATSAPP_TEMPLATE_REMINDER || 'cart_reminders',
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
    name: process.env.WHATSAPP_TEMPLATE_FOLLOWUP || 'cart_followup',
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
    name: process.env.WHATSAPP_TEMPLATE_FINAL || 'cart_urgent',
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
