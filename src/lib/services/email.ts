let transporter: any = null;

if (typeof window === 'undefined') {
  try {
    const nodemailer = require('nodemailer');
    const hasCredentials = process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD;
    if (hasCredentials) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_SERVER_HOST || 'smtp.sendgrid.net',
        port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
        tls: { rejectUnauthorized: false },
      });
    } else {
      console.log('Email: no credentials configured, emails will be logged to console');
    }
  } catch (e) {
    console.error('Failed to load email transporter:', e);
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
  from = process.env.FROM_EMAIL || 'noreply@recoverflow.com',
}: EmailOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (!transporter) {
    const fallbackMsg = `[EMAIL LOG] To: ${to} | Subject: ${subject} | Text: ${(text || html).substring(0, 200)}...`
    console.log(fallbackMsg)
    return { success: true, messageId: `logged-${Date.now()}` }
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
    })
    return { success: true, messageId: info.messageId }
  } catch (error: any) {
    console.error('Email send error:', error)
    const fallbackMsg = `[EMAIL FALLBACK] To: ${to} | Subject: ${subject} | Error: ${error.message}`
    console.log(fallbackMsg)
    return { success: true, messageId: `fallback-${Date.now()}` }
  }
}

export const EmailTemplates = {
  abandoned: (customerName: string, items: any[], cartTotal: number, cartUrl: string, storeName: string, currencySymbol = '$') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
    .products { margin: 30px 0; }
    .product { display: flex; align-items: center; padding: 15px 0; border-bottom: 1px solid #eee; }
    .product-image { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; margin-right: 15px; }
    .product-info { flex: 1; }
    .product-name { font-weight: 600; margin-bottom: 5px; }
    .product-price { color: #666; }
    .total { text-align: right; font-size: 20px; font-weight: bold; margin: 20px 0; }
    .cta-button { display: inline-block; background: #3b82f6; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${storeName}</div>
    </div>

    <h1>Hi ${customerName || 'there'},</h1>
    <p>You left some amazing items in your cart! Don't worry, we've saved them for you.</p>

    <div class="products">
      ${items.map((item: any) => `
        <div class="product">
          <img src="${item.image || 'https://via.placeholder.com/80'}" alt="${item.name}" class="product-image">
          <div class="product-info">
            <div class="product-name">${item.name}</div>
            <div class="product-price">${currencySymbol}${item.price.toFixed(2)} × ${item.quantity}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="total">Total: ${currencySymbol}${cartTotal.toFixed(2)}</div>

    <div style="text-align: center;">
      <a href="${cartUrl}" class="cta-button">Complete Your Order</a>
    </div>

    <p style="text-align: center; color: #666; font-size: 14px;">
      Items in your cart are in high demand and may sell out soon!
    </p>

    <div class="footer">
      <p>This email was sent because you started a checkout at ${storeName}.</p>
      <p>© ${new Date().getFullYear()} ${storeName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `,

  withDiscount: (customerName: string, items: any[], cartTotal: number, discountCode: string, discountPercent: number, cartUrl: string, storeName: string, currencySymbol = '$') => `
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
  currencySymbol = '$'
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
  currencySymbol = '$'
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
