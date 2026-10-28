/**
 * Runtime environment variable validation.
 * Call assertEnv() at the entry point of a subsystem so a missing variable
 * fails loudly with a descriptive error instead of failing silently mid-request.
 */

const CORE_VARS: Record<string, string> = {
  DATABASE_URL: 'PostgreSQL connection string (Supabase)',
  NEXTAUTH_SECRET: 'NextAuth signing secret (openssl rand -base64 32)',
  NEXTAUTH_URL: 'Base URL of the app',
  ENCRYPTION_KEY: 'Key used to encrypt stored API keys/secrets (openssl rand -base64 32)',
}

const PAYMENT_VARS: Record<string, string> = {
  RAZORPAY_KEY_ID: 'Razorpay API key id',
  RAZORPAY_KEY_SECRET: 'Razorpay API key secret',
  RAZORPAY_WEBHOOK_SECRET: 'Razorpay webhook signature secret',
}

const AI_VARS: Record<string, string> = {
  OPENAI_API_KEY: 'OpenAI API key for AI-powered recovery content',
}

// Optional fallback for any OpenAI-compatible provider. Only used when the
// primary OpenAI key is missing/out of credits (Groq by default). Overrides:
//   AI_FALLBACK_API_KEY  → required to activate the fallback tier
//   AI_FALLBACK_BASE_URL → default https://api.groq.com/openai/v1
//   AI_FALLBACK_MODEL    → default openai/gpt-oss-120b
export const OPTIONAL_AI_VARS: Record<string, string> = {
  AI_FALLBACK_API_KEY: 'OpenAI-compatible provider key (fallback when OpenAI is unavailable)',
  AI_FALLBACK_BASE_URL: 'OpenAI-compatible base URL (default Groq)',
  AI_FALLBACK_MODEL: 'Fallback model id (default openai/gpt-oss-120b)',
  AI_RATE_LIMIT_COOLDOWN_MS: 'How long a 429 provider stays out of rotation (default 30000)',
}

// Optional operational/infrastructure variables. The app degrades gracefully
// without them (Redis → in-process rate limiting/queue; SMTP → Resend-only;
// WhatsApp inbound → dropped with a warning), but they are required for full
// production behaviour, so they are reported rather than silently ignored.
export const OPTIONAL_INFRA_VARS: Record<string, string> = {
  REDIS_URL: 'Redis connection string (rate limiting + background queue)',
  EMAIL_SERVER_HOST: 'SMTP fallback host for transactional email',
  EMAIL_SERVER_USER: 'SMTP fallback username',
  EMAIL_SERVER_PASSWORD: 'SMTP fallback password',
  WHATSAPP_APP_SECRET: 'Meta app secret used to verify inbound WhatsApp webhooks',
  WHATSAPP_VERIFY_TOKEN: 'Meta webhook verify token',
}

function missingNames(vars: Record<string, string>): string[] {
  return Object.entries(vars)
    .filter(([name]) => !process.env[name])
    .map(([name, description]) => `${name} (${description})`)
}

/**
 * Throws a descriptive Error listing every missing variable in the scope.
 * Safe to call anywhere — returns the list instead of throwing when `silent`.
 */
export function assertEnv(
  scope: 'core' | 'payments' | 'ai' | 'messaging',
  opts: { silent?: boolean } = {}
): string[] {
  // Email can be served by Resend OR an SMTP relay. Requiring both wrongly
  // fails a valid SMTP-only setup, so 'messaging' passes when EITHER channel
  // is fully configured.
  if (scope === 'messaging') {
    const missing: string[] = []
    if (!process.env.FROM_EMAIL) {
      missing.push('FROM_EMAIL (Sender email for transactional emails)')
    }
    const hasResend = Boolean(process.env.RESEND_API_KEY)
    const hasSmtp = Boolean(
      process.env.EMAIL_SERVER_HOST &&
      process.env.EMAIL_SERVER_USER &&
      process.env.EMAIL_SERVER_PASSWORD,
    )
    if (!hasResend && !hasSmtp) {
      missing.push(
        'RESEND_API_KEY (Resend API key) — or a complete SMTP fallback ' +
        '(EMAIL_SERVER_HOST + EMAIL_SERVER_USER + EMAIL_SERVER_PASSWORD)',
      )
    }
    if (missing.length > 0 && !opts.silent) {
      throw new Error(
        `CartGain is not configured: missing required environment variable(s) for [messaging]:\n` +
        missing.map(m => `  - ${m}`).join('\n') +
        '\nAdd them to your environment (Vercel project settings or .env) and redeploy.'
      )
    }
    return missing
  }

  const vars: Record<string, string> =
    scope === 'core' ? CORE_VARS :
    scope === 'payments' ? PAYMENT_VARS :
    AI_VARS

  const missing = missingNames(vars)
  if (missing.length > 0 && !opts.silent) {
    throw new Error(
      `CartGain is not configured: missing required environment variable(s) for [${scope}]:\n` +
      missing.map(m => `  - ${m}`).join('\n') +
      '\nAdd them to your environment (Vercel project settings or .env) and redeploy.'
    )
  }
  return missing
}

/** Returns a required variable or throws a descriptive error immediately. */
export function requireEnv(name: string, purpose: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name} (needed for ${purpose}). ` +
      `Set it in Vercel project settings or .env and redeploy.`
    )
  }
  return value
}
