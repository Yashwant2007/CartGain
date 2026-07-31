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

const MESSAGING_VARS: Record<string, string> = {
  FROM_EMAIL: 'Sender email for transactional emails',
  RESEND_API_KEY: 'Resend API key for email delivery',
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
  const vars: Record<string, string> =
    scope === 'core' ? CORE_VARS :
    scope === 'payments' ? PAYMENT_VARS :
    scope === 'ai' ? AI_VARS :
    MESSAGING_VARS

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
