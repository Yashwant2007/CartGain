import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { redactSensitive } from '@/lib/data-protection'

// NOTE: cart-gain.com is NOT domain-verified in Resend (no resend._domainkey /
// Resend SPF records exist on the domain). Resend silently drops sends from
// unverified domains. SMTP fallback (EMAIL_SERVER_*) covers this case — any
// SMTP relay (e.g. a verified domain, Brevo, Mailgun, etc.) works immediately.
// Preferred fix long-term: verify cart-gain.com in the Resend dashboard.

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

const smtpHost = process.env.EMAIL_SERVER_HOST
const smtpPort = Number(process.env.EMAIL_SERVER_PORT || '587')
const smtpUser = process.env.EMAIL_SERVER_USER
const smtpPass = process.env.EMAIL_SERVER_PASSWORD

let smtpTransport: nodemailer.Transporter | null = null
if (smtpHost && smtpUser && smtpPass) {
  try {
    smtpTransport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    })
  } catch (e) {
    console.error('Failed to init SMTP transport:', e)
  }
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export interface EmailSendResult {
  success: boolean
  messageId?: string
  error?: string
  /** Which provider actually delivered (or was last tried) — never silent. */
  channel?: string
  /** True when the first configured provider failed and a later one succeeded. */
  fellBack?: boolean
}

// HTML-escape every value that reaches an email template. Recovery emails mix
// customer-supplied checkout data (name), merchant catalog data (product name /
// description / image) and LLM output (aiBody) into raw HTML — without escaping
// any of it, a crafted product name or a prompt-injected AI body could inject
// markup/links into a message that arrives from the merchant's trusted domain.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Escape + preserve line breaks for free-text AI bodies.
function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>')
}

// Only allow http(s)/mailto URLs in href attributes; anything else becomes a
// harmless no-op anchor.
function safeHref(value: unknown): string {
  const s = String(value ?? '').trim()
  return /^(https?:|mailto:)/i.test(s) ? escapeHtml(s) : '#'
}

// Only allow http(s) image URLs; anything else yields no image.
function safeImageSrc(value: unknown): string {
  const s = String(value ?? '').trim()
  return /^https?:\/\//i.test(s) ? escapeHtml(s) : ''
}

/**
 * Reports which transactional-email providers are configured. Used by the
 * health endpoint so a silent "no provider" state (or a Resend-only setup,
 * where an unverified FROM_EMAIL domain silently drops mail) is visible instead
 * of only surfacing when a merchant reports a missing email.
 */
export function getEmailProviderStatus(): {
  resend: boolean
  smtp: boolean
  configured: boolean
  fromDomain: string | null
  warning?: string
} {
  // Read env fresh on every call (not the module singletons) so the health
  // check reflects the CURRENT configuration — a redeployed var is picked up
  // without a restart, and tests can assert behaviour without re-importing.
  const from = process.env.FROM_EMAIL || fromEmail
  const fromDomain = (from.split('@')[1] || '').toLowerCase() || null
  const hasResend = Boolean(process.env.RESEND_API_KEY)
  const hasSmtp = Boolean(
    process.env.EMAIL_SERVER_HOST &&
    process.env.EMAIL_SERVER_USER &&
    process.env.EMAIL_SERVER_PASSWORD,
  )
  const configured = hasResend || hasSmtp
  let warning: string | undefined
  if (!configured) {
    warning = 'No transactional email provider configured (set RESEND_API_KEY or EMAIL_SERVER_*).'
  } else if (hasResend && !hasSmtp) {
    // Resend only reliably delivers from a domain verified in their dashboard.
    warning = `Only Resend is configured — verify ${fromDomain || 'the FROM_EMAIL domain'} in Resend (SPF/DKIM), or configure an SMTP fallback, or mail may be silently dropped.`
  }
  return { resend: hasResend, smtp: hasSmtp, configured, fromDomain, warning }
}

function sendViaResend({ to, subject, html, text, from }: Required<Pick<EmailOptions, 'to' | 'subject' | 'html' | 'from'>> & { text?: string }): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  return resend!.emails.send({ from, to: [to], subject, html, ...(text ? { text } : {}) }).then(
    ({ data, error }) => {
      if (error) throw error
      return { success: true, messageId: data?.id }
    },
    (error) => ({ success: false, error: error?.message || 'Failed to send email' })
  )
}

