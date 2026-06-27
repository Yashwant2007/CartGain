import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const fromEmail = process.env.FROM_EMAIL || 'noreply@cart-gain.com'
const fromName = process.env.FROM_NAME || 'CartGain'

let resend: Resend | null = null
if (apiKey) {
  try {
    resend = new Resend(apiKey)
  } catch (e) {
    console.error('Failed to init Resend:', e)
  }
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = `${fromName} <${fromEmail}>`,
}: EmailOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (!resend) {
    // Not configured — log for local dev, but report failure so analytics
    // never count an email that was never actually sent.
    console.warn(`[EMAIL NOT SENT — Resend not configured] To: ${to} | Subject: ${subject}`)
    return { success: false, error: 'Email service (Resend) not configured' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
    })
    if (error) throw error
    return { success: true, messageId: data?.id }
  } catch (error: any) {
    console.error('Email send error:', error)
    return { success: false, error: error?.message || 'Failed to send email' }
  }
}

export const EmailTemplates = {
  abandoned: (customerName: string, items: any[], cartTotal: number, cartUrl: string, storeName: string, currencySymbol = '₹', aiBody?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Order at ${storeName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background: #f8fafc;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">

    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">🛍️</div>
      <h1 style="color: #ffffff; font-size: 24px; margin: 0;">Your cart is still warm!</h1>
      <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 8px 0 0;">Hey ${customerName || 'there'}, don't let these gems slip away ✨</p>
    </div>

    <div style="padding: 24px;">
      ${aiBody || `
      <div style="font-size: 15px; line-height: 1.8; color: #475569; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f5;">
        You've got a great eye, ${customerName || 'there'}! ✨<br>
        The pieces you picked are carefully chosen — each one handpicked to bring something special. We've saved everything for you, so you can complete your look whenever you're ready.<br>
        Don't wait too long — the best finds always go fast. 💫
      </div>
      `}
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px;">Items in your cart 🛒</h2>
      ${items.map((item: any) => `
        <div style="display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid #f0f0f5;">
          <img src="${item.image || 'https://via.placeholder.com/80'}" alt="${item.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; flex-shrink: 0;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 16px; color: #1a1a2e;">${item.name}</div>
            ${item.description ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;">${item.description}</div>` : ''}
            <div style="font-size: 14px; color: #667eea; font-weight: 600; margin-top: 6px;">${currencySymbol}${Number(item.price).toFixed(2)} × ${item.quantity || 1}</div>
          </div>
        </div>
      `).join('')}

      <div style="text-align: right; padding: 16px 0; font-size: 22px; font-weight: 700; color: #1a1a2e;">
        Total: ${currencySymbol}${cartTotal.toFixed(2)}
      </div>

      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: center;">
        <p style="margin: 0; color: #dc2626; font-weight: 500;">⏳ Items in your cart are in high demand and may sell out soon!</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${cartUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);">
          Complete Your Order →
        </a>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 12px;">Secure checkout • Takes less than 2 minutes</p>
      </div>

      <div style="text-align: center; border-top: 1px solid #f0f0f5; padding-top: 20px; margin-top: 8px;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 4px;">This email was sent because you started a checkout at <strong>${storeName}</strong>.</p>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 4px;"><a href="${cartUrl}?unsubscribe=true" style="color: #94a3b8;">Unsubscribe from recovery messages</a></p>
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `,

  withDiscount: (customerName: string, items: any[], cartTotal: number, discountCode: string, discountPercent: number, cartUrl: string, storeName: string, currencySymbol = '₹') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .discount-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; }
    .discount-code { background: white; color: #333; padding: 15px 30px; font-size: 24px; font-weight: bold; border-radius: 8px; display: inline-block; margin: 15px 0; letter-spacing: 2px; }
    .cta-button { display: inline-block; background: #3b82f6; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>A Special Offer Just For You!</h1>
    <p>Hi ${customerName || 'there'}, we noticed you left items in your cart. Here's ${discountPercent}% off to complete your order!</p>

    <div class="discount-box">
      <div>Use code at checkout:</div>
      <div class="discount-code">${discountCode}</div>
      <div>Save ${currencySymbol}${(cartTotal * discountPercent / 100).toFixed(2)} instantly!</div>
    </div>

    <div style="text-align: center;">
      <a href="${cartUrl}" class="cta-button">Claim Your Discount</a>
    </div>

    <p style="text-align: center; color: #666; font-size: 14px;">
      Offer expires in 24 hours. Don't miss out!
    </p>

    <div class="footer">
      <p><a href="${cartUrl}?unsubscribe=true" style="color: #999;">Unsubscribe</a></p>
      <p>© ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `,

  backInStock: (customerName: string, productName: string, productImage: string, cartUrl: string, storeName: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; text-align: center; }
    .product-image { max-width: 100%; height: auto; border-radius: 12px; margin: 20px 0; }
    .cta-button { display: inline-block; background: #22c55e; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Good News!</h1>
    <p>Hi ${customerName || 'there'},</p>
    <p><strong>${productName}</strong> is back in stock!</p>
    <img src="${productImage}" alt="${productName}" class="product-image">
    <br>
    <a href="${cartUrl}" class="cta-button">Grab It Before It's Gone</a>
  </div>
</body>
</html>
  `,
}

export async function sendAbandonedCartEmail(
  to: string,
  customerName: string,
  items: any[],
  cartTotal: number,
  cartUrl: string,
  storeName: string,
  currencySymbol = '₹'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = EmailTemplates.abandoned(customerName, items, cartTotal, cartUrl, storeName, currencySymbol)
  const text = `Hi ${customerName || 'there'}, you left items in your cart. Total: ${currencySymbol}${cartTotal.toFixed(2)}. Complete your order: ${cartUrl}`

  return sendEmail({
    to,
    subject: `You left ${items.length} item(s) in your cart!`,
    html,
    text,
  })
}

export async function sendDiscountEmail(
  to: string,
  customerName: string,
  items: any[],
  cartTotal: number,
  discountCode: string,
  discountPercent: number,
  cartUrl: string,
  storeName: string,
  currencySymbol = '₹'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = EmailTemplates.withDiscount(customerName, items, cartTotal, discountCode, discountPercent, cartUrl, storeName, currencySymbol)
  const text = `Hi ${customerName || 'there'}, here's ${discountPercent}% off your cart! Use code ${discountCode} at checkout: ${cartUrl}`

  return sendEmail({
    to,
    subject: `${discountPercent}% off your cart inside!`,
    html,
    text,
  })
}
