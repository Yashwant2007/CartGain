export interface WhatsAppMessageOptions {
  to: string
  content: string
  mediaUrl?: string
  templateName?: string
  templateParams?: string[]
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
      body.template = {
        name: templateName,
        language: { code: 'en' },
        components: templateParams ? [
          {
            type: 'body',
            parameters: templateParams.map((param) => ({
              type: 'text',
              text: param,
            })),
          },
        ] : [],
      }
    } else {
      body.type = 'text'
      body.text = { body: content }
    }

    if (mediaUrl) {
      body.type = 'image'
      body.image = { link: mediaUrl, caption: content }
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

// WhatsApp templates for cart recovery
export const WhatsAppTemplates = {
  abandoned_cart: {
    name: 'abandoned_cart_reminder',
    generateParams: (customerName: string, productName: string, cartUrl: string) => [
      customerName || 'there',
      productName,
      cartUrl,
    ],
  },

  discount_offer: {
    name: 'cart_discount_offer',
    generateParams: (customerName: string, discountCode: string, discountPercent: number, cartUrl: string) => [
      customerName || 'there',
      discountCode,
      discountPercent.toString(),
      cartUrl,
    ],
  },

  back_in_stock: {
    name: 'product_back_in_stock',
    generateParams: (customerName: string, productName: string, cartUrl: string) => [
      customerName,
      productName,
      cartUrl,
    ],
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
  // WhatsApp supports numbers from 10-15 digits after country code
  const match = sanitized.match(/^\+(\d{1,3})(\d{7,15})$/)
  return match !== null
}
