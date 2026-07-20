export interface WhatsAppTemplateParams {
  header?: { type: 'image'; imageUrl: string } | { type: 'text'; text: string }
  body?: string[]
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

// WhatsApp template configs — these must match templates created in Meta Business Manager
export const WhatsAppTemplates = {
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
      body: [customerName || 'there', bodyContent, discountLine],
      buttons: [{ type: 'url', text: '🛒 Complete Purchase', url: cartUrl }],
    }),
  },

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
      body: [customerName || 'there', bodyContent, discountLine],
      buttons: [{ type: 'url', text: '👉 Complete Order', url: cartUrl }],
    }),
  },

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
      body: [customerName || 'there', bodyContent, discountLine],
      buttons: [{ type: 'url', text: '🏃‍♂️ Complete Now', url: cartUrl }],
    }),
  },

  discount_offer: {
    name: 'cart_discount_offer',
    generateParams: (
      customerName: string,
      productName: string,
      discountCode: string,
      discountPercent: number,
      productImage: string | undefined,
      cartUrl: string,
    ): WhatsAppTemplateParams => ({
      header: productImage
        ? { type: 'image', imageUrl: productImage }
        : { type: 'text', text: `🎉 ${discountPercent}% Off Just for You!` },
      body: [
        customerName || 'there',
        productName || 'your items',
        discountCode,
        discountPercent.toString(),
        cartUrl,
      ],
    }),
  },

  back_in_stock: {
    name: 'product_back_in_stock',
    generateParams: (
      customerName: string,
      productName: string,
      productImage: string | undefined,
      cartUrl: string,
    ): WhatsAppTemplateParams => ({
      header: productImage
        ? { type: 'image', imageUrl: productImage }
        : { type: 'text', text: `Back in Stock!` },
      body: [
        customerName || 'there',
        productName || 'your item',
        cartUrl,
      ],
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
