const authKey = process.env.MSG91_AUTH_KEY
const senderId = process.env.MSG91_SENDER_ID || 'CARTGN'

export interface SendSMSOptions {
  to: string
  body: string
}

export async function sendSMS({ to, body }: SendSMSOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (!authKey) {
    console.warn('MSG91 auth key not configured')
    return { success: false, error: 'MSG91 not configured' }
  }

  try {
    const mobiles = sanitizePhoneNumber(to).replace(/^\+/, '')
    const params = new URLSearchParams({
      authkey: authKey,
      mobiles,
      message: body,
      sender: senderId,
      route: '4',
      country: '91',
    })
    const res = await fetch(`https://api.msg91.com/api/sendhttp.php?${params}`)
    const text = (await res.text()).trim()

    // MSG91's legacy sendhttp.php returns HTTP 200 even on failure, with the
    // error described in the body (e.g. {"type":"error",...} or text containing
    // "error"). On success it returns a request id. Treat error bodies as failures.
    const looksLikeError = !text || /error|invalid|fail/i.test(text)
    if (!res.ok || looksLikeError) {
      return { success: false, error: text || `HTTP ${res.status}` }
    }

    return {
      success: true,
      messageId: text,
    }
  } catch (error: any) {
    console.error('SMS send error:', error)
    return { success: false, error: error.message }
  }
}

export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

export function isValidPhoneNumber(phone: string): boolean {
  const sanitized = sanitizePhoneNumber(phone)
  return /^\+?\d{10,15}$/.test(sanitized)
}

export function formatPhoneNumber(phone: string): string {
  const sanitized = sanitizePhoneNumber(phone)
  if (sanitized.length === 10) return `91${sanitized}`
  if (sanitized.length === 12 && sanitized.startsWith('91')) return sanitized
  if (!sanitized.startsWith('+')) return `91${sanitized}`
  return sanitized.replace(/^\+/, '')
}

export async function getSMSDeliveryStatus(messageId: string): Promise<string> {
  if (!authKey) return 'unknown'
  try {
    const res = await fetch(`https://api.msg91.com/api/dlr.php?authkey=${authKey}&message_id=${messageId}`)
    const data = await res.json()
    return data.status || 'unknown'
  } catch { return 'unknown' }
}

export const SMSTemplates = {
  abandoned: (customerName: string, cartTotal: number, cartUrl: string, currencySymbol = '₹') => `
${customerName || 'there'}! Your cart is still warm!
Complete your order: ${cartUrl}
Total: ${currencySymbol}${cartTotal.toFixed(2)}
Reply STOP to unsubscribe
  `.trim(),

  withDiscount: (customerName: string, cartTotal: number, discountCode: string, discountPercent: number, cartUrl: string, currencySymbol = '₹') => `
${customerName || 'Hey'}! Your cart is waiting.
Use code ${discountCode} for ${discountPercent}% off!
Shop now: ${cartUrl}
Reply STOP to unsubscribe
  `.trim(),

  urgent: (customerName: string, cartTotal: number, cartUrl: string) => `
Last chance! Your cart items are selling out fast.
Complete checkout before they're gone: ${cartUrl}
Reply STOP to unsubscribe
  `.trim(),

  backInStock: (customerName: string, productName: string, cartUrl: string) => `
Good news! ${productName} is back in stock.
Complete your order: ${cartUrl}
Reply STOP to unsubscribe
  `.trim(),
}
