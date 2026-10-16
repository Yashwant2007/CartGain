import { sendEmail } from '@/lib/services/email'

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://cart-gain.com'
}

function shell({ heading, body, cta, link, footer }: {
  heading: string
  body: string
  cta: string
  link: string
  footer: string
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
        .container { max-width: 480px; margin: 40px auto; padding: 32px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; }
        h1 { font-size: 20px; text-align: center; margin-bottom: 16px; }
        .btn { display: block; width: 200px; margin: 24px auto; padding: 12px 24px; background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: 600; }
        .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 32px; }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="${appBaseUrl()}/logo.png" alt="CartGain" width="160" style="display:block;margin:0 auto 24px;width:160px;max-width:60%;height:auto;border-radius:12px;" />
        <h1>${heading}</h1>
        <p style="text-align: center; color: #94a3b8;">${body}</p>
        <a href="${link}" class="btn">${cta}</a>
        <p style="text-align: center; font-size: 12px; color: #64748b;">Or copy this link: ${link}</p>
        <div class="footer"><p>${footer}</p></div>
      </div>
    </body>
    </html>
  `
}

export function buildVerifyEmailLink(email: string, token: string): string {
  return `${appBaseUrl()}/verify-email?token=${token}&email=${encodeURIComponent(email)}`
}

export function buildPasswordResetLink(email: string, token: string): string {
  return `${appBaseUrl()}/reset-password?token=${token}&email=${encodeURIComponent(email)}`
}

export async function sendVerificationEmail(email: string, token: string) {
  const link = buildVerifyEmailLink(email, token)
  return sendEmail({
    to: email,
    subject: 'Verify your email address',
    html: shell({
      heading: 'Welcome to CartGain!',
      body: 'Click the button below to verify your email and start recovering abandoned carts.',
      cta: 'Verify Email',
      link,
      footer: 'This link expires in 24 hours.',
    }),
    text: `Verify your email: ${link}`,
  })
}

// Sent after a successful password change or reset so the account owner is
// alerted to credential changes they did not make (the earliest signal of
// account takeover). No token or link is included.
export async function sendPasswordChangedEmail(email: string) {
  const link = `${appBaseUrl()}/login`
  return sendEmail({
    to: email,
    subject: 'Your CartGain password was changed',
    html: shell({
      heading: 'Password changed',
      body: 'Your CartGain password was successfully changed. If this was you, no action is needed. If you did not make this change, reset your password immediately and contact support.',
      cta: 'Sign in',
      link,
      footer: 'For your security, all other sessions have been signed out.',
    }),
    text: `Your CartGain password was changed. If this was not you, reset your password immediately: ${link}`,
  })
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const link = buildPasswordResetLink(email, token)
  return sendEmail({
    to: email,
    subject: 'Reset your password',
    html: shell({
      heading: 'Reset your password',
      body: 'Click the button below to reset your password. This link expires in 1 hour.',
      cta: 'Reset Password',
      link,
      footer: "If you didn't request this, you can safely ignore this email.",
    }),
    text: `Reset your password: ${link}`,
  })
}
