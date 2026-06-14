import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER

const client = accountSid && authToken ? twilio(accountSid, authToken) : null

export interface SendSMSOptions {
  to: string
  body: string
  mediaUrl?: string
}

export async function sendSMS({ to, body, mediaUrl }: SendSMSOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (!client) {
    console.warn('Twilio client not initialized')
    return { success: false, error: 'Twilio not configured' }
  }

  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to,
      ...(mediaUrl ? { mediaUrl: [mediaUrl] } : {}),
    })

    return {
      success: true,
      messageId: message.sid,
    }
  } catch (error: any) {
    console.error('SMS send error:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

export function sanitizePhoneNumber(phone: string): string {
  // Remove all non-numeric characters except +
  return phone.replace(/[^\d+]/g, '')
}

export function isValidPhoneNumber(phone: string): boolean {
  const sanitized = sanitizePhoneNumber(phone)
  // Basic validation: 10-15 digits
  return /^\+?\d{10,15}$/.test(sanitized)
}

export function formatPhoneNumber(phone: string): string {
  const sanitized = sanitizePhoneNumber(phone)

  // Handle US numbers
  if (sanitized.length === 10) {
    return `+1${sanitized}`
  }
  if (sanitized.length === 11 && sanitized.startsWith('1')) {
    return `+${sanitized}`
  }
  if (!sanitized.startsWith('+')) {
    return `+${sanitized}`
  }

  return sanitized
}

export async function getSMSDeliveryStatus(messageId: string): Promise<string> {
  if (!client) return 'unknown'

  try {
    const message = await client.messages(messageId).fetch()
    return message.status
  } catch (error) {
    console.error('Failed to get SMS status:', error)
    return 'unknown'
  }
}

// SMS templates for cart recovery
export const SMSTemplates = {
  abandoned: (customerName: string, cartTotal: number, cartUrl: string, currencySymbol = '₹') => `
Hi ${customerName || 'there'}! You left some great items in your cart.
Complete your order now: ${cartUrl}
Total: ${currencySymbol}${cartTotal.toFixed(2)}
  `.trim(),

  withDiscount: (customerName: string, cartTotal: number, discountCode: string, discountPercent: number, cartUrl: string, currencySymbol = '₹') => `
${customerName || 'Hey'}! Your cart is waiting 🎁
Use code ${discountCode} for ${discountPercent}% off!
Shop now: ${cartUrl}
  `.trim(),

  urgent: (customerName: string, cartTotal: number, cartUrl: string) => `
Last chance! Your cart items are selling out fast.
Complete checkout before they're gone: ${cartUrl}
  `.trim(),

  backInStock: (customerName: string, productName: string, cartUrl: string) => `
Good news! ${productName} is back in stock.
Complete your order: ${cartUrl}
  `.trim(),
}
