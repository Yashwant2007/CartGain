import { sendEmail } from '@/lib/services/email'
import { redactSensitive } from '@/lib/data-protection'

const ALERT_EMAIL = process.env.ALERT_EMAIL || ''

export async function sendAlert(
  subject: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  if (!ALERT_EMAIL) {
    console.warn(`[ALERT NOT SENT — ALERT_EMAIL not configured] ${subject}`)
    return
  }

  const contextHtml = context
    ? `<pre style="background:#f1f5f9;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px;">${JSON.stringify(redactSensitive(context), null, 2)}</pre>`
    : ''

  await sendEmail({
    to: ALERT_EMAIL,
    subject: `[CartGain Alert] ${subject}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <div style="border-left:4px solid #ef4444;padding-left:16px;margin-bottom:16px;">
      <h1 style="font-size:20px;margin:0;color:#dc2626;">⚠️ ${subject}</h1>
      <p style="color:#64748b;font-size:13px;margin:4px 0 0;">${new Date().toISOString()}</p>
    </div>
    <p style="color:#334155;line-height:1.6;white-space:pre-wrap;">${message}</p>
    ${contextHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="font-size:12px;color:#94a3b8;">CartGain Monitoring · Environment: ${process.env.NODE_ENV || 'unknown'}</p>
  </div>
</body>
</html>`,
  })
}

export async function sendAlertOnError(
  label: string,
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const errMsg = error instanceof Error ? error.message : String(error)
  const errStack = error instanceof Error ? error.stack : undefined
  await sendAlert(
    `Error in ${label}`,
    errStack ? `${errMsg}\n\n${redactSensitive(errStack)}` : errMsg,
    context ? redactSensitive(context) : undefined
  )
}
