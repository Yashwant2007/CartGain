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

// HTML-escape every value that reaches an email template.
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

// Only allow http(s)/mailto URLs in href attributes; anything else becomes a harmless no-op anchor.
function safeHref(value: unknown): string {
  const s = String(value ?? '').trim()
  return /^(https?:|mailto:)/i.test(s) ? escapeHtml(s) : '#'
}

// Only allow http(s) image URLs; anything else yields no image.
function safeImageSrc(value: unknown): string {
  const s = String(value ?? '').trim()
  return /^https?:\/\//i.test(s) ? escapeHtml(s) : ''
}

export function getEmailProviderStatus(): {
  resend: boolean
  smtp: boolean
  configured: boolean
  fromDomain: string | null
  warning?: string
} {
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
    console.error(`[EMAIL NOT SENT — no email provider configured] ${JSON.stringify(redactSensitive({ to, subject }))}`)
    return { success: false, error: 'Email service not configured', channel: 'none' }
  }

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i]
    try {
      const result = await channel.send({ to, subject, html, text, from })
      if (result.success) {
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
  abandoned: (
    customerName: string,
    items: any[],
    cartTotal: number,
    cartUrl: string,
    storeName: string,
    currencySymbol = '₹',
    aiBody?: string,
    unsubscribeUrl?: string,
    opts?: {
      emoji?: boolean
      offer?: { code: string; value: number; type: 'percentage' | 'fixed' | 'free_shipping' } | null
      checkoutUrl?: string
      bargainUrl?: string
    }
  ) => {
    const firstName = (customerName || '').trim().split(/\s+/)[0] || customerName || 'there'
    const showEmoji = opts?.emoji !== false
    const itemCount = items?.length || 0
    const itemsHtml = (items || [])
      .map((item: any) => {
        const img = safeImageSrc(item.image)
        const qty = item.quantity || 1
        const price = Number(item.price || 0).toFixed(2)
        return `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td width="92" valign="top">
                  ${
                    img
                      ? `<img src="${img}" alt="${escapeHtml(item.name)}" width="80" height="80" style="width: 80px; height: 80px; object-fit: cover; border-radius: 14px; display: block; border: 1px solid #eef2ff;">`
                      : `<div style="width: 80px; height: 80px; border-radius: 14px; background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%); display: flex; align-items: center; justify-content: center; font-size: 28px;">${showEmoji ? '🛍️' : ''}</div>`
                  }
                </td>
                <td valign="top" style="padding-left: 16px;">
                  <div style="font-weight: 600; font-size: 16px; color: #0f172a; line-height: 1.4;">${escapeHtml(item.name)}</div>
                  ${item.description ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;">${escapeHtml(item.description)}</div>` : ''}
                  <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 13px; color: #475569;">Qty: <strong style="color: #0f172a;">${qty}</strong></div>
                    <div style="font-size: 16px; font-weight: 700; color: #4f46e5;">${escapeHtml(currencySymbol)}${price}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        `
      })
      .join('')

    const textBody = aiBody
      ? escapeHtmlMultiline(aiBody)
      : `Hey ${escapeHtml(firstName)} ${showEmoji ? '✨' : ''}<br><br>Your ${itemCount > 1 ? 'items are' : 'item is'} still sitting in your cart at <strong>${escapeHtml(storeName)}</strong>, and we saved them just for you.<br><br>No rush, but they won't wait forever ${showEmoji ? '⏰' : ''}`

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your cart is waiting at ${escapeHtml(storeName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px -30px rgba(79, 70, 229, 0.5);">
          <tr>
            <td style="background: radial-gradient(120% 120% at 50% 0%, #a5b4fc 0%, #6366f1 40%, #4f46e5 100%); padding: 40px 32px; text-align: center;">
              <div style="font-size: 42px; line-height: 1; margin-bottom: 16px;">${showEmoji ? '🛒' : ''}</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;">Your cart is still waiting ${showEmoji ? '✨' : ''}</h1>
              <p style="margin: 12px 0 0; color: rgba(255,255,255,0.92); font-size: 16px;">Hey <strong>${escapeHtml(firstName)}</strong>, your picks are saved & ready for checkout.</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 15px; line-height: 1.9; color: #334155; margin-bottom: 28px;">
                ${textBody}
              </div>

              <div style="margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">Your selected ${itemCount > 1 ? 'items' : 'item'} ${showEmoji ? '💎' : ''}</h2>
                <p style="margin: 6px 0 0; font-size: 14px; color: #64748b;">Taken straight from your visit to <strong>${escapeHtml(storeName)}</strong></p>
              </div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${itemsHtml}
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 20px;">
                <tr>
                  <td style="text-align: right; font-size: 16px; color: #475569;">Subtotal</td>
                  <td style="text-align: right; font-size: 16px; font-weight: 700; color: #0f172a; width: 140px;">${escapeHtml(currencySymbol)}${Number(cartTotal || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 16px;">
                    <div style="border-top: 1px solid #f1f5f9;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 16px; text-align: right; font-size: 18px; font-weight: 700; color: #0f172a;">Total</td>
                  <td style="padding-top: 16px; text-align: right; font-size: 22px; font-weight: 800; color: #0f172a;">${escapeHtml(currencySymbol)}${Number(cartTotal || 0).toFixed(2)}</td>
                </tr>
              </table>

              ${
                opts?.offer
                  ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 28px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #f8f7ff 0%, #eef2ff 100%); border: 1px solid #c7d2fe; border-radius: 16px; padding: 26px; text-align: center;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; color: #4338ca; font-weight: 700;">Just for ${escapeHtml(firstName)}</div>
                    <div style="margin-top: 10px; font-size: 14px; color: #475569;">Use this personal code at checkout</div>
                    <div style="margin: 16px auto 0; display: inline-block; padding: 14px 36px; border-radius: 999px; background: #ffffff; border: 2px dashed #6366f1; font-size: 22px; font-weight: 800; letter-spacing: 0.4em; color: #312e81;">${escapeHtml(opts.offer.code)}</div>
                    <div style="margin-top: 14px; font-size: 15px; color: #475569;">
                      ${
                        opts.offer.type === 'percentage'
                          ? `${escapeHtml(String(opts.offer.value))}% off this cart — Save <strong>${escapeHtml(String(opts.offer.value))}%</strong> on this order`
                          : opts.offer.type === 'free_shipping'
                            ? 'Enjoy <strong>Free Shipping</strong> on this order'
                            : `${escapeHtml(currencySymbol)}${Number(opts.offer.value).toFixed(2)} off this cart — Save <strong>${escapeHtml(currencySymbol)}${Number(opts.offer.value).toFixed(2)}</strong> on this order`
                      }
                    </div>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 32px;">
                <tr>
                  <td align="center">
                    <a href="${safeHref(opts?.checkoutUrl || cartUrl)}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; padding: 16px 56px; border-radius: 999px; font-weight: 700; font-size: 16px; box-shadow: 0 18px 40px -20px rgba(79, 70, 229, 0.9);">Complete Your Order ${showEmoji ? '→' : ''}</a>
                    <div style="margin-top: 10px; font-size: 13px; color: #94a3b8;">Secure checkout • Takes less than a minute</div>
                  </td>
                </tr>
                ${
                  opts?.bargainUrl
                    ? `
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <a href="${safeHref(opts.bargainUrl)}" style="display: inline-block; background: #ffffff; color: #4338ca; text-decoration: none; padding: 14px 40px; border-radius: 999px; font-weight: 700; font-size: 15px; border: 1px solid #c7d2fe;">${showEmoji ? '💬' : ''} Prefer to name your price? Make an offer →</a>
                    <div style="margin-top: 10px; font-size: 13px; color: #94a3b8;">Tell us what works for you — we usually meet you there.</div>
                  </td>
                </tr>
                `
                    : ''
                }
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 36px;">
                <tr>
                  <td align="center" style="border-top: 1px solid #f1f5f9; padding-top: 24px;">
                    <div style="font-size: 12px; color: #94a3b8; line-height: 1.8;">You're receiving this because you left items in your cart at <strong>${escapeHtml(storeName)}</strong>.<br><a href="${safeHref(unsubscribeUrl || `${cartUrl}?unsubscribe=true`)}" style="color: #94a3b8;">Unsubscribe from these reminders</a><br>© ${new Date().getFullYear()} ${escapeHtml(storeName)}. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
  },

  withDiscount: (customerName: string, items: any[], cartTotal: number, discountCode: string, discountPercent: number, cartUrl: string, storeName: string, currencySymbol = '₹', unsubscribeUrl?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .discount-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; }
    .discount-code { background: white; color: #333; padding: 15px 30px; font-size: 24px; font-weight: bold; border-radius: 8px; display: inline-block; margin: 15px 0; letter-spacing: 2px; }
    .cta-button { display: inline-block; background: #4f46e5; color: white; padding: 15px 40px; text-decoration: none; border-radius: 999px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>A Special Offer Just For You! ✨</h1>
    <p>Hi ${escapeHtml(customerName) || 'there'}, we noticed you left items in your cart. Here's <strong>${escapeHtml(discountPercent)}% off</strong> to complete your order!</p>

    <div class="discount-box">
      <div>Use code at checkout:</div>
      <div class="discount-code">${escapeHtml(discountCode)}</div>
      <div>Save ${escapeHtml(currencySymbol)}${(cartTotal * discountPercent / 100).toFixed(2)} instantly!</div>
    </div>

    <div style="text-align: center;">
      <a href="${safeHref(cartUrl)}" class="cta-button">Claim Your Discount →</a>
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
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; text-align: center; }
    .product-image { max-width: 100%; height: auto; border-radius: 12px; margin: 20px 0; }
    .cta-button { display: inline-block; background: #22c55e; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Good News! ✨</h1>
    <p>Hi ${escapeHtml(customerName) || 'there'},</p>
    <p><strong>${escapeHtml(productName)}</strong> is back in stock!</p>
    <img src="${safeImageSrc(productImage)}" alt="${escapeHtml(productName)}" class="product-image">
    <br>
    <a href="${safeHref(cartUrl)}" class="cta-button">Grab It Before It's Gone →</a>
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
    subject: `Your cart is still waiting ✨`,
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
    subject: `${discountPercent}% off just for you ✨`,
    html,
    text,
  })
}
