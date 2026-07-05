export interface WhatsAppMessageOptions {
  to: string
  content: string
  mediaUrl?: string
  templateName?: string
  templateParams?: string[]
}

async function sendViaMeta(to: string, body: any): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_BUSINESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'Meta WhatsApp not configured' }
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
  return { success: false, error: data?.error?.message || 'Failed to send via Meta' }
}

async function sendViaAisensy(to: string, content: string, templateName?: string, templateParams?: string[]): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.AISENSY_API_KEY
  const senderNumber = process.env.AISENSY_SENDER_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!apiKey || !senderNumber) {
    return { success: false, error: 'Aisensy not configured' }
  }

  try {
    const payload: any = {
      apiKey,
      campaignName: 'cart_recovery',
      destination: formatWhatsAppPhone(to),
      source: senderNumber,
      userName: 'Customer',
    }

    if (templateName) {
      payload.templateParams = templateParams || []
    } else {
      payload.messageContent = content
    }

    const response = await fetch('https://backend.aisensy.com/api/v1/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (response.ok && data?.id) {
      return { success: true, messageId: String(data.id) }
    }
    return { success: false, error: data?.message || 'Failed to send via Aisensy' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
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
  const aisensyKey = process.env.AISENSY_API_KEY
  const metaToken = process.env.WHATSAPP_BUSINESS_TOKEN

  if (!aisensyKey && !metaToken) {
    console.warn('WhatsApp not configured — set WHATSAPP_BUSINESS_TOKEN (Meta) or AISENSY_API_KEY')
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

    if (aisensyKey) {
      return await sendViaAisensy(to, content, templateName, templateParams)
    }
    return await sendViaMeta(to, body)
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