function sendViaSmtp({ to, subject, html, text, from }: Required<Pick<EmailOptions, 'to' | 'subject' | 'html' | 'from'>> & { text?: string }): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (!smtpTransport) {
    return Promise.resolve({ success: false, error: 'SMTP not configured' })
  }
  return smtpTransport.sendMail({ from, to, subject, html, ...(text ? { text } : {}) }).then(
    (info) => ({ success: true, messageId: info.messageId }),
    (error) => ({ success: false, error: error?.message || 'Failed to send email' })
  )
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = `${fromName} <${fromEmail}>`,
}: EmailOptions): Promise<EmailSendResult> {
  const channels: { name: string; send: typeof sendViaResend }[] = []
  if (resend) channels.push({ name: 'resend', send: sendViaResend })
  if (smtpTransport) channels.push({ name: 'smtp', send: sendViaSmtp })

  if (channels.length === 0) {
    // Not configured — log for local dev, but report failure so analytics
    // never count an email that was never actually sent.
    console.error(`[EMAIL NOT SENT — no email provider configured] ${JSON.stringify(redactSensitive({ to, subject }))}`)
    return { success: false, error: 'Email service not configured', channel: 'none' }
  }

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i]
    try {
      const result = await channel.send({ to, subject, html, text, from })
      if (result.success) {
        // Make delivery non-silent: name the provider, and flag when the first
        // choice failed and a fallback carried the message (a signal that the
        // primary provider needs attention).
        const fellBack = i > 0
        if (fellBack) {
          console.warn(
            `[EMAIL] primary provider (${channels[0].name}) failed — delivered via fallback (${channel.name}) to ${JSON.stringify(redactSensitive({ to }))}`,
          )
        } else {
          console.info(`[EMAIL] delivered via ${channel.name} to ${JSON.stringify(redactSensitive({ to }))}`)
        }
        return { ...result, channel: channel.name, fellBack }
      }
      console.warn(`[EMAIL] ${channel.name} failed for ${JSON.stringify(redactSensitive({ to }))}: ${result.error}`)
    } catch (error) {
      console.warn(`[EMAIL] ${channel.name} threw for ${JSON.stringify(redactSensitive({ to }))}:`, redactSensitive(error))
    }
  }

  return {
    success: false,
    error: `All email providers failed (${channels.map((c) => c.name).join(', ')})`,
    channel: 'failed',
  }
}

