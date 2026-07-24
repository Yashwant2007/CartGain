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
}

export async function sendWhatsAppMessage({
  to,
  content,
  mediaUrl,
  templateName,
  templateParams,
}: WhatsAppMessageOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_BUSINESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('WhatsApp not configured — set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_TOKEN')
    return { success: false, error: 'WhatsApp not configured' }
  }

  try {
    const formattedTo = formatWhatsAppPhone(to)
    const body: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
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
        language: { code: 'en' },
        components,
      }
    } else if (mediaUrl) {
      body.type = 'image'
      body.image = { link: mediaUrl, caption: content || '' }
    } else {
      body.type = 'text'
      body.text = { body: content || '' }
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      }
    )

    const data = await response.json()
    const messageId = data?.messages?.[0]?.id
    if (response.ok && messageId) {
      return { success: true, messageId }
    }
    return {
      success: false,
      error: data?.error?.message || 'Failed to send WhatsApp message',
    }
  } catch (error: any) {
    console.error('WhatsApp send error:', error)
    return { success: false, error: error.message }
  }
}

// ─── 3 CORE WHATSAPP TEMPLATES ───
// Register these exact bodies in Meta Business Manager.
// Variable mapping:  {{1}} = name | {{2}} = AI body text | {{3}} = discount line (empty if none)
// All templates include CartGain footer + single URL button.

export const WhatsAppTemplates = {
  /**
   * ── REMINDER (Step 0, +1h after abandonment) ──
   * Warm validation. Desire. Gentle nudge.
   *
   * Meta body:
   *   Hey {{1}} 👋
   *
   *   {{2}}
   *
   *   {{3}}
   *
   * Footer: Powered by CartGain — recoverflow.com
   * Button: 🛒 Complete Purchase
   */
  abandoned_cart: {
    name: 'abandoned_cart_reminder',
    generateParams: (
      customerName: string,
      bodyContent: string,
      discountLine: string,
      productImage: string | undefined,
      cartUrl: string,
    ): WhatsAppTemplateParams => ({
      header: productImage
        ? { type: 'image', imageUrl: productImage }
        : undefined,
      body: [
        customerName || 'there',
        bodyContent,
        discountLine,
      ],
      footer: 'Powered by CartGain \u2014 recoverflow.com',
      buttons: [{ type: 'url', text: '\uD83D\uDED2 Complete Purchase', url: cartUrl }],
    }),
  },

  /**
   * ── FOLLOW-UP (Step 1, +4h after abandonment) ──
   * Social proof. Scarcity. Warmer nudge.
   *
   * Meta body:
   *   {{1}}, still thinking? \uD83D\uDCAB
   *
   *   {{2}}
   *
   *   {{3}}
   *
   * Footer: Powered by CartGain — recoverflow.com
   * Button: 👉 Complete Order
   */
  abandoned_cart_followup: {
    name: 'abandoned_cart_followup',
    generateParams: (
      customerName: string,
      bodyContent: string,
      discountLine: string,
      productImage: string | undefined,
      cartUrl: string,
    ): WhatsAppTemplateParams => ({
      header: productImage
        ? { type: 'image', imageUrl: productImage }
        : undefined,
      body: [
        `${customerName}, still thinking? \uD83D\uDCAB`,
        bodyContent,
        discountLine,
      ],
      footer: 'Powered by CartGain \u2014 recoverflow.com',
      buttons: [{ type: 'url', text: '\uD83D\uDC49 Complete Order', url: cartUrl }],
    }),
  },

  /**
   * ── URGENT (Step 2, +24h after abandonment) ──
   * Loss aversion. Time sensitivity. Final call.
   *
   * Meta body:
   *   {{1}}, last chance \u23F3
   *
   *   {{2}}
   *
   *   {{3}}
   *
   * Footer: Powered by CartGain — recoverflow.com
   * Button: 🏃‍♂️ Complete Now
   */
  abandoned_cart_urgent: {
    name: 'abandoned_cart_urgent',
    generateParams: (
      customerName: string,
      bodyContent: string,
      discountLine: string,
      productImage: string | undefined,
      cartUrl: string,
    ): WhatsAppTemplateParams => ({
      header: productImage
        ? { type: 'image', imageUrl: productImage }
        : undefined,
      body: [
        `${customerName}, last chance \u23F3`,
        bodyContent,
        discountLine,
      ],
      footer: 'Powered by CartGain \u2014 recoverflow.com',
      buttons: [{ type: 'url', text: '\uD83C\uDFC3\u200D\u2642\uFE0F Complete Now', url: cartUrl }],
    }),
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