export const EmailTemplates = {
  abandoned: (customerName: string, items: any[], cartTotal: number, cartUrl: string, storeName: string, currencySymbol = '₹', aiBody?: string, unsubscribeUrl?: string, opts?: {
    emoji?: boolean
    /** The merchant-authorised offer. Rendered only when a real code exists. */
    offer?: { code: string; value: number; type: 'percentage' | 'fixed' | 'free_shipping' } | null
    /** Store checkout with the discount applied (falls back to cartUrl). */
    checkoutUrl?: string
    /** Opens the negotiation panel so the shopper can name their price. */
    bargainUrl?: string
  }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Order at ${escapeHtml(storeName)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background: #f8fafc;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">

    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px 24px; text-align: center;">
      ${opts?.emoji === false ? '' : '<div style="font-size: 48px; margin-bottom: 12px;">🛍️</div>'}
      <h1 style="color: #ffffff; font-size: 24px; margin: 0;">Your cart is still saved</h1>
      <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 8px 0 0;">Hey ${escapeHtml(customerName) || 'there'}, your items are waiting whenever you're ready.</p>
    </div>

    <div style="padding: 24px;">
      ${aiBody ? escapeHtmlMultiline(aiBody) : `
      <div style="font-size: 15px; line-height: 1.8; color: #475569; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f5;">
        Hi ${escapeHtml(customerName) || 'there'}, your items are still in your cart.<br>
        We've saved everything for you, so you can pick up where you left off whenever you're ready.
      </div>
      `}
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px;">Items in your cart${opts?.emoji === false ? '' : ' 🛒'}</h2>
      ${items.map((item: any) => `
        <div style="display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid #f0f0f5;">
          <img src="${safeImageSrc(item.image) || 'https://via.placeholder.com/80'}" alt="${escapeHtml(item.name)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; flex-shrink: 0;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 16px; color: #1a1a2e;">${escapeHtml(item.name)}</div>
            ${item.description ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;">${escapeHtml(item.description)}</div>` : ''}
            <div style="font-size: 14px; color: #667eea; font-weight: 600; margin-top: 6px;">${escapeHtml(currencySymbol)}${Number(item.price).toFixed(2)} × ${item.quantity || 1}</div>
          </div>
        </div>
      `).join('')}

      <div style="text-align: right; padding: 16px 0; font-size: 22px; font-weight: 700; color: #1a1a2e;">
        Total: ${escapeHtml(currencySymbol)}${cartTotal.toFixed(2)}
      </div>

      ${opts?.offer ? `
      <div style="margin: 8px 0 20px; padding: 18px; border: 2px dashed #c7d2fe; border-radius: 14px; background: #eef2ff; text-align: center;">
        <div style="font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #6366f1; font-weight: 700;">Your personal offer</div>
        <div style="font-size: 26px; font-weight: 800; color: #312e81; letter-spacing: 2px; margin: 6px 0;">${escapeHtml(opts.offer.code)}</div>
        <div style="font-size: 14px; color: #475569;">
          ${opts.offer.type === 'percentage'
            ? `${escapeHtml(String(opts.offer.value))}% off this cart`
            : opts.offer.type === 'free_shipping'
              ? 'Free shipping on this order'
              : `${escapeHtml(currencySymbol)}${Number(opts.offer.value).toFixed(2)} off this cart`}
          — applied automatically through the button below.
        </div>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 24px 0;">
        <a href="${safeHref(opts?.checkoutUrl || cartUrl)}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);">
          Complete Your Order →
        </a>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 12px;">Secure checkout • Takes less than 2 minutes</p>
        ${opts?.bargainUrl ? `
        <a href="${safeHref(opts.bargainUrl)}" style="display: inline-block; margin-top: 6px; padding: 12px 28px; border: 2px solid #a5b4fc; color: #4f46e5; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px;">
          Prefer to name your price? Make an offer →
        </a>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">Tell us what works for you — we usually meet you there.</p>
        ` : ''}
      </div>

      <div style="text-align: center; border-top: 1px solid #f0f0f5; padding-top: 20px; margin-top: 8px;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 4px;">This email was sent because you started a checkout at <strong>${escapeHtml(storeName)}</strong>.</p>
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 4px;"><a href="${safeHref(unsubscribeUrl || `${cartUrl}?unsubscribe=true`)}" style="color: #94a3b8;">Unsubscribe from recovery messages</a></p>
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} ${escapeHtml(storeName)}. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `,

  withDiscount: (customerName: string, items: any[], cartTotal: number, discountCode: string, discountPercent: number, cartUrl: string, storeName: string, currencySymbol = '₹', unsubscribeUrl?: string) => `
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
    <p>Hi ${escapeHtml(customerName) || 'there'}, we noticed you left items in your cart. Here's ${escapeHtml(discountPercent)}% off to complete your order!</p>

    <div class="discount-box">
      <div>Use code at checkout:</div>
      <div class="discount-code">${escapeHtml(discountCode)}</div>
      <div>Save ${escapeHtml(currencySymbol)}${(cartTotal * discountPercent / 100).toFixed(2)} instantly!</div>
    </div>

    <div style="text-align: center;">
      <a href="${safeHref(cartUrl)}" class="cta-button">Claim Your Discount</a>
    </div>

    <p style="text-align: center; color: #666; font-size: 14px;">
      Offer expires in 24 hours. Don't miss out!
    </p>

    <div class="footer">
      <p><a href="${safeHref(unsubscribeUrl || `${cartUrl}?unsubscribe=true`)}" style="color: #999;">Unsubscribe</a></p>
      <p>© ${new Date().getFullYear()} ${escapeHtml(storeName)}. All rights reserved.</p>
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
    <p>Hi ${escapeHtml(customerName) || 'there'},</p>
    <p><strong>${escapeHtml(productName)}</strong> is back in stock!</p>
    <img src="${safeImageSrc(productImage)}" alt="${escapeHtml(productName)}" class="product-image">
    <br>
    <a href="${safeHref(cartUrl)}" class="cta-button">Grab It Before It's Gone</a>
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
  currencySymbol = '₹',
  unsubscribeUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = EmailTemplates.withDiscount(customerName, items, cartTotal, discountCode, discountPercent, cartUrl, storeName, currencySymbol, unsubscribeUrl)
  const text = `Hi ${customerName || 'there'}, here's ${discountPercent}% off your cart! Use code ${discountCode} at checkout: ${cartUrl}`

  return sendEmail({
    to,
    subject: `${discountPercent}% off your cart inside!`,
    html,
    text,
  })
}
